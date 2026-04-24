# Bawbel Scanner for VS Code

Scan agentic AI skills, MCP manifests, and system prompts for
[AVE vulnerabilities](https://github.com/bawbel/bawbel-ave) directly in VS Code.

## Requirements

```bash
pip install "bawbel-scanner[all]"
```

## Features

- **Inline diagnostics** — red/yellow squiggles on finding lines in the editor
- **Problems tab** — all findings listed with AVE ID, severity, and engine
- **Status bar** — `Bawbel: ✓ clean` or `Bawbel: 3 finding(s)` always visible
- **Auto-scan on save** — scans `.md`, `.yaml`, `.yml`, `.json` on every save
- **Keyboard shortcut** — `Ctrl+Shift+B` / `Cmd+Shift+B` to scan current file
- **Workspace scan** — scan every skill file in the project at once
- **AVE links** — click finding code to open the AVE record in browser

## Usage

1. Open a skill file (`.md`, `.yaml`)
2. Press `Ctrl+Shift+B` to scan — or just save the file
3. Findings appear as red squiggles inline and in the Problems tab
4. Click a finding's AVE ID to open the full vulnerability record

## Configuration

| Setting | Default | Description |
|---|---|---|
| `bawbel.executable` | `bawbel` | Path to bawbel CLI |
| `bawbel.scanOnSave` | `true` | Auto-scan on save |
| `bawbel.failOnSeverity` | `high` | Show as error vs warning |
| `bawbel.enableLLM` | `false` | Enable LLM semantic analysis |
| `bawbel.noIgnore` | `false` | Override suppressions (audit mode) |

## Commands

| Command | Shortcut | Description |
|---|---|---|
| Bawbel: Scan Current File | `Ctrl+Shift+B` | Scan the active file |
| Bawbel: Scan Workspace | — | Scan all skill files in workspace |
| Bawbel: Show Findings | — | Open the Bawbel output channel |
| Bawbel: Clear Findings | — | Clear all diagnostics |
