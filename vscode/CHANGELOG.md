# Changelog

## [1.0.1] — 2026-04-26

### Fixed
- **JSON parsing** — correctly reads bawbel CLI output format: top-level array
  `[{ file_path, findings, risk_score, scan_time_ms, ... }]`
- **Binary detection** — calls `bawbel` binary directly (installed by pip at
  `/usr/local/bin/bawbel`); no longer tries `python3 -m bawbel`
- **Finding details** — hover tooltip now shows full finding detail:
  severity emoji, matched text, AVE ID, CVSS-AI score, engine, OWASP tags,
  and a direct link to the PiranhaDB record
- **Keybinding conflict** — changed from `Cmd+Shift+B` (VS Code build task)
  to `Cmd+Alt+B` / `Ctrl+Alt+B`

### Added
- **Inline remediation hints** — every finding shows a "How to fix" section
  directly in the hover tooltip. Covers 12 rule IDs with specific, actionable
  guidance. Falls back to the finding's `description` field for unknown rules.
- **Output panel logging** — raw stdout, stderr, and exit code logged to the
  "Bawbel Scanner" Output channel on every scan for easier debugging
- **Scan timing** — summary line shows scan duration in ms per file
- **`bawbel.bawbelPath` setting** — override the path to the bawbel binary
  if auto-detection fails

### Changed
- Removed `bawbel.pythonPath` setting (replaced by `bawbel.bawbelPath`)
- Removed `bawbel.extras` setting (CLI manages its own extras)
- Status bar tooltip updated to reflect `Cmd+Alt+B` shortcut

## [1.0.0] — 2026-04-26

### Added
- Initial release
- Inline diagnostics for AVE findings (squiggles on finding lines)
- Status bar: `Bawbel: ✓ clean` or `Bawbel: N finding(s)`
- Auto-scan on save for `.md .yaml .yml .json .txt`
- `Cmd+Shift+B` / `Ctrl+Shift+B` to scan current file
- Workspace scan via command palette
- Click finding code to open full AVE record in PiranhaDB
- Zero setup — auto-installs `bawbel-scanner` on first activation
