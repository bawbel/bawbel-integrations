/**
 * core/parser.ts — CLI output normaliser
 *
 * Single place that understands bawbel CLI JSON output format.
 * If the CLI schema changes, update ONLY this file.
 *
 * CONTRIBUTING: Never parse CLI output anywhere else. Always call parseCliOutput().
 */

import { BawbelFileResult, BawbelFinding } from "./types";

/**
 * Parse raw stdout from `bawbel scan --format json`.
 *
 * bawbel v1.0.0 outputs a top-level JSON array:
 *   [{ file_path, findings, risk_score, scan_time_ms, ... }]
 *
 * This function is defensive — it handles partial output, prefixed text,
 * single-object responses, and bare finding arrays from older CLI versions.
 *
 * @param stdout - Raw stdout string from CLI process
 * @param fallbackPath - File path to use if the result has none
 * @returns Parsed results, never throws
 */
export function parseCliOutput(
  stdout: string,
  fallbackPath: string
): { results: BawbelFileResult[]; error: string | null } {
  const raw = stdout.trim();

  if (!raw) {
    return { results: [], error: null };
  }

  // Find JSON start — output may have a version header line before JSON
  const arrayStart  = raw.indexOf("[");
  const objectStart = raw.indexOf("{");

  // Prefer array (primary format), fall back to object
  const jsonStart =
    arrayStart >= 0 && (objectStart < 0 || arrayStart <= objectStart)
      ? arrayStart
      : objectStart;

  if (jsonStart < 0) {
    return { results: [], error: `No JSON found in output: ${raw.slice(0, 100)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(jsonStart));
  } catch (e) {
    return { results: [], error: `JSON parse failed: ${e}` };
  }

  const results = normalise(parsed, fallbackPath);
  return { results, error: null };
}

function normalise(data: unknown, fallbackPath: string): BawbelFileResult[] {
  // Primary format: top-level array of file results
  if (Array.isArray(data)) {
    // Array of file result objects
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null && "file_path" in data[0]) {
      return data.map(r => normaliseFileResult(r as Record<string, unknown>, fallbackPath));
    }
    // Bare array of findings (very old format)
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null && "rule_id" in data[0]) {
      return [{
        file_path:      fallbackPath,
        component_type: "unknown",
        risk_score:     0,
        max_severity:   "LOW",
        scan_time_ms:   0,
        has_error:      false,
        findings:       data as BawbelFinding[],
      }];
    }
    return [];
  }

  // Single object with results array: { results: [...] }
  if (typeof data === "object" && data !== null && "results" in data) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.results)) {
      return normalise(obj.results, fallbackPath);
    }
  }

  // Single file result object: { file_path, findings, ... }
  if (typeof data === "object" && data !== null && "file_path" in data) {
    return [normaliseFileResult(data as Record<string, unknown>, fallbackPath)];
  }

  return [];
}

function normaliseFileResult(
  obj: Record<string, unknown>,
  fallbackPath: string
): BawbelFileResult {
  return {
    file_path:      String(obj.file_path      ?? fallbackPath),
    component_type: String(obj.component_type ?? "unknown"),
    risk_score:     Number(obj.risk_score      ?? 0),
    max_severity:   String(obj.max_severity    ?? "LOW"),
    scan_time_ms:   Number(obj.scan_time_ms    ?? 0),
    has_error:      Boolean(obj.has_error      ?? false),
    findings:       Array.isArray(obj.findings) ? obj.findings as BawbelFinding[] : [],
    error:          obj.error ? String(obj.error) : undefined,
  };
}
