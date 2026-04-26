/**
 * core/cli.ts — bawbel binary manager
 *
 * Responsible for:
 *   - Locating the bawbel binary (PATH, pip install locations, user config)
 *   - Installing bawbel-scanner via pip
 *   - Spawning scan processes and streaming output
 *
 * CONTRIBUTING: All process spawning goes through runCommand() or spawnWatch().
 * Never use cp.exec() — it buffers everything and blocks on large output.
 */

import * as cp   from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { OUTPUT_CHANNEL } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommandResult {
  code:   number;
  stdout: string;
  stderr: string;
}

// ── Binary Discovery ──────────────────────────────────────────────────────────

const CANDIDATE_PATHS = [
  "bawbel",
  "/usr/local/bin/bawbel",
  "/usr/bin/bawbel",
  `${process.env.HOME}/.local/bin/bawbel`,
  `${process.env.HOME}/.local/pipx/bawbel/bin/bawbel`,
];

/**
 * Find the bawbel binary.
 * Checks user config first, then common install locations.
 * Returns null if not found anywhere.
 */
export async function findBawbel(): Promise<string | null> {
  const config    = vscode.workspace.getConfiguration("bawbel");
  const configured = config.get<string>("bawbelPath", "").trim();

  if (configured) {
    const result = await runCommand(configured, ["--version"]);
    if (result.code === 0) { return configured; }
    // Configured path is wrong — warn but continue auto-detect
    getLog().appendLine(
      `[cli] WARNING: bawbel.bawbelPath "${configured}" not found — falling back to auto-detect`
    );
  }

  for (const candidate of CANDIDATE_PATHS) {
    const result = await runCommand(candidate, ["--version"]);
    if (result.code === 0) { return candidate; }
  }

  return null;
}

/**
 * Install bawbel-scanner via pip.
 * Returns true on success.
 */
export async function installBawbel(log: vscode.OutputChannel): Promise<boolean> {
  const pipCandidates = ["pip3", "pip", "python3 -m pip", "python -m pip"];

  let pip: string | null = null;
  for (const c of pipCandidates) {
    const parts  = c.split(" ");
    const result = await runCommand(parts[0], [...parts.slice(1), "--version"]);
    if (result.code === 0) { pip = c; break; }
  }

  if (!pip) {
    log.appendLine("[cli] ERROR: pip not found. Install Python 3.10+ and pip.");
    return false;
  }

  log.appendLine(`[cli] Installing bawbel-scanner via ${pip}...`);
  const parts  = pip.split(" ");
  const result = await runCommand(
    parts[0],
    [...parts.slice(1), "install", "--upgrade", "bawbel-scanner"]
  );

  if (result.code === 0) {
    log.appendLine("[cli] bawbel-scanner installed ✓");
    return true;
  }

  log.appendLine(`[cli] Installation failed (exit ${result.code}):\n${result.stderr}`);
  return false;
}

// ── Process Execution ─────────────────────────────────────────────────────────

/**
 * Run a command and collect stdout/stderr.
 * Safe to call frequently — spawns and closes cleanly.
 */
export function runCommand(
  cmd:  string,
  args: string[]
): Promise<CommandResult> {
  return new Promise(resolve => {
    let stdout = "";
    let stderr = "";

    const proc = cp.spawn(cmd, args, {
      shell: process.platform === "win32",
    });

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("error", err => {
      resolve({ code: 1, stdout: "", stderr: err.message });
    });

    proc.on("close", code => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Spawn a long-running watch process.
 * Returns the ChildProcess — caller is responsible for killing it.
 *
 * @param bawbelPath - Absolute path to bawbel binary
 * @param args       - Scan arguments (path, --watch, etc.)
 * @param onData     - Called with each chunk of stdout
 * @param onError    - Called with each chunk of stderr
 * @param onExit     - Called when the process exits
 */
export function spawnWatch(
  bawbelPath: string,
  args:       string[],
  onData:     (chunk: string) => void,
  onError:    (chunk: string) => void,
  onExit:     (code: number | null) => void
): cp.ChildProcess {
  const proc = cp.spawn(bawbelPath, args, {
    shell: process.platform === "win32",
  });

  proc.stdout?.on("data", (d: Buffer) => onData(d.toString()));
  proc.stderr?.on("data", (d: Buffer) => onError(d.toString()));
  proc.on("error", err  => onError(err.message));
  proc.on("close", code => onExit(code));

  return proc;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Lazy reference to output channel — avoids circular dependency
let _log: vscode.OutputChannel | null = null;
function getLog(): vscode.OutputChannel {
  if (!_log) { _log = vscode.window.createOutputChannel(OUTPUT_CHANNEL); }
  return _log;
}

export function setLog(log: vscode.OutputChannel): void {
  _log = log;
}

/**
 * Get the bawbel version string.
 * Returns null if bawbel is not found.
 */
export async function getBawbelVersion(bawbelPath: string): Promise<string | null> {
  const result = await runCommand(bawbelPath, ["--version"]);
  if (result.code !== 0) { return null; }
  return (result.stdout || result.stderr).trim();
}
