import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ── Diagnostics collection ────────────────────────────────────────────────────
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

// ── Activation ────────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('bawbel');
    outputChannel = vscode.window.createOutputChannel('Bawbel Scanner');
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 100
    );
    statusBarItem.command = 'bawbel.showFindings';
    statusBarItem.text = '$(shield) Bawbel';
    statusBarItem.tooltip = 'Bawbel Scanner — click to show findings';
    statusBarItem.show();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bawbel.scanFile', scanCurrentFile),
        vscode.commands.registerCommand('bawbel.scanWorkspace', scanWorkspace),
        vscode.commands.registerCommand('bawbel.showFindings', showFindings),
        vscode.commands.registerCommand('bawbel.clearFindings', clearFindings),
        diagnosticCollection,
        statusBarItem,
        outputChannel,
    );

    // Auto-scan on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            const cfg = vscode.workspace.getConfiguration('bawbel');
            if (cfg.get<boolean>('scanOnSave', true)) {
                if (shouldScanFile(doc.fileName)) {
                    scanFile(doc.fileName);
                }
            }
        })
    );

    // Scan active file on activation if it's a skill file
    const editor = vscode.window.activeTextEditor;
    if (editor && shouldScanFile(editor.document.fileName)) {
        scanFile(editor.document.fileName);
    }

    outputChannel.appendLine('Bawbel Scanner activated');
    outputChannel.appendLine(
        'Keyboard shortcut: Ctrl+Shift+B (Cmd+Shift+B on Mac)'
    );
}

// ── File type check ───────────────────────────────────────────────────────────
function shouldScanFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.md', '.yaml', '.yml', '.json', '.txt'].includes(ext);
}

// ── Scan a single file ────────────────────────────────────────────────────────
async function scanCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Bawbel: No active file to scan');
        return;
    }
    await scanFile(editor.document.fileName);
}

async function scanFile(filePath: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('bawbel');
    const executable = cfg.get<string>('executable', 'bawbel');
    const noIgnore = cfg.get<boolean>('noIgnore', false);
    const enableLLM = cfg.get<boolean>('enableLLM', false);

    setStatus('scanning');

    const args = ['scan', filePath, '--format', 'json'];
    if (noIgnore) args.push('--no-ignore');

    const env = { ...process.env };
    if (!enableLLM) {
        env['BAWBEL_LLM_ENABLED'] = 'false';
    }

    try {
        const output = await runBawbel(executable, args, env);
        if (!output) {
            setStatus('error');
            return;
        }

        const results: BawbelResult[] = JSON.parse(output);
        applyDiagnostics(filePath, results);

        const totalFindings = results.reduce(
            (sum, r) => sum + (r.findings?.length ?? 0), 0
        );

        if (totalFindings === 0) {
            setStatus('clean');
            outputChannel.appendLine(`✓ ${path.basename(filePath)} — clean`);
        } else {
            setStatus('findings', totalFindings);
            outputChannel.appendLine(
                `⚠ ${path.basename(filePath)} — ${totalFindings} finding(s)`
            );
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('error');
        outputChannel.appendLine(`Error scanning ${path.basename(filePath)}: ${msg}`);
    }
}

// ── Scan entire workspace ─────────────────────────────────────────────────────
async function scanWorkspace(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Bawbel: No workspace folder open');
        return;
    }

    const cfg = vscode.workspace.getConfiguration('bawbel');
    const executable = cfg.get<string>('executable', 'bawbel');
    const noIgnore = cfg.get<boolean>('noIgnore', false);

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    setStatus('scanning');

    const args = ['scan', workspaceRoot, '--recursive', '--format', 'json'];
    if (noIgnore) args.push('--no-ignore');

    const env = { ...process.env, BAWBEL_LLM_ENABLED: 'false' };

    try {
        const output = await runBawbel(executable, args, env);
        if (!output) { setStatus('error'); return; }

        const results: BawbelResult[] = JSON.parse(output);
        diagnosticCollection.clear();

        let totalFindings = 0;
        for (const result of results) {
            applyDiagnostics(result.file_path, [result]);
            totalFindings += result.findings?.length ?? 0;
        }

        setStatus(totalFindings === 0 ? 'clean' : 'findings', totalFindings);
        outputChannel.appendLine(
            `Workspace scan: ${results.length} files, ${totalFindings} finding(s)`
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('error');
        outputChannel.appendLine(`Workspace scan error: ${msg}`);
    }
}

// ── Apply diagnostics to Problems tab ────────────────────────────────────────
function applyDiagnostics(
    filePath: string, results: BawbelResult[]
): void {
    const cfg = vscode.workspace.getConfiguration('bawbel');
    const failSev = cfg.get<string>('failOnSeverity', 'high');

    const uri = vscode.Uri.file(filePath);
    const diagnostics: vscode.Diagnostic[] = [];

    for (const result of results) {
        for (const finding of result.findings ?? []) {
            const lineNo = Math.max(0, (finding.line ?? 1) - 1);
            const range = new vscode.Range(lineNo, 0, lineNo, 999);

            const severity = findingToVscodeSeverity(finding.severity, failSev);
            const diag = new vscode.Diagnostic(
                range,
                `[${finding.ave_id ?? 'N/A'}] ${finding.title} (${finding.engine})`,
                severity,
            );
            diag.source = 'Bawbel';
            diag.code = {
                value: finding.ave_id ?? finding.rule_id,
                target: vscode.Uri.parse(
                    `https://github.com/bawbel/bawbel-ave/blob/main/records/${finding.ave_id}.md`
                ),
            };
            diagnostics.push(diag);
        }
    }

    diagnosticCollection.set(uri, diagnostics);
}

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(
    state: 'scanning' | 'clean' | 'findings' | 'error',
    count?: number
): void {
    switch (state) {
        case 'scanning':
            statusBarItem.text = '$(sync~spin) Bawbel: scanning…';
            statusBarItem.backgroundColor = undefined;
            break;
        case 'clean':
            statusBarItem.text = '$(shield) Bawbel: ✓ clean';
            statusBarItem.backgroundColor = undefined;
            break;
        case 'findings':
            statusBarItem.text = `$(shield) Bawbel: ${count} finding(s)`;
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
            break;
        case 'error':
            statusBarItem.text = '$(shield) Bawbel: error';
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.errorBackground'
            );
            break;
    }
}

// ── Helper: show output channel ───────────────────────────────────────────────
function showFindings(): void {
    outputChannel.show();
}

function clearFindings(): void {
    diagnosticCollection.clear();
    setStatus('clean');
}

// ── Helper: run bawbel CLI ────────────────────────────────────────────────────
function runBawbel(
    executable: string,
    args: string[],
    env: NodeJS.ProcessEnv,
): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(executable, args, { env, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout, stderr) => {
                // Exit code 2 = findings found — not an error
                if (error && (error as NodeJS.ErrnoException).code !== 2) {
                    // Check if bawbel is installed
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                        vscode.window.showErrorMessage(
                            'Bawbel Scanner: CLI not found. ' +
                            'Install with: pip install "bawbel-scanner[all]"',
                            'Install docs'
                        ).then(action => {
                            if (action === 'Install docs') {
                                vscode.env.openExternal(
                                    vscode.Uri.parse('https://bawbel.io/docs')
                                );
                            }
                        });
                        reject(new Error('bawbel CLI not found'));
                        return;
                    }
                }
                resolve(stdout);
            }
        );
    });
}

// ── Severity mapping ──────────────────────────────────────────────────────────
function findingToVscodeSeverity(
    bawbelSev: string,
    failOnSeverity: string,
): vscode.DiagnosticSeverity {
    const sevOrder = ['critical', 'high', 'medium', 'low'];
    const findingLevel = sevOrder.indexOf(bawbelSev?.toLowerCase() ?? 'low');
    const failLevel = sevOrder.indexOf(failOnSeverity?.toLowerCase() ?? 'high');
    return findingLevel <= failLevel
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BawbelFinding {
    rule_id: string;
    ave_id: string | null;
    title: string;
    severity: string;
    cvss_ai: number;
    line: number | null;
    match: string | null;
    engine: string;
}

interface BawbelResult {
    file_path: string;
    findings: BawbelFinding[];
    suppressed_findings: BawbelFinding[];
    risk_score: number;
}

// ── Deactivation ──────────────────────────────────────────────────────────────
export function deactivate(): void {
    diagnosticCollection?.dispose();
    statusBarItem?.dispose();
    outputChannel?.dispose();
}
