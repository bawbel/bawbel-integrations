import * as vscode from 'vscode';
import { execFile, exec } from 'child_process';
import * as path from 'path';

// ── Globals ───────────────────────────────────────────────────────────────────
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let installPromise: Promise<boolean> | null = null;

// ── Activation ────────────────────────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('bawbel');
    outputChannel = vscode.window.createOutputChannel('Bawbel Scanner');
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 100
    );
    statusBarItem.command = 'bawbel.showFindings';
    statusBarItem.text = '$(shield) Bawbel';
    statusBarItem.tooltip = 'Bawbel Scanner — click to show findings';
    statusBarItem.show();

    context.subscriptions.push(
        vscode.commands.registerCommand('bawbel.scanFile', scanCurrentFile),
        vscode.commands.registerCommand('bawbel.scanWorkspace', scanWorkspace),
        vscode.commands.registerCommand('bawbel.showFindings', showFindings),
        vscode.commands.registerCommand('bawbel.clearFindings', clearFindings),
        vscode.commands.registerCommand('bawbel.install', () => ensureInstalled(true)),
        diagnosticCollection,
        statusBarItem,
        outputChannel,
    );

    // Auto-scan on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            const cfg = vscode.workspace.getConfiguration('bawbel');
            if (cfg.get<boolean>('scanOnSave', true) && shouldScanFile(doc.fileName)) {
                scanFile(doc.fileName);
            }
        })
    );

    // Silently ensure CLI is installed on first activation
    const ready = await ensureInstalled(false);
    if (ready) {
        outputChannel.appendLine('Bawbel Scanner ready  ·  Cmd+Shift+B to scan');
        const editor = vscode.window.activeTextEditor;
        if (editor && shouldScanFile(editor.document.fileName)) {
            scanFile(editor.document.fileName);
        }
    }
}

// ── Auto-install ──────────────────────────────────────────────────────────────
/**
 * Ensure bawbel CLI is available. Installs automatically if missing.
 * Concurrent calls share one install promise — no duplicate installs.
 */
async function ensureInstalled(explicit: boolean): Promise<boolean> {
    if (installPromise) {
        return installPromise;
    }
    installPromise = _doEnsureInstalled(explicit).finally(() => {
        installPromise = null;
    });
    return installPromise;
}

async function _doEnsureInstalled(explicit: boolean): Promise<boolean> {
    const cfg = vscode.workspace.getConfiguration('bawbel');
    const userExecutable = cfg.get<string>('executable', '');

    // User configured a custom path — verify it and use it
    if (userExecutable && userExecutable !== 'bawbel') {
        return checkExecutable(userExecutable);
    }

    // Check if bawbel is already in PATH
    if (await checkExecutable('bawbel')) {
        return true;
    }

    // Not found — auto-install silently in background
    outputChannel.show();
    outputChannel.appendLine('Bawbel CLI not found — installing automatically…');
    outputChannel.appendLine('Running: pip install "bawbel-scanner[all]"');
    setStatus('installing');

    const installed = await runPipInstall(explicit);
    if (installed) {
        outputChannel.appendLine('');
        outputChannel.appendLine('✓  Bawbel Scanner installed successfully');
        vscode.window.showInformationMessage(
            'Bawbel Scanner installed and ready.',
            'Show output'
        ).then(action => {
            if (action === 'Show output') { outputChannel.show(); }
        });
        setStatus('clean');
        return true;
    }

    // Install failed — show actionable error with three fallback options
    outputChannel.appendLine('');
    outputChannel.appendLine('✗  Auto-install failed. Try manually:');
    outputChannel.appendLine('   pip install "bawbel-scanner[all]"');
    outputChannel.appendLine('   pip3 install "bawbel-scanner[all]"');
    outputChannel.appendLine('   python -m pip install "bawbel-scanner[all]"');
    outputChannel.appendLine('');
    outputChannel.appendLine(
        'Or set a custom path: VS Code Settings → bawbel.executable'
    );

    vscode.window.showErrorMessage(
        'Bawbel: auto-install failed.',
        'Show output',
        'Open settings',
    ).then(action => {
        if (action === 'Show output') {
            outputChannel.show();
        } else if (action === 'Open settings') {
            vscode.commands.executeCommand(
                'workbench.action.openSettings', 'bawbel.executable'
            );
        }
    });
    setStatus('error');
    return false;
}

/**
 * Try pip install using multiple candidate commands.
 * Tries pip → pip3 → python -m pip → python3 -m pip in order.
 */
function runPipInstall(showProgress: boolean): Promise<boolean> {
    const candidates = [
        'pip install "bawbel-scanner[all]" --quiet',
        'pip3 install "bawbel-scanner[all]" --quiet',
        'python -m pip install "bawbel-scanner[all]" --quiet',
        'python3 -m pip install "bawbel-scanner[all]" --quiet',
    ];

    const tryNext = (remaining: string[]): Promise<boolean> => {
        if (remaining.length === 0) { return Promise.resolve(false); }
        const [cmd, ...rest] = remaining;
        outputChannel.appendLine(`Trying: ${cmd}`);
        return new Promise(resolve => {
            exec(cmd, { timeout: 120_000 }, (error, stdout, stderr) => {
                if (!error) {
                    if (stdout.trim()) { outputChannel.appendLine(stdout); }
                    resolve(true);
                } else {
                    const firstLine = (stderr || '').split('\n')[0];
                    if (firstLine) { outputChannel.appendLine(`  → ${firstLine}`); }
                    resolve(tryNext(rest));
                }
            });
        });
    };

    if (showProgress) {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Bawbel: Installing scanner…',
                cancellable: false,
            },
            () => tryNext(candidates)
        );
    }
    return tryNext(candidates);
}

/** Check if an executable exists and is runnable. */
function checkExecutable(executable: string): Promise<boolean> {
    return new Promise(resolve => {
        execFile(executable, ['version'], { timeout: 10_000 },
            (error) => {
                const code = (error as NodeJS.ErrnoException)?.code;
                resolve(!error || code !== 'ENOENT');
            }
        );
    });
}

// ── File type filter ──────────────────────────────────────────────────────────
function shouldScanFile(filePath: string): boolean {
    return ['.md', '.yaml', '.yml', '.json', '.txt'].includes(
        path.extname(filePath).toLowerCase()
    );
}

// ── Scan single file ──────────────────────────────────────────────────────────
async function scanCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Bawbel: No active file to scan');
        return;
    }
    await scanFile(editor.document.fileName);
}

async function scanFile(filePath: string): Promise<void> {
    if (!await ensureInstalled(false)) { return; }

    const cfg = vscode.workspace.getConfiguration('bawbel');
    const executable = cfg.get<string>('executable', '') || 'bawbel';
    const noIgnore = cfg.get<boolean>('noIgnore', false);
    const enableLLM = cfg.get<boolean>('enableLLM', false);

    setStatus('scanning');
    const args = ['scan', filePath, '--format', 'json'];
    if (noIgnore) { args.push('--no-ignore'); }

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (!enableLLM) { env['BAWBEL_LLM_ENABLED'] = 'false'; }

    try {
        const output = await runBawbel(executable, args, env);
        const results: BawbelResult[] = JSON.parse(output || '[]');
        applyDiagnostics(filePath, results);
        const count = results.reduce((n, r) => n + (r.findings?.length ?? 0), 0);
        setStatus(count === 0 ? 'clean' : 'findings', count);
        if (count > 0) {
            outputChannel.appendLine(`⚠  ${path.basename(filePath)} — ${count} finding(s)`);
            results.forEach(r => r.findings?.forEach(f => {
                outputChannel.appendLine(
                    `   L${f.line ?? '?'}  [${f.severity.toUpperCase()}]  `
                    + `${f.ave_id ?? f.rule_id}  ${f.title}`
                );
            }));
        } else {
            outputChannel.appendLine(`✓  ${path.basename(filePath)}`);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('ENOENT')) {
            setStatus('error');
            outputChannel.appendLine(`Error scanning ${path.basename(filePath)}: ${msg}`);
        }
    }
}

// ── Scan workspace ────────────────────────────────────────────────────────────
async function scanWorkspace(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
        vscode.window.showWarningMessage('Bawbel: No workspace folder open');
        return;
    }
    if (!await ensureInstalled(false)) { return; }

    const cfg = vscode.workspace.getConfiguration('bawbel');
    const executable = cfg.get<string>('executable', '') || 'bawbel';
    const noIgnore = cfg.get<boolean>('noIgnore', false);
    const root = folders[0].uri.fsPath;
    const args = ['scan', root, '--recursive', '--format', 'json'];
    if (noIgnore) { args.push('--no-ignore'); }

    setStatus('scanning');
    outputChannel.appendLine(`Scanning workspace: ${root}`);

    try {
        const output = await runBawbel(executable, args, {
            ...process.env, BAWBEL_LLM_ENABLED: 'false'
        });
        const results: BawbelResult[] = JSON.parse(output || '[]');
        diagnosticCollection.clear();
        let total = 0;
        for (const r of results) {
            applyDiagnostics(r.file_path, [r]);
            total += r.findings?.length ?? 0;
        }
        setStatus(total === 0 ? 'clean' : 'findings', total);
        outputChannel.appendLine(`Done — ${results.length} files, ${total} finding(s)`);
    } catch (err: unknown) {
        setStatus('error');
        outputChannel.appendLine(`Workspace scan error: ${err}`);
    }
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
function applyDiagnostics(filePath: string, results: BawbelResult[]): void {
    const cfg = vscode.workspace.getConfiguration('bawbel');
    const failSev = cfg.get<string>('failOnSeverity', 'high');
    const diagnostics: vscode.Diagnostic[] = [];

    for (const result of results) {
        for (const f of result.findings ?? []) {
            const line = Math.max(0, (f.line ?? 1) - 1);
            const diag = new vscode.Diagnostic(
                new vscode.Range(line, 0, line, 999),
                `[${f.ave_id ?? 'N/A'}] ${f.title}  (${f.engine})`,
                findingToVscodeSeverity(f.severity, failSev),
            );
            diag.source = 'Bawbel';
            diag.code = {
                value: f.ave_id ?? f.rule_id,
                target: vscode.Uri.parse(
                    `https://github.com/bawbel/bawbel-ave/blob/main/records/${f.ave_id ?? f.rule_id}.md`
                ),
            };
            diagnostics.push(diag);
        }
    }
    diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
}

// ── Status bar ────────────────────────────────────────────────────────────────
type StatusState = 'installing' | 'scanning' | 'clean' | 'findings' | 'error';

function setStatus(state: StatusState, count?: number): void {
    const states: Record<StatusState, [string, string | undefined]> = {
        installing: ['$(sync~spin) Bawbel: installing…', undefined],
        scanning:   ['$(sync~spin) Bawbel: scanning…',  undefined],
        clean:      ['$(shield) Bawbel: ✓ clean',       undefined],
        findings:   [`$(shield) Bawbel: ${count} finding(s)`, 'statusBarItem.warningBackground'],
        error:      ['$(shield) Bawbel: error — click for help', 'statusBarItem.errorBackground'],
    };
    const [text, bg] = states[state];
    statusBarItem.text = text;
    statusBarItem.backgroundColor = bg
        ? new vscode.ThemeColor(bg)
        : undefined;
}

function showFindings(): void { outputChannel.show(); }
function clearFindings(): void { diagnosticCollection.clear(); setStatus('clean'); }

function runBawbel(
    executable: string, args: string[], env: NodeJS.ProcessEnv
): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(executable, args, { env, maxBuffer: 10 * 1024 * 1024, timeout: 60_000 },
            (error, stdout) => {
                const code = (error as NodeJS.ErrnoException & { code?: number })?.code;
                if (error && code !== 2) { reject(error); return; }
                resolve(stdout);
            }
        );
    });
}

function findingToVscodeSeverity(sev: string, failOn: string): vscode.DiagnosticSeverity {
    const order = ['critical', 'high', 'medium', 'low'];
    return order.indexOf(sev?.toLowerCase() ?? 'low') <= order.indexOf(failOn?.toLowerCase() ?? 'high')
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BawbelFinding {
    rule_id: string; ave_id: string | null; title: string;
    severity: string; cvss_ai: number; line: number | null;
    match: string | null; engine: string;
}
interface BawbelResult {
    file_path: string; findings: BawbelFinding[];
    suppressed_findings: BawbelFinding[]; risk_score: number;
}

export function deactivate(): void {
    diagnosticCollection?.dispose();
    statusBarItem?.dispose();
    outputChannel?.dispose();
}