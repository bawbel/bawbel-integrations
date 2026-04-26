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
        // ── Suppress action ───────────────────────────────────────────────
        const suppress        = new vscode.CodeAction(
          `$(circle-slash) Suppress: false positive — ${finding.rule_id}`,
          vscode.CodeActionKind.QuickFix
        );
        suppress.command      = {
          command:   "bawbel.suppressFinding",
          title:     "Suppress finding",
          arguments: [filePath, finding],
        };
        suppress.diagnostics  = [diag];
        suppress.isPreferred  = false;
        actions.push(suppress);
      } else {
        // ── Remove suppression action ─────────────────────────────────────
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

      // ── PiranhaDB link action — always shown ──────────────────────────
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
