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
| [VS Code Extension](#vs-code-extension) | ✅ v1.1.1 | [`vscode/`](vscode/) |
| [Pre-commit](#pre-commit) | ✅ v1.1 | [`.pre-commit-hooks.yaml`](.pre-commit-hooks.yaml) |
| [GitLab CI](#gitlab-ci) | ✅ v1.1 | [`examples/gitlab-ci.yml`](examples/gitlab-ci.yml) |
| [Jenkins](#jenkins) | ✅ v1.1 | [`examples/Jenkinsfile`](examples/Jenkinsfile) |
| [CircleCI](#circleci) | ✅ v1.1 | [`examples/circleci.yml`](examples/circleci.yml) |
| [Azure DevOps](#azure-devops) | ✅ v1.1 | [`examples/azure-devops.yml`](examples/azure-devops.yml) |
| [Bitbucket Pipelines](#bitbucket-pipelines) | ✅ v1.1 | [`examples/bitbucket-pipelines.yml`](examples/bitbucket-pipelines.yml) |

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
code --install-extension bawbel-scanner-1.1.1.vsix
```

See [`vscode/README.md`](vscode/README.md) for full documentation.

---

## Pre-commit

Block malicious skills at the commit boundary — before they reach CI.

### Option 1 — via bawbel-integrations repo (recommended)

pre-commit clones the repo once and caches it. No extra dependencies to manage.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/bawbel/bawbel-integrations
    rev: v1
    hooks:
      - id: bawbel-scan          # pattern engine only (~15ms per file)
```

All engines (YARA + Semgrep + Magika — slower, more thorough):

```yaml
repos:
  - repo: https://github.com/bawbel/bawbel-integrations
    rev: v1
    hooks:
      - id: bawbel-scan-all
```

Custom severity threshold:

```yaml
repos:
  - repo: https://github.com/bawbel/bawbel-integrations
    rev: v1
    hooks:
      - id: bawbel-scan
        args: ["--fail-on-severity", "critical"]
```

### Option 2 — local hook (air-gapped / no GitHub access)

Use this when your environment cannot reach GitHub, or you want to control
the scanner version yourself.

```bash
pip install "bawbel-scanner>=1.0.1"
```

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: bawbel-scan
        name: Bawbel Scanner
        entry: bawbel scan
        language: system
        types_or: [markdown, yaml, json]
        pass_filenames: true
        args: ["--fail-on-severity", "high"]
```

All engines:

```yaml
repos:
  - repo: local
    hooks:
      - id: bawbel-scan-all
        name: Bawbel Scanner (all engines)
        entry: bawbel scan
        language: system
        types_or: [markdown, yaml, json]
        pass_filenames: true
        args: ["--fail-on-severity", "high", "--no-ignore"]
```

### Setup

```bash
pip install pre-commit
pre-commit install

# Test without committing
pre-commit run bawbel-scan --all-files
```

### Suppressing false positives

```markdown
fetch https://internal.company.com  <!-- bawbel-ignore: bawbel-external-fetch -->
```

Skip hooks for one commit:

```bash
git commit --no-verify
```

---

## GitLab CI

Findings uploaded as SAST report — visible in the GitLab Security Dashboard.

```yaml
# .gitlab-ci.yml
bawbel-scan:
  stage: test
  image: python:3.12-slim
  script:
    - pip install "bawbel-scanner[all]"
    - bawbel scan . --recursive --fail-on-severity high --format sarif
      --output bawbel-results.sarif
  artifacts:
    reports:
      sast: bawbel-results.sarif
    paths:
      - bawbel-results.sarif
    when: always
```

Block merge requests on findings:

```yaml
bawbel-scan:
  stage: test
  image: python:3.12-slim
  script:
    - pip install "bawbel-scanner[all]"
    - bawbel scan . --recursive --fail-on-severity high
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

---

## Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any

    stages {
        stage('Bawbel Security Scan') {
            steps {
                sh 'pip install "bawbel-scanner[all]"'
                sh 'bawbel scan . --recursive --format sarif'
            }
            post {
                always {
                    // Archive SARIF for downstream processing
                    archiveArtifacts artifacts: 'bawbel-results.sarif',
                                     allowEmptyArchive: true
                }
            }
        }
    }
}
```

Fail the build on HIGH+ findings:

```groovy
stage('Bawbel Security Scan') {
    steps {
        sh '''
            pip install "bawbel-scanner[all]"
            bawbel scan . --recursive --fail-on-severity high
        '''
    }
}
```

With Docker agent:

```groovy
pipeline {
    agent {
        docker { image 'python:3.12-slim' }
    }
    stages {
        stage('Scan') {
            steps {
                sh 'pip install "bawbel-scanner[all]"'
                sh 'bawbel scan . --recursive --fail-on-severity high'
            }
        }
    }
}
```

---

## CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  bawbel-scan:
    docker:
      - image: cimg/python:3.12
    steps:
      - checkout
      - run:
          name: Install Bawbel Scanner
          command: pip install "bawbel-scanner[all]"
      - run:
          name: Scan for AVE vulnerabilities
          command: |
            bawbel scan . --recursive --format sarif
      - store_artifacts:
          path: bawbel-results.sarif
          destination: security/bawbel-results.sarif

workflows:
  security:
    jobs:
      - bawbel-scan
```

Fail on HIGH+ findings:

```yaml
      - run:
          name: Scan for AVE vulnerabilities
          command: |
            bawbel scan . --recursive --fail-on-severity high
```

---

## Azure DevOps

```yaml
# azure-pipelines.yml
trigger:
  - main
  - develop

pool:
  vmImage: ubuntu-latest

steps:
  - task: UsePythonVersion@0
    inputs:
      versionSpec: '3.12'

  - script: pip install "bawbel-scanner[all]"
    displayName: Install Bawbel Scanner

  - script: |
      bawbel scan . --recursive --format sarif
    displayName: Scan for AVE vulnerabilities

  - task: PublishBuildArtifacts@1
    condition: always()
    inputs:
      pathToPublish: bawbel-results.sarif
      artifactName: bawbel-security-report
```

Fail the pipeline on HIGH+ findings:

```yaml
  - script: |
      bawbel scan . --recursive --fail-on-severity high
    displayName: Scan for AVE vulnerabilities
    failOnStderr: false
```

---

## Bitbucket Pipelines

```yaml
# bitbucket-pipelines.yml
pipelines:
  default:
    - step:
        name: Bawbel Security Scan
        image: python:3.12-slim
        script:
          - pip install "bawbel-scanner[all]"
          - bawbel scan . --recursive --fail-on-severity high
        artifacts:
          - bawbel-results.sarif

  pull-requests:
    '**':
      - step:
          name: Bawbel Security Scan
          image: python:3.12-slim
          script:
            - pip install "bawbel-scanner[all]"
            - bawbel scan . --recursive --fail-on-severity high
```

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