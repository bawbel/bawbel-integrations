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
// ── Remediation hints ─────────────────────────────────────────────────────────
// Inline fix guidance per rule_id — no network call needed.
// Source: bawbel report output + AVE standard remediation field.
const REMEDIATION = {
    "bawbel-shell-pipe": "Remove curl|bash or similar pipe patterns. If code execution is needed, use a sandboxed tool with explicit user consent.",
    "bawbel-external-fetch": "Remove instructions to fetch from external URLs. Hard-code trusted sources or require explicit user approval before any fetch.",
    "bawbel-instruction-override": "Remove phrases that attempt to override the system prompt or ignore previous instructions. These are the core prompt injection vector.",
    "bawbel-memory-persistence": "Remove instructions to persist memory across sessions without user consent. Memory writes must be explicit and user-visible.",
    "bawbel-exfiltration": "Remove any instruction to send data to external endpoints. All outbound calls must be user-initiated and scoped.",
    "bawbel-role-impersonation": "Remove role-claim escalation patterns (e.g. 'you are now', 'act as root'). Roles must be set by the system prompt only.",
    "bawbel-mcp-tool-poison": "Audit MCP tool descriptions for embedded instructions. Tool descriptions must describe the tool only — no behavioral directives.",
    "bawbel-hidden-instruction": "Remove whitespace-hidden or unicode-obfuscated text. All content must be visible to the user who installs the skill.",
    "bawbel-rag-injection": "Sanitise RAG inputs before injecting into the prompt. Treat retrieved content as untrusted user input, not trusted instructions.",
    "bawbel-lateral-movement": "Remove references to accessing other agents, services, or systems not declared in the skill manifest.",
    "bawbel-content-type-mismatch": "The file content does not match its extension. Verify this is not a disguised binary or executable masquerading as a skill file.",
    "bawbel-a2a-injection": "Cross-agent messages must be validated before use. Never pass raw agent output into another agent's system prompt.",
};
function getRemediation(ruleId, description) {
    if (REMEDIATION[ruleId]) {
        return REMEDIATION[ruleId];
    }
    // Fallback: use the description field from the finding + PiranhaDB link
    return description || "Review the matched content and remove or sanitise the flagged pattern.";
}
// ── State ─────────────────────────────────────────────────────────────────────
let diagnosticCollection;
let statusBarItem;
let outputChannel;
let cliPath = null;
let isScanning = false;
// ── Activation ────────────────────────────────────────────────────────────────
async function activate(context) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection("bawbel");
    outputChannel = vscode.window.createOutputChannel("Bawbel Scanner");
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = "bawbel.scanFile";
    statusBarItem.tooltip = "Bawbel Scanner — click to scan | Cmd+Alt+B";
    updateStatusBar("idle");
    statusBarItem.show();
    context.subscriptions.push(vscode.commands.registerCommand("bawbel.scanFile", cmdScanFile), vscode.commands.registerCommand("bawbel.scanWorkspace", cmdScanWorkspace), vscode.commands.registerCommand("bawbel.installCLI", cmdInstallCLI), vscode.commands.registerCommand("bawbel.openPiranhaDB", cmdOpenPiranhaDB), diagnosticCollection, statusBarItem, outputChannel);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onDidSave), vscode.window.onDidChangeActiveTextEditor(onEditorChange));
    await ensureCLI();
    outputChannel.appendLine("Bawbel Scanner v1.0.1 activated.");
    outputChannel.appendLine("Save any .md .yaml .yml .json .txt — findings appear as inline diagnostics.");
}
function deactivate() { }
// ── CLI Management ────────────────────────────────────────────────────────────
async function ensureCLI() {
    const python = await findBawbel();
    if (python) {
        cliPath = python;
        const v = await runCommand(python, ["--version"]);
        outputChannel.appendLine(`CLI: ${python} — ${v.stdout.trim() || v.stderr.trim()}`);
        return true;
    }
    const choice = await vscode.window.showInformationMessage("Bawbel Scanner: CLI not found. Install bawbel-scanner now?", "Install", "Not now");
    if (choice !== "Install") {
        return false;
    }
    return installCLI();
}
async function installCLI() {
    const pip = await findPip();
    if (!pip) {
        vscode.window.showErrorMessage("Bawbel: pip not found. Install Python 3.10+.");
        return false;
    }
    updateStatusBar("installing");
    outputChannel.show(true);
    outputChannel.appendLine("Installing bawbel-scanner...");
    const result = await runCommand(pip, ["install", "--upgrade", "bawbel-scanner"]);
    if (result.code === 0) {
        const bawbel = await findBawbel();
        cliPath = bawbel;
        updateStatusBar("idle");
        outputChannel.appendLine("Installation complete ✓");
        vscode.window.showInformationMessage("Bawbel Scanner installed ✓");
        return true;
    }
    updateStatusBar("error");
    outputChannel.appendLine(`Failed:\n${result.stderr}`);
    vscode.window.showErrorMessage("Bawbel: install failed. See Output panel.");
    return false;
}
// Find `bawbel` binary (installed by pip as a script, not a module)
async function findBawbel() {
    const config = vscode.workspace.getConfiguration("bawbel");
    const configured = config.get("bawbelPath", "");
    if (configured) {
        return configured;
    }
    for (const candidate of ["bawbel", "/usr/local/bin/bawbel", `${process.env.HOME}/.local/bin/bawbel`]) {
        const check = await runCommand(candidate, ["--version"]);
        if (check.code === 0) {
            return candidate;
        }
    }
    return null;
}
async function findPip() {
    for (const c of ["pip3", "pip", "python3 -m pip"]) {
        if ((await runCommand(c.split(" ")[0], [...c.split(" ").slice(1), "--version"])).code === 0) {
            return c.split(" ")[0];
        }
    }
    return null;
}
// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdScanFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("Bawbel: no active file to scan.");
        return;
    }
    await scanFile(editor.document.fileName);
}
async function cmdScanWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showInformationMessage("Bawbel: no workspace folder open.");
        return;
    }
    outputChannel.show(true);
    await scanPath(folders[0].uri.fsPath, true);
}
async function cmdInstallCLI() { await installCLI(); }
function cmdOpenPiranhaDB() {
    vscode.env.openExternal(vscode.Uri.parse("https://api.piranha.bawbel.io"));
}
// ── Event Handlers ────────────────────────────────────────────────────────────
async function onDidSave(document) {
    const config = vscode.workspace.getConfiguration("bawbel");
    if (!config.get("scanOnSave", true)) {
        return;
    }
    const exts = config.get("scanExtensions", [".md", ".yaml", ".yml", ".json", ".txt"]);
    if (!exts.includes(path.extname(document.fileName).toLowerCase())) {
        return;
    }
    await scanFile(document.fileName);
}
function onEditorChange(editor) {
    if (!editor) {
        return;
    }
    const diags = diagnosticCollection.get(editor.document.uri) ?? [];
    diags.length > 0
        ? updateStatusBar("findings", diags.length)
        : updateStatusBar("idle");
}
// ── Core Scan ─────────────────────────────────────────────────────────────────
async function scanFile(filePath) {
    await scanPath(filePath, false);
}
async function scanPath(targetPath, recursive) {
    if (isScanning) {
        return;
    }
    if (!cliPath) {
        await ensureCLI();
        if (!cliPath) {
            return;
        }
    }
    isScanning = true;
    updateStatusBar("scanning");
    try {
        const args = ["scan", targetPath, "--format", "json"];
        if (recursive) {
            args.push("--recursive");
        }
        outputChannel.appendLine(`\n$ ${cliPath} ${args.join(" ")}`);
        const res = await runCommand(cliPath, args);
        outputChannel.appendLine(`exit: ${res.code}`);
        if (res.stderr.trim()) {
            outputChannel.appendLine(`stderr: ${res.stderr.trim()}`);
        }
        // exit 0 = clean, 1/2 = findings — all valid
        const raw = res.stdout.trim();
        if (!raw) {
            outputChannel.appendLine("No output — scan may have failed. Check stderr above.");
            updateStatusBar("error");
            return;
        }
        // Real output format: JSON array starting with [
        const jsonStart = raw.indexOf("[");
        if (jsonStart < 0) {
            // Might be an error message — show it
            outputChannel.appendLine(`Unexpected output: ${raw.slice(0, 300)}`);
            updateStatusBar("error");
            return;
        }
        let results;
        try {
            results = JSON.parse(raw.slice(jsonStart));
        }
        catch (e) {
            outputChannel.appendLine(`JSON parse error: ${e}`);
            outputChannel.appendLine(`Raw: ${raw.slice(0, 300)}`);
            updateStatusBar("error");
            return;
        }
        // Clear old diagnostics for scanned files
        for (const r of results) {
            diagnosticCollection.set(vscode.Uri.file(r.file_path), []);
        }
        let totalFindings = 0;
        for (const r of results) {
            applyResult(r);
            totalFindings += r.findings?.length ?? 0;
            outputChannel.appendLine(formatSummary(r));
        }
        totalFindings > 0
            ? updateStatusBar("findings", totalFindings)
            : updateStatusBar("idle");
    }
    finally {
        isScanning = false;
    }
}
// ── Diagnostics ───────────────────────────────────────────────────────────────
function applyResult(result) {
    const config = vscode.workspace.getConfiguration("bawbel");
    const failSevIdx = severityIndex(config.get("failOnSeverity", "high").toUpperCase());
    const uri = vscode.Uri.file(result.file_path);
    const diags = [];
    for (const f of result.findings ?? []) {
        const line = Math.max(0, (f.line ?? 1) - 1);
        const col = Math.max(0, (f.col ?? 1) - 1);
        const len = f.match?.length ?? 80;
        const range = new vscode.Range(line, col, line, col + len);
        const vsSev = severityIndex(f.severity) >= failSevIdx
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
        const emoji = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵" }[f.severity] ?? "⚪";
        const fix = getRemediation(f.rule_id, f.description);
        const owasp = f.owasp?.join(", ") ?? "";
        // Multi-line message — shows in hover tooltip and Problems panel
        const msg = [
            `${emoji} [${f.severity}] ${f.title}`,
            ``,
            f.match ? `Matched: "${f.match.slice(0, 100)}"` : "",
            ``,
            `How to fix:`,
            `  ${fix}`,
            ``,
            `AVE: ${f.ave_id}  |  CVSS-AI: ${f.cvss_ai}/10  |  Engine: ${f.engine}`,
            owasp ? `OWASP: ${owasp}` : "",
            `Details: https://api.piranha.bawbel.io/records/${f.ave_id}`,
        ].filter(s => s !== undefined).join("\n");
        const diag = new vscode.Diagnostic(range, msg, vsSev);
        diag.source = "Bawbel";
        diag.code = {
            value: f.ave_id,
            target: vscode.Uri.parse(`https://api.piranha.bawbel.io/records/${f.ave_id}`),
        };
        if (f.severity === "LOW") {
            diag.tags = [vscode.DiagnosticTag.Unnecessary];
        }
        diags.push(diag);
    }
    diagnosticCollection.set(uri, diags);
}
function updateStatusBar(state, count) {
    if (!vscode.workspace.getConfiguration("bawbel")
        .get("showStatusBar", true)) {
        statusBarItem.hide();
        return;
    }
    switch (state) {
        case "idle":
            statusBarItem.text = "$(shield) Bawbel: ✓ clean";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.color = undefined;
            statusBarItem.tooltip = "Bawbel Scanner — no findings";
            break;
        case "scanning":
            statusBarItem.text = "$(loading~spin) Bawbel: scanning…";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.color = undefined;
            break;
        case "findings":
            statusBarItem.text = `$(warning) Bawbel: ${count} finding(s)`;
            statusBarItem.backgroundColor =
                new vscode.ThemeColor("statusBarItem.warningBackground");
            statusBarItem.tooltip = "Bawbel Scanner — click to scan current file";
            break;
        case "error":
            statusBarItem.text = "$(error) Bawbel: error";
            statusBarItem.backgroundColor =
                new vscode.ThemeColor("statusBarItem.errorBackground");
            statusBarItem.tooltip = "Bawbel Scanner — check Output panel";
            break;
        case "installing":
            statusBarItem.text = "$(loading~spin) Bawbel: installing…";
            statusBarItem.backgroundColor = undefined;
            break;
    }
    statusBarItem.show();
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function severityIndex(sev) {
    return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 }[sev.toUpperCase()] ?? 0;
}
function formatSummary(result) {
    const n = result.findings?.length ?? 0;
    const name = path.basename(result.file_path);
    if (n === 0) {
        return `  ✓ ${name} — clean (${result.scan_time_ms}ms)`;
    }
    const bySev = result.findings.reduce((acc, f) => {
        acc[f.severity] = (acc[f.severity] ?? 0) + 1;
        return acc;
    }, {});
    const sevStr = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        .filter(s => bySev[s])
        .map(s => `${bySev[s]} ${s}`)
        .join(" | ");
    return `  ✗ ${name} — ${n} finding(s): ${sevStr} | risk ${result.risk_score}/10 (${result.scan_time_ms}ms)`;
}
function runCommand(cmd, args) {
    return new Promise(resolve => {
        let stdout = "", stderr = "";
        const proc = cp.spawn(cmd, args, { shell: process.platform === "win32" });
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("error", err => resolve({ code: 1, stdout: "", stderr: err.message }));
        proc.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
    });
}
//# sourceMappingURL=extension.js.map