# bawbel-integrations

Integrations for [Bawbel Scanner](https://bawbel.io) — scan agentic AI
components for [AVE vulnerabilities](https://github.com/bawbel/bawbel-ave)
across every stage of your development workflow.

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-v1-1db894)](action.yml)
[![VS Code](https://img.shields.io/visual-studio-marketplace/v/bawbel.bawbel-scanner?color=1db894&label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=bawbel.bawbel-scanner)
[![AVE Records](https://img.shields.io/badge/AVE%20records-40-1db894)](https://github.com/bawbel/bawbel-ave)

---

## Integrations

| Integration | Status | Directory |
|---|---|---|
| [GitHub Actions](#github-actions) | ✅ v1 | [`action.yml`](action.yml) |
| [VS Code Extension](#vs-code-extension) | ✅ v1.1.0 | [`vscode/`](vscode/) |
| [Pre-commit](#pre-commit) | 🔨 v1.1 | `pre-commit/` |
| [GitLab CI](#gitlab-ci) | 🔨 v1.1 | `gitlab-ci/` |
| Jenkins | 📋 v1.2 | `jenkins/` |
| CircleCI | 📋 v1.2 | `circleci/` |

---

## GitHub Actions

Scan on every push and pull request. Findings appear as inline PR annotations
in the GitHub Security tab via SARIF upload. Blocks merges on CRITICAL or HIGH
findings.

```yaml
# .github/workflows/bawbel.yml
name: Bawbel Security Scan
on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: bawbel/bawbel-integrations@v1
        with:
          path: .
          fail-on-severity: high
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: bawbel-results.sarif
```

**Inputs**

| Input | Default | Description |
|---|---|---|
| `path` | `.` | Path to scan |
| `fail-on-severity` | `high` | `critical` \| `high` \| `medium` \| `low` |
| `format` | `sarif` | `sarif` \| `json` \| `text` |
| `recursive` | `true` | Scan subdirectories |
| `version` | `latest` | `bawbel-scanner` version to install |
| `extras` | `all` | pip extras: `yara semgrep llm magika all` |

See [`action.yml`](action.yml) for full input/output reference.
See [`examples/`](examples/) for GitLab CI, Jenkins, CircleCI, and Azure DevOps patterns.

---

## VS Code Extension

Real-time inline diagnostics as you write. Hover any squiggle to see severity,
matched text, and exactly how to fix it. Right-click to suppress false positives.
Full scan report with `Cmd+Alt+R`.

```bash
# Install from Marketplace
ext install bawbel.bawbel-scanner

# Or install CLI first if needed
pip install bawbel-scanner
```

**What you get:**

- Inline squiggles on every finding — red (error) or yellow (warning)
- Hover tooltip: severity, match, AVE ID, CVSS-AI score, "How to fix"
- Auto-scan on save (~25ms, pattern+yara — never slows the machine)
- Full scan on demand — all engines, workspace or folder scope (`Cmd+Alt+B`)
- Watch mode — real-time background scanning, scoped to file/folder/workspace
- Scan report — `bawbel report` output in a webview panel (`Cmd+Alt+R`)
- False-positive suppression — right-click → suppress → saved to `.bawbel-suppress.json`
- `suppressed_by` resolved from `git config user.name` — full audit trail
- Team suppressions — commit `.bawbel-suppress.json` to share with your team
- Status bar: `Bawbel: ✓ clean` · `Bawbel: 3 finding(s)` · `👁 Bawbel: watching`

**Build from source:**

```bash
cd vscode/
npm install
npx vsce package --no-dependencies
code --install-extension bawbel-scanner-1.1.0.vsix
```

See [`vscode/README.md`](vscode/README.md) for full documentation, configuration
reference, and GIF demos.

---

## Pre-commit

Block malicious skills at the commit boundary — before they ever reach CI.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/bawbel/bawbel-integrations
    rev: v1
    hooks:
      - id: bawbel-scan
        args: ["--fail-on-severity", "high"]
```

```bash
pip install pre-commit
pre-commit install
pre-commit run bawbel-scan --all-files
```

> **Status:** coming in v1.1 — hook definition in progress.

---

## GitLab CI

```yaml
# .gitlab-ci.yml
bawbel-scan:
  stage: test
  image: python:3.12-slim
  script:
    - pip install "bawbel-scanner[all]"
    - bawbel scan . --recursive --fail-on-severity high --format sarif
  artifacts:
    reports:
      sast: bawbel-results.sarif
```

> **Status:** coming in v1.1.

---

## Install Bawbel Scanner

```bash
pip install bawbel-scanner                  # pattern engine only
pip install "bawbel-scanner[all]"           # all engines (recommended)
pip install "bawbel-scanner[yara,semgrep]"  # pattern + YARA + Semgrep
pip install "bawbel-scanner[magika]"        # + content-type verification
pip install "bawbel-scanner[llm]"           # + LLM semantic analysis
```

First scan:

```bash
bawbel scan ./skills/ --recursive
```

---

## Links

- [bawbel.io](https://bawbel.io) — web scanner, docs, enterprise
- [bawbel-scanner](https://github.com/bawbel/bawbel-scanner) — CLI scanner
- [bawbel-ave](https://github.com/bawbel/bawbel-ave) — AVE standard (40 records)
- [PiranhaDB](https://api.piranha.bawbel.io) — AVE threat intelligence API
- [Docs](https://bawbel.io/docs)

---

## License

Apache License 2.0 — see [LICENSE](LICENSE)