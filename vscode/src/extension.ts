/**
 * extension.ts — Bawbel Scanner VS Code Extension v1.1.0
 *
 * This file is the ONLY entry point. It is intentionally thin:
 *   - Wires modules together
 *   - Registers commands, events, providers
 *   - Delegates all work to feature modules
 *
 * CONTRIBUTING:
 *   - Adding a new command? Register it here, implement it in features/.
 *   - Adding a new UI element? Implement it in ui/, import here.
 *   - NEVER add business logic directly in this file.
 *   - Keep this file under 250 lines. If it grows, extract a module.
 *
 * Module map:
 *   core/types.ts        — shared types and constants
 *   core/cli.ts          — binary discovery, process execution
 *   core/parser.ts       — CLI output normalisation
 *   core/suppressions.ts — .bawbel-suppress.json read/write
 *   core/remediation.ts  — inline "How to fix" hints per rule
 *   features/scanner.ts  — scan orchestration (auto / full / watch)
 *   features/diagnostics.ts — VS Code diagnostic rendering
 *   features/codeActions.ts — right-click quick-fix actions
 *   ui/statusBar.ts      — status bar item
 *   ui/reportPanel.ts    — bawbel report webview
 */

import * as path from "path";
import * as vscode from "vscode";

import { findBawbel, installBawbel, getBawbelVersion, setLog } from "./core/cli";
import { addSuppression, removeSuppression, loadSuppressions, getSuppressFilePath } from "./core/suppressions";
import {
  BawbelFinding,
  SCAN_EXTENSIONS_DEFAULT,
  OUTPUT_CHANNEL,
  SUPPRESS_FILE,
  PIRANHA_BASE,
} from "./core/types";

import { Scanner, autoScanRequest, fullWorkspaceScanRequest, fullFolderScanRequest } from "./features/scanner";
import { DiagnosticsManager } from "./features/diagnostics";
import { BawbelCodeActionProvider } from "./features/codeActions";
import { StatusBarManager } from "./ui/statusBar";
import { ReportPanel } from "./ui/reportPanel";

// ── Extension-level state ─────────────────────────────────────────────────────

let log:         vscode.OutputChannel;
let statusBar:   StatusBarManager;
let diagnostics: DiagnosticsManager;
let scanner:     Scanner | null = null;
let bawbelPath:  string  | null = null;

// ── Activation ────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log       = vscode.window.createOutputChannel(OUTPUT_CHANNEL);
  statusBar = new StatusBarManager();
  diagnostics = new DiagnosticsManager(
    vscode.languages.createDiagnosticCollection("bawbel")
  );

  setLog(log);
  log.appendLine("Bawbel Scanner v1.1.0 activating...");

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    [
      { scheme: "file", language: "markdown" },
      { scheme: "file", language: "yaml" },
      { scheme: "file", language: "json" },
      { scheme: "file", pattern: "**/*.{md,yaml,yml,json,txt}" },
    ],
    new BawbelCodeActionProvider(diagnostics),
    { providedCodeActionKinds: BawbelCodeActionProvider.PROVIDED_KINDS }
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bawbel.scanFile",          cmdScanFile),
    vscode.commands.registerCommand("bawbel.scanWorkspace",     cmdScanWorkspace),
    vscode.commands.registerCommand("bawbel.scanFolder",        cmdScanFolder),
    vscode.commands.registerCommand("bawbel.startWatch",        cmdStartWatch),
    vscode.commands.registerCommand("bawbel.stopWatch",         cmdStopWatch),
    vscode.commands.registerCommand("bawbel.showReport",        cmdShowReport),
    vscode.commands.registerCommand("bawbel.suppressFinding",   cmdSuppressFinding),
    vscode.commands.registerCommand("bawbel.unsuppressFinding", cmdUnsuppressFinding),
    vscode.commands.registerCommand("bawbel.showSuppressions",  cmdShowSuppressions),
    vscode.commands.registerCommand("bawbel.installCLI",        cmdInstallCLI),
    vscode.commands.registerCommand("bawbel.openPiranhaDB",     cmdOpenPiranhaDB),
    vscode.commands.registerCommand("bawbel.clearAndRescan",    cmdClearAndRescan),
    vscode.workspace.onDidSaveTextDocument(onDidSave),
    vscode.window.onDidChangeActiveTextEditor(onEditorChange),
    codeActionProvider,
    { dispose: () => scanner?.stopWatch() }
  );

  bawbelPath = await ensureCLI();
  if (!bawbelPath) { return; }

  scanner = new Scanner(bawbelPath, log);
  const version = await getBawbelVersion(bawbelPath);
  log.appendLine(`Bawbel Scanner v1.1.0 ready — CLI: ${version ?? "unknown"}`);
  log.appendLine(`Suppressions: ${getSuppressFilePath() ?? "(no workspace)"}`);

  const config = vscode.workspace.getConfiguration("bawbel");
  if (config.get<boolean>("watchMode", false)) {
    await cmdStartWatch();
  }
}

export function deactivate(): void {
  scanner?.stopWatch();
}

// ── CLI setup ─────────────────────────────────────────────────────────────────

async function ensureCLI(): Promise<string | null> {
  const found = await findBawbel();
  if (found) { return found; }

  const choice = await vscode.window.showInformationMessage(
    "Bawbel Scanner: CLI not found. Install bawbel-scanner now?",
    "Install", "Not now"
  );
  if (choice !== "Install") { return null; }

  statusBar.update("installing");
  const ok = await installBawbel(log);
  statusBar.update("idle");

  if (!ok) {
    vscode.window.showErrorMessage("Bawbel: install failed. See Output panel.");
    return null;
  }

  vscode.window.showInformationMessage("Bawbel Scanner installed ✓");
  return findBawbel();
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdScanFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showInformationMessage("Bawbel: no active file to scan."); return; }
  await runScan(autoScanRequest(editor.document.fileName));
}

async function cmdScanWorkspace(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) { vscode.window.showInformationMessage("Bawbel: no workspace folder open."); return; }
  log.show(true);
  await runScan(fullWorkspaceScanRequest(folder.uri.fsPath));
}

async function cmdScanFolder(): Promise<void> {
  const result = await vscode.window.showOpenDialog({
    canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
    openLabel: "Scan this folder",
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!result || result.length === 0) { return; }
  log.show(true);
  await runScan(fullFolderScanRequest(result[0].fsPath));
}

async function cmdStartWatch(): Promise<void> {
  if (!scanner) { return; }
  if (scanner.isWatching) { vscode.window.showInformationMessage("Bawbel: watch mode already active."); return; }

  const config = vscode.workspace.getConfiguration("bawbel");
  const scope  = config.get<string>("watchScope", "workspace") as "file" | "folder" | "workspace";

  let target: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  if (scope === "file") {
    target = vscode.window.activeTextEditor?.document.fileName ?? target;
  } else if (scope === "folder") {
    const pick = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      openLabel: "Watch this folder",
    });
    if (!pick || pick.length === 0) { return; }
    target = pick[0].fsPath;
  }

  if (!target) { return; }

  scanner.startWatch(scope, target,
    results => { diagnostics.applyResults(results); refreshStatusBar(); },
    status  => {
      if (status === "started") {
        statusBar.update("watching");
        vscode.window.showInformationMessage(`Bawbel: watch mode started (${scope})`);
      } else if (status === "error") {
        statusBar.update("error");
      } else {
        refreshStatusBar();
      }
    }
  );
}

function cmdStopWatch(): void {
  scanner?.stopWatch();
  refreshStatusBar();
  vscode.window.showInformationMessage("Bawbel: watch mode stopped.");
}

async function cmdShowReport(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showInformationMessage("Bawbel: open a file to view its report."); return; }
  if (!bawbelPath) { return; }
  await ReportPanel.show(bawbelPath, editor.document.fileName, log);
}

async function cmdSuppressFinding(filePath: string, finding: BawbelFinding): Promise<void> {
  const reason = await vscode.window.showInputBox({
    prompt:      `Suppress ${finding.rule_id} on line ${finding.line} — why is this a false positive?`,
    placeHolder: "e.g. documentation example, test fixture, intentional pattern",
    value:       "false positive",
  });
  if (reason === undefined) { return; }
  await addSuppression(filePath, finding, reason);
  diagnostics.reRender(filePath);
  refreshStatusBar();
  vscode.window.showInformationMessage(`Suppressed ${finding.rule_id}:${finding.line} — saved to ${SUPPRESS_FILE}`);
  log.appendLine(`[suppress] ${finding.rule_id} in ${filePath}:${finding.line} — "${reason}"`);
}

function cmdUnsuppressFinding(filePath: string, finding: BawbelFinding): void {
  removeSuppression(filePath, finding);
  diagnostics.reRender(filePath);
  refreshStatusBar();
  vscode.window.showInformationMessage(`Suppression removed for ${finding.rule_id}:${finding.line}`);
  log.appendLine(`[suppress] removed ${finding.rule_id} in ${filePath}:${finding.line}`);
}

function cmdShowSuppressions(): void {
  const suppressions = loadSuppressions();
  if (suppressions.length === 0) { vscode.window.showInformationMessage("Bawbel: no active suppressions."); return; }
  log.show(true);
  log.appendLine(`\n=== Active Suppressions (${SUPPRESS_FILE}) ===`);
  for (const s of suppressions) {
    log.appendLine(`  ${s.file}:${s.line}  [${s.rule_id}]  reason: "${s.reason}"  (${s.suppressed_at.slice(0,10)})`);
  }
  log.appendLine(`Total: ${suppressions.length}`);
}

async function cmdInstallCLI(): Promise<void> {
  statusBar.update("installing");
  const ok = await installBawbel(log);
  if (ok) {
    bawbelPath = await findBawbel();
    if (bawbelPath) { scanner = new Scanner(bawbelPath, log); }
    vscode.window.showInformationMessage("Bawbel Scanner CLI installed ✓");
  } else {
    vscode.window.showErrorMessage("Bawbel: install failed. See Output panel.");
  }
  refreshStatusBar();
}

function cmdOpenPiranhaDB(): void {
  vscode.env.openExternal(vscode.Uri.parse(PIRANHA_BASE));
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function cmdClearAndRescan(filePath: string): Promise<void> {
  // Called after inline bawbel-ignore comment is inserted.
  // Clears the stale diagnostic immediately, then re-scans so the
  // CLI can confirm the suppression (once CLI supports ignore comments).
  diagnostics.clearFile(filePath);
  refreshStatusBar();

  // Small delay to let the WorkspaceEdit settle before re-scanning
  await new Promise(resolve => setTimeout(resolve, 300));
  await runScan(autoScanRequest(filePath));
}

async function onDidSave(document: vscode.TextDocument): Promise<void> {
  if (scanner?.isWatching) { return; }
  const config = vscode.workspace.getConfiguration("bawbel");
  if (!config.get<boolean>("scanOnSave", true)) { return; }
  const exts = config.get<string[]>("scanExtensions", SCAN_EXTENSIONS_DEFAULT);
  if (!exts.includes(path.extname(document.fileName).toLowerCase())) { return; }
  await runScan(autoScanRequest(document.fileName));
}

function onEditorChange(_editor: vscode.TextEditor | undefined): void {
  refreshStatusBar();
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function runScan(request: Parameters<Scanner["scan"]>[0]): Promise<void> {
  if (!scanner) {
    bawbelPath = await ensureCLI();
    if (!bawbelPath) { return; }
    scanner = new Scanner(bawbelPath, log);
  }
  statusBar.update("scanning");
  await scanner.scan(request, results => {
    diagnostics.applyResults(results);
    refreshStatusBar();
  });
}

function refreshStatusBar(): void {
  const count = diagnostics.countActiveFindings();
  if (count > 0) {
    statusBar.update("findings", count);
  } else if (scanner?.isWatching) {
    statusBar.update("watching");
  } else {
    statusBar.update("idle");
  }
}