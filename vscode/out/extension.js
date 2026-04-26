"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
// ── State ────────────────────────────────────────────────────────────────────
let diagnosticCollection;
let statusBarItem;
let outputChannel;
let cliPath = null;
let isScanning = false;
// ── Activation ───────────────────────────────────────────────────────────────
async function activate(context) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection("bawbel");
    outputChannel = vscode.window.createOutputChannel("Bawbel Scanner");
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = "bawbel.scanFile";
    statusBarItem.tooltip = "Bawbel Scanner — click to scan current file";
    updateStatusBar("idle");
    statusBarItem.show();
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand("bawbel.scanFile", cmdScanFile), vscode.commands.registerCommand("bawbel.scanWorkspace", cmdScanWorkspace), vscode.commands.registerCommand("bawbel.installCLI", cmdInstallCLI), vscode.commands.registerCommand("bawbel.openPiranhaDB", cmdOpenPiranhaDB), diagnosticCollection, statusBarItem, outputChannel);
    // Auto-scan on save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onDidSave));
    // Update status bar when active editor changes
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onEditorChange));
    // First-run: ensure CLI is installed
    await ensureCLI(context);
    outputChannel.appendLine("Bawbel Scanner v1.0.0 activated.");
    outputChannel.appendLine("Scan any .md .yaml .yml .json .txt file — findings appear as inline diagnostics.");
}
function deactivate() { }
// ── CLI Management ───────────────────────────────────────────────────────────
async function ensureCLI(context) {
    const python = await findPython();
    if (!python) {
        showCLINotFound();
        return false;
    }
    // Check if bawbel-scanner is installed
    const check = await runCommand(python, ["-m", "bawbel", "--version"]);
    if (check.code === 0) {
        cliPath = python;
        outputChannel.appendLine(`CLI found: ${python} (${check.stdout.trim()})`);
        return true;
    }
    // First run — offer to install
    const config = vscode.workspace.getConfiguration("bawbel");
    const extras = config.get("extras", "all");
    const choice = await vscode.window.showInformationMessage("Bawbel Scanner: CLI not found. Install bawbel-scanner now?", "Install", "Not now");
    if (choice !== "Install") {
        return false;
    }
    return installCLI(python, extras);
}
async function installCLI(python, extras) {
    updateStatusBar("installing");
    outputChannel.show(true);
    outputChannel.appendLine(`Installing bawbel-scanner[${extras}]...`);
    const pkg = extras && extras !== "none"
        ? `bawbel-scanner[${extras}]`
        : "bawbel-scanner";
    const result = await runCommand(python, [
        "-m", "pip", "install", "--upgrade", pkg,
    ]);
    if (result.code === 0) {
        cliPath = python;
        updateStatusBar("idle");
        outputChannel.appendLine("Installation complete ✓");
        vscode.window.showInformationMessage("Bawbel Scanner installed ✓");
        return true;
    }
    else {
        updateStatusBar("error");
        outputChannel.appendLine(`Installation failed:\n${result.stderr}`);
        vscode.window.showErrorMessage(`Bawbel: installation failed. See Output panel for details.`);
        return false;
    }
}
async function findPython() {
    const config = vscode.workspace.getConfiguration("bawbel");
    const configured = config.get("pythonPath", "");
    if (configured) {
        return configured;
    }
    // Try Python extension's selected interpreter first
    const pythonExt = vscode.extensions.getExtension("ms-python.python");
    if (pythonExt) {
        const api = pythonExt.exports;
        const env = api?.environments?.getActiveEnvironmentPath?.();
        if (env?.path) {
            return env.path;
        }
    }
    // Try common paths
    for (const candidate of ["python3", "python", "python3.12", "python3.11"]) {
        const check = await runCommand(candidate, ["--version"]);
        if (check.code === 0) {
            return candidate;
        }
    }
    return null;
}
// ── Commands ─────────────────────────────────────────────────────────────────
async function cmdScanFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("Bawbel: no active file to scan.");
        return;
    }
    await scanFile(editor.document);
}
async function cmdScanWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showInformationMessage("Bawbel: no workspace folder open.");
        return;
    }
    const rootPath = folders[0].uri.fsPath;
    outputChannel.show(true);
    outputChannel.appendLine(`\nScanning workspace: ${rootPath}`);
    updateStatusBar("scanning");
    const python = await getPython();
    if (!python) {
        return;
    }
    const result = await runBawbel(python, [rootPath, "--recursive"]);
    if (result) {
        applyResults([result]);
        outputChannel.appendLine(formatSummary(result));
        updateStatusBarFromResults([result]);
    }
}
async function cmdInstallCLI() {
    const python = await findPython();
    if (!python) {
        vscode.window.showErrorMessage("Bawbel: Python not found. Install Python 3.10+ and try again.");
        return;
    }
    const config = vscode.workspace.getConfiguration("bawbel");
    const extras = config.get("extras", "all");
    await installCLI(python, extras);
}
function cmdOpenPiranhaDB() {
    vscode.env.openExternal(vscode.Uri.parse("https://api.piranha.bawbel.io"));
}
// ── Event Handlers ───────────────────────────────────────────────────────────
async function onDidSave(document) {
    const config = vscode.workspace.getConfiguration("bawbel");
    if (!config.get("scanOnSave", true)) {
        return;
    }
    const exts = config.get("scanExtensions", [
        ".md", ".yaml", ".yml", ".json", ".txt",
    ]);
    const ext = path.extname(document.fileName).toLowerCase();
    if (!exts.includes(ext)) {
        return;
    }
    await scanFile(document);
}
function onEditorChange(editor) {
    if (!editor) {
        return;
    }
    // Reflect existing diagnostics for the new active file
    const diags = diagnosticCollection.get(editor.document.uri) ?? [];
    if (diags.length > 0) {
        updateStatusBar("findings", diags.length);
    }
    else {
        updateStatusBar("idle");
    }
}
// ── Core Scan ────────────────────────────────────────────────────────────────
async function scanFile(document) {
    if (isScanning) {
        return;
    }
    const python = await getPython();
    if (!python) {
        return;
    }
    isScanning = true;
    updateStatusBar("scanning");
    try {
        const result = await runBawbel(python, [document.fileName]);
        if (result) {
            applyResults([result]);
            updateStatusBarFromResults([result]);
        }
    }
    finally {
        isScanning = false;
    }
}
async function runBawbel(python, args) {
    const fullArgs = ["-m", "bawbel", "scan", ...args, "--format", "json"];
    outputChannel.appendLine(`\n$ ${python} ${fullArgs.join(" ")}`);
    const result = await runCommand(python, fullArgs);
    if (result.code !== 0 && !result.stdout.trim()) {
        outputChannel.appendLine(`Error (exit ${result.code}): ${result.stderr}`);
        updateStatusBar("error");
        return null;
    }
    try {
        // bawbel outputs JSON to stdout
        const json = JSON.parse(result.stdout.trim());
        outputChannel.appendLine(`Found ${json.findings?.length ?? 0} finding(s) — risk ${json.risk_score ?? 0}/10`);
        return json;
    }
    catch {
        // Non-JSON (e.g. clean output with text format fallback)
        outputChannel.appendLine(result.stdout);
        return {
            file: args[0],
            findings: [],
            risk_score: 0,
        };
    }
}
// ── Diagnostics ───────────────────────────────────────────────────────────────
function applyResults(results) {
    const config = vscode.workspace.getConfiguration("bawbel");
    const failSev = config.get("failOnSeverity", "high");
    const failSevIndex = severityIndex(failSev.toUpperCase());
    const diagMap = new Map();
    for (const result of results) {
        const uri = vscode.Uri.file(result.file);
        const diags = [];
        for (const finding of result.findings ?? []) {
            const line = Math.max(0, (finding.line ?? 1) - 1);
            const col = Math.max(0, (finding.col ?? 1) - 1);
            const range = new vscode.Range(line, col, line, col + (finding.match?.length ?? 80));
            const sevIndex = severityIndex(finding.severity);
            const vsSeverity = sevIndex >= failSevIndex
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;
            const diag = new vscode.Diagnostic(range, `[${finding.ave_id}] ${finding.title} (CVSS-AI: ${finding.cvss_ai})`, vsSeverity);
            diag.source = "Bawbel Scanner";
            diag.code = {
                value: finding.ave_id,
                target: vscode.Uri.parse(`https://api.piranha.bawbel.io/records/${finding.ave_id}`),
            };
            diag.tags = finding.severity === "LOW"
                ? [vscode.DiagnosticTag.Unnecessary]
                : undefined;
            diags.push(diag);
        }
        diagMap.set(uri.toString(), diags);
        diagnosticCollection.set(uri, diags);
    }
}
function updateStatusBar(state, count) {
    const config = vscode.workspace.getConfiguration("bawbel");
    if (!config.get("showStatusBar", true)) {
        statusBarItem.hide();
        return;
    }
    switch (state) {
        case "idle":
            statusBarItem.text = "$(shield) Bawbel: ✓ clean";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.color = undefined;
            break;
        case "scanning":
            statusBarItem.text = "$(loading~spin) Bawbel: scanning…";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.color = undefined;
            break;
        case "findings":
            statusBarItem.text = `$(warning) Bawbel: ${count} finding(s)`;
            statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            break;
        case "error":
            statusBarItem.text = "$(error) Bawbel: error";
            statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
            break;
        case "installing":
            statusBarItem.text = "$(loading~spin) Bawbel: installing CLI…";
            statusBarItem.backgroundColor = undefined;
            break;
    }
    statusBarItem.show();
}
function updateStatusBarFromResults(results) {
    const total = results.reduce((n, r) => n + (r.findings?.length ?? 0), 0);
    if (total === 0) {
        updateStatusBar("idle");
    }
    else {
        updateStatusBar("findings", total);
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function severityIndex(sev) {
    return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 }[sev.toUpperCase()] ?? 0;
}
async function getPython() {
    if (cliPath) {
        return cliPath;
    }
    const python = await findPython();
    if (!python) {
        showCLINotFound();
        return null;
    }
    cliPath = python;
    return python;
}
function showCLINotFound() {
    vscode.window
        .showErrorMessage("Bawbel: Python not found. Install Python 3.10+ to use this extension.", "Install Python")
        .then((choice) => {
        if (choice === "Install Python") {
            vscode.env.openExternal(vscode.Uri.parse("https://www.python.org/downloads/"));
        }
    });
}
function formatSummary(result) {
    const n = result.findings?.length ?? 0;
    if (n === 0) {
        return `✓ ${path.basename(result.file)} — clean`;
    }
    const critical = result.findings.filter((f) => f.severity === "CRITICAL").length;
    const high = result.findings.filter((f) => f.severity === "HIGH").length;
    return (`✗ ${path.basename(result.file)} — ${n} finding(s)` +
        (critical ? ` | ${critical} CRITICAL` : "") +
        (high ? ` | ${high} HIGH` : "") +
        ` | risk ${result.risk_score}/10`);
}
function runCommand(cmd, args) {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        const proc = cp.spawn(cmd, args, { shell: process.platform === "win32" });
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("error", (err) => {
            resolve({ code: 1, stdout: "", stderr: err.message });
        });
        proc.on("close", (code) => {
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
}
//# sourceMappingURL=extension.js.map