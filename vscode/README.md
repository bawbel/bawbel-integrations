# Bawbel Scanner — VS Code Extension

Scan agentic AI components for [AVE vulnerabilities](https://github.com/bawbel/bawbel-ave) directly in VS Code.

## Features

- **Inline diagnostics** — red/yellow squiggles on finding lines, same as ESLint
- **Status bar** — `Bawbel: ✓ clean` or `Bawbel: 3 finding(s)` always visible
- **Auto-scan on save** — scans `.md .yaml .yml .json .txt` on every save
- **Keyboard shortcut** — `Cmd+Shift+B` / `Ctrl+Shift+B` to scan current file
- **Workspace scan** — scan all skill files at once via command palette
- **AVE links** — click any finding code to open the full vulnerability record in [PiranhaDB](https://api.piranha.bawbel.io)
- **Zero setup** — auto-installs `bawbel-scanner` on first activation

## Requirements

- Python 3.10+
- `bawbel-scanner` (auto-installed on first use)

## Quick Start

1. Install the extension
2. Open any `.md`, `.yaml`, or `.json` skill file
3. Save it — findings appear as inline diagnostics immediately

## Commands

| Command | Shortcut | Description |
|---|---|---|
| `Bawbel: Scan Current File` | `Cmd+Shift+B` | Scan the active file |
| `Bawbel: Scan Workspace` | — | Scan all skill files in the project |
| `Bawbel: Install / Update CLI` | — | (Re)install `bawbel-scanner` |
| `Bawbel: Open PiranhaDB` | — | Open AVE record database |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bawbel.scanOnSave` | `true` | Auto-scan on save |
| `bawbel.failOnSeverity` | `high` | Minimum severity shown as error |
| `bawbel.scanExtensions` | `[.md,.yaml,.yml,.json,.txt]` | Extensions to scan |
| `bawbel.pythonPath` | `""` | Python path (auto-detected if empty) |
| `bawbel.extras` | `all` | pip extras: `yara semgrep llm magika all` |

## Links

- [GitHub](https://github.com/bawbel/bawbel-integrations)
- [AVE Standard](https://github.com/bawbel/bawbel-ave)
- [PiranhaDB API](https://api.piranha.bawbel.io)
- [bawbel.io](https://bawbel.io)
