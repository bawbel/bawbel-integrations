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

export class DiagnosticsManager {
  private collection: vscode.DiagnosticCollection;

  constructor(collection: vscode.DiagnosticCollection) {
    this.collection = collection;
  }

  /**
   * Apply scan results as VS Code diagnostics.
   * Caches raw findings for later suppression re-rendering.
   */
  applyResults(results: BawbelFileResult[]): void {
    for (const result of results) {
      const uri = vscode.Uri.file(result.file_path);
      rawCache.set(uri.toString(), {
        filePath: result.file_path,
        findings: result.findings ?? [],
      });
      this.renderDiagnostics(result.file_path, result.findings ?? []);
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
