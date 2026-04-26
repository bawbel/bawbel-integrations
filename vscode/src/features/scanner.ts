/**
 * features/scanner.ts — scan orchestrator
 *
 * Handles all scan invocations: auto (on-save), full (on-demand), watch (background).
 * Emits results via callbacks — does not touch diagnostics or UI directly.
 *
 * CONTRIBUTING: This module ONLY runs scans and returns results.
 * It does NOT update diagnostics, status bar, or UI. Those live in ui/.
 * Keep this module pure: input = ScanRequest, output = BawbelFileResult[].
 */

import * as cp from "child_process";
import * as vscode from "vscode";
import { runCommand, spawnWatch } from "../core/cli";
import { parseCliOutput } from "../core/parser";
import { BawbelFileResult, ScanRequest, ScanMode, ScanScope } from "../core/types";

// ── Engine sets per mode ──────────────────────────────────────────────────────
// auto + watch: fast engines only — invisible on any modern machine (~25ms)
// full: all engines — user-initiated, shows progress
// const ENGINES_FAST = "pattern,yara";
// const ENGINES_FULL = undefined; // undefined = CLI default (all configured engines)

// ── Scanner ───────────────────────────────────────────────────────────────────

export class Scanner {
  private log:        vscode.OutputChannel;
  private bawbelPath: string;
  private _isScanning = false;
  private watchProc:  cp.ChildProcess | null = null;
  private watchBuffer = "";

  constructor(bawbelPath: string, log: vscode.OutputChannel) {
    this.bawbelPath = bawbelPath;
    this.log        = log;
  }

  get isScanning(): boolean  { return this._isScanning; }
  get isWatching(): boolean  { return this.watchProc !== null; }

  // ── One-shot scan ───────────────────────────────────────────────────────────

  /**
   * Run a single scan and return results.
   * Safe to call from any context — guards against concurrent scans.
   *
   * @param request - What to scan and how
   * @param onResults - Called with results when scan completes
   */
  async scan(
    request:   ScanRequest,
    onResults: (results: BawbelFileResult[]) => void
  ): Promise<void> {
    if (this._isScanning) {
      this.log.appendLine("[scanner] Scan already in progress — skipping");
      return;
    }

    this._isScanning = true;

    try {
      const args = this.buildArgs(request);
      this.log.appendLine(`\n$ ${this.bawbelPath} ${args.join(" ")}`);

      const res = await runCommand(this.bawbelPath, args);

      this.log.appendLine(`[scanner] exit: ${res.code}`);
      if (res.stderr.trim()) {
        this.log.appendLine(`[scanner] stderr: ${res.stderr.trim()}`);
      }

      const { results, error } = parseCliOutput(res.stdout, request.target);

      if (error) {
        this.log.appendLine(`[scanner] parse error: ${error}`);
      }

      this.logSummary(results);
      onResults(results);

    } finally {
      this._isScanning = false;
    }
  }

  // ── Watch mode ──────────────────────────────────────────────────────────────

  /**
   * Start a background watch process.
   * The process re-scans on every file change and streams results.
   *
   * @param scope    - What to watch: file, folder, workspace
   * @param target   - Absolute path to watch
   * @param onResults - Called each time the watcher detects a change
   * @param onStatus  - Called with "started" | "stopped" | "error"
   */
  startWatch(
    scope:     ScanScope,
    target:    string,
    onResults: (results: BawbelFileResult[]) => void,
    onStatus:  (status: "started" | "stopped" | "error") => void
  ): void {
    if (this.watchProc) {
      this.log.appendLine("[scanner] Watch already running");
      return;
    }

    const request: ScanRequest = {
      scope,
      target,
      mode:    "watch",
      // engines: ENGINES_FAST,
    };

    const args = this.buildArgs(request);
    this.log.appendLine(`\n▶ Watch: ${this.bawbelPath} ${args.join(" ")}`);
    this.watchBuffer = "";

    this.watchProc = spawnWatch(
      this.bawbelPath,
      args,
      // onData — process streaming JSON lines
      (chunk) => {
        this.watchBuffer += chunk;
        this.processWatchBuffer(onResults);
      },
      // onError
      (chunk) => {
        if (chunk.trim()) {
          this.log.appendLine(`[watch] ${chunk.trim()}`);
        }
      },
      // onExit
      (code) => {
        this.log.appendLine(`[watch] Process exited (code ${code})`);
        this.watchProc = null;
        onStatus(code === 0 || code === null ? "stopped" : "error");
      }
    );

    onStatus("started");
  }

  stopWatch(): void {
    if (!this.watchProc) { return; }
    this.log.appendLine("[scanner] ■ Stopping watch");
    this.watchProc.kill("SIGTERM");
    this.watchProc = null;
  }

  // ── Argument builder ────────────────────────────────────────────────────────

  private buildArgs(request: ScanRequest): string[] {
    const args: string[] = ["scan", request.target, "--format", "json"];

    // Recursive for folder and workspace scopes
    if (request.scope === "folder" || request.scope === "workspace") {
      args.push("--recursive");
    }

    // Watch flag
    if (request.mode === "watch") {
      args.push("--watch");
    }

    // Engine restriction for fast modes
    // const engines = request.engines
    //   ?? (request.mode === "auto" ? ENGINES_FAST : ENGINES_FULL);

    // if (engines) {
    //   args.push("--engines", engines);
    // }

    return args;
  }

  // ── Watch buffer processor ──────────────────────────────────────────────────
  // bawbel --watch emits newline-delimited JSON objects, one per file change.

  private processWatchBuffer(
    onResults: (results: BawbelFileResult[]) => void
  ): void {
    const lines = this.watchBuffer.split("\n");
    this.watchBuffer = lines.pop() ?? ""; // keep partial last line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const jsonStart = trimmed.indexOf("[");
      const objStart  = trimmed.indexOf("{");
      const start     =
        jsonStart >= 0 && (objStart < 0 || jsonStart <= objStart)
          ? jsonStart
          : objStart;

      if (start < 0) {
        this.log.appendLine(`[watch] ${trimmed}`);
        continue;
      }

      const { results, error } = parseCliOutput(trimmed.slice(start), "");
      if (error) {
        this.log.appendLine(`[watch] ${trimmed}`);
        continue;
      }

      if (results.length > 0) {
        this.logSummary(results);
        onResults(results);
      }
    }
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  private logSummary(results: BawbelFileResult[]): void {
    for (const r of results) {
      const n    = r.findings?.length ?? 0;
      const name = r.file_path.split("/").pop() ?? r.file_path;
      if (n === 0) {
        this.log.appendLine(`  ✓ ${name} — clean (${r.scan_time_ms}ms)`);
      } else {
        const bySev = r.findings.reduce((acc, f) => {
          acc[f.severity] = (acc[f.severity] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const sevStr = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
          .filter(s => bySev[s])
          .map(s => `${bySev[s]} ${s}`)
          .join(" | ");
        this.log.appendLine(
          `  ✗ ${name} — ${n} finding(s): ${sevStr} | risk ${r.risk_score}/10 (${r.scan_time_ms}ms)`
        );
      }
    }
  }
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

/**
 * Build a ScanRequest for an on-save auto scan of a single file.
 */
export function autoScanRequest(filePath: string): ScanRequest {
  return { scope: "file", target: filePath, mode: "auto" };
}

/**
 * Build a ScanRequest for a full on-demand workspace scan.
 */
export function fullWorkspaceScanRequest(workspacePath: string): ScanRequest {
  return { scope: "workspace", target: workspacePath, mode: "full" };
}

/**
 * Build a ScanRequest for a full on-demand folder scan.
 */
export function fullFolderScanRequest(folderPath: string): ScanRequest {
  return { scope: "folder", target: folderPath, mode: "full" };
}
