# Bawbel Scanner for VS Code

Scan agentic AI skills, MCP manifests, and system prompts for
[AVE vulnerabilities](https://github.com/bawbel/bawbel-ave) directly in VS Code.

## Installation

Install from the VS Code Marketplace — search **Bawbel Scanner**.

**That's it.** The extension automatically installs `bawbel-scanner` in
the background on first activation. No terminal, no pip, no manual steps.

## What happens on first install

1. You install the extension from the Marketplace
2. You open a `.md`, `.yaml`, or `.json` file
3. The extension checks if `bawbel` CLI is available
4. If not found — it runs `pip install "bawbel-scanner[all]"` automatically
5. A notification confirms when ready
6. Findings appear inline immediately

If auto-install fails (unusual network/permission setups), the output
channel shows the exact manual command and links to settings.

## Features

- **Zero setup** — auto-installs CLI on first use
- **Inline diagnostics** — red/yellow squiggles on finding lines
- **Problems tab** — all findings with AVE ID, severity, engine
- **Status bar** — `Bawbel: ✓ clean` or `Bawbel: 3 finding(s)` always visible
- **Auto-scan on save** — scans `.md`, `.yaml`, `.yml`, `.json`, `.txt`
- **Keyboard shortcut** — `Ctrl+Shift+B` / `Cmd+Shift+B`
- **Workspace scan** — scan every skill file at once
- **AVE links** — click a finding's code to open the full vulnerability record

## Configuration

All settings are optional — the extension works with zero configuration.

| Setting | Default | Description |
|---|---|---|
| `bawbel.executable` | `bawbel` | Custom path to bawbel CLI (if not in PATH) |
| `bawbel.scanOnSave` | `true` | Auto-scan on save |
| `bawbel.failOnSeverity` | `high` | Show as error vs warning |
| `bawbel.enableLLM` | `false` | Enable LLM semantic analysis (requires API key) |
| `bawbel.noIgnore` | `false` | Override suppressions — audit mode |

## Commands

| Command | Shortcut | Description |
|---|---|---|
| Bawbel: Scan Current File | `Ctrl+Shift+B` | Scan the active editor file |
| Bawbel: Scan Workspace | — | Scan all skill files in workspace |
| Bawbel: Install Scanner | — | Manually trigger CLI install |
| Bawbel: Show Findings | — | Open the Bawbel output channel |
| Bawbel: Clear Findings | — | Clear all diagnostics |