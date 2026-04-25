# bawbel-integrations

Integrations for [Bawbel Scanner](https://bawbel.io) — scan agentic AI
components for [AVE vulnerabilities](https://github.com/bawbel/bawbel-ave)
across every stage of your development workflow.

---

## GitHub Actions

Scan on every push and pull request. Findings go to the GitHub Security tab.

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
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: bawbel-results.sarif
```

See [`action.yml`](action.yml) for all inputs/outputs.
See [`examples/`](examples/) for more workflow patterns.

---

## VS Code Extension

Inline diagnostics, status bar, auto-scan on save.

```bash
# Prerequisites
pip install "bawbel-scanner[all]"
```

Then install the extension from the VS Code Marketplace (search **Bawbel Scanner**)
or build from source:

```bash
cd vscode/
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

See [`vscode/README.md`](vscode/README.md) for full documentation.

---

## Pre-commit (coming soon)

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/bawbel/bawbel-integrations
    rev: v1
    hooks:
      - id: bawbel-scan
        args: ["--fail-on-severity", "high"]
```

---

## GitLab CI (coming soon)

```yaml
bawbel-scan:
  stage: test
  script:
    - pip install "bawbel-scanner[all]"
    - bawbel scan . --recursive --format sarif
  artifacts:
    reports:
      sast: bawbel-results.sarif
```

---

## All integrations

| Integration | Status | Usage |
|---|---|---|
| GitHub Actions | ✅ v1 | `uses: bawbel/bawbel-integrations@v1` |
| VS Code | ✅ v1 | Marketplace: search "Bawbel Scanner" |
| Pre-commit | 🔨 v1.1 | `.pre-commit-config.yaml` |
| GitLab CI | 🔨 v1.1 | `.gitlab-ci.yml` |
| Jenkins | 📋 v1.2 | `Jenkinsfile` |
| CircleCI | 📋 v1.2 | `.circleci/config.yml` |

---

## Install Bawbel Scanner

```bash
pip install bawbel-scanner                    # base — pattern engine only
pip install "bawbel-scanner[all]"             # everything (recommended)
```

Docs: [bawbel.io/docs](https://bawbel.io/docs)
AVE Standard: [github.com/bawbel/bawbel-ave](https://github.com/bawbel/bawbel-ave)