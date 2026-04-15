<div align="center">

# Bawbel Integrations

**CI/CD integrations for agentic AI security scanning**

[![License](https://img.shields.io/badge/License-Apache_2.0-teal.svg)](LICENSE)
[![AVE Standard](https://img.shields.io/badge/AVE-Standard-green.svg)](https://github.com/bawbel/bawbel-ave)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](CONTRIBUTING.md)

[bawbel-scanner](https://github.com/bawbel/bawbel-scanner) · [AVE Standard](https://github.com/bawbel/bawbel-ave) · [bawbel.io](https://bawbel.io)

</div>

---

## What is this?

This repository contains integrations that bring **Bawbel Scanner** into every major CI/CD platform. Scan your AI skills, MCP servers, system prompts, and agent plugins automatically on every commit — before they reach production.

One scanner. Every pipeline.

---

## Supported Platforms

| Platform | Status | Directory |
|---|---|---|
| **GitHub Actions** | 🚧 Coming soon | `github-action/` |
| **GitLab CI** | 🚧 Coming soon | `gitlab-ci/` |
| **Jenkins** | 🚧 Coming soon | `jenkins/` |
| **CircleCI** | 🚧 Coming soon | `circleci/` |
| **Bitbucket Pipelines** | 🚧 Coming soon | `bitbucket/` |
| **Azure DevOps** | 🚧 Coming soon | `azure-devops/` |
| **pre-commit** | 🚧 Coming soon | `pre-commit/` |

---

## GitHub Actions

```yaml
# .github/workflows/scan-skills.yml
name: Scan AI Components

on:
  push:
    paths:
      - '**.md'
      - '**/mcp*.json'
  pull_request:

jobs:
  bawbel-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bawbel/bawbel-integrations/github-action@main
        with:
          path: .
          fail-on-severity: high
          format: sarif
```

Results appear as inline PR annotations via GitHub Code Scanning.

---

## GitLab CI

```yaml
# .gitlab-ci.yml
bawbel-scan:
  image: python:3.12-slim
  stage: test
  script:
    - pip install bawbel-scanner
    - bawbel scan . --recursive --fail-on-severity high --format sarif --output gl-sast-report.json
  artifacts:
    reports:
      sast: gl-sast-report.json
```

---

## Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any
    stages {
        stage('Scan AI Components') {
            steps {
                sh 'pip install bawbel-scanner'
                sh 'bawbel scan . --recursive --fail-on-severity high --format sarif --output bawbel-results.sarif'
            }
            post {
                always {
                    recordIssues tool: sarif(pattern: 'bawbel-results.sarif')
                }
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
      - image: python:3.12-slim
    steps:
      - checkout
      - run:
          name: Install Bawbel Scanner
          command: pip install bawbel-scanner
      - run:
          name: Scan AI components
          command: bawbel scan . --recursive --fail-on-severity high

workflows:
  security:
    jobs:
      - bawbel-scan
```

---

## Bitbucket Pipelines

```yaml
# bitbucket-pipelines.yml
pipelines:
  default:
    - step:
        name: Scan AI Components
        image: python:3.12-slim
        script:
          - pip install bawbel-scanner
          - bawbel scan . --recursive --fail-on-severity high
```

---

## Azure DevOps

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: UsePythonVersion@0
    inputs:
      versionSpec: '3.12'

  - script: pip install bawbel-scanner
    displayName: Install Bawbel Scanner

  - script: bawbel scan . --recursive --fail-on-severity high --format sarif --output bawbel-results.sarif
    displayName: Scan AI Components

  - task: PublishTestResults@2
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: 'bawbel-results.sarif'
```

---

## pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/bawbel/bawbel-integrations
    rev: v0.1.0
    hooks:
      - id: bawbel-scan
        args: [--fail-on-severity, high]
```

Install and run:

```bash
pip install pre-commit
pre-commit install
pre-commit run bawbel-scan --all-files
```

---

## Exit Codes

All integrations use consistent exit codes from `bawbel-scanner`:

| Code | Meaning | CI/CD behaviour |
|---|---|---|
| `0` | Clean — no findings | Pipeline passes |
| `1` | Warnings found | Pipeline passes (configurable) |
| `2` | Critical or high findings | Pipeline fails |

---

## Output Formats

| Format | Flag | Use case |
|---|---|---|
| Text | `--format text` | Local development |
| JSON | `--format json` | Custom processing |
| Markdown | `--format markdown` | PR comments |
| SARIF | `--format sarif` | GitHub/GitLab Code Scanning |

---

## Repository Structure

```
bawbel-integrations/
├── github-action/        GitHub Actions workflow + action.yml
├── gitlab-ci/            GitLab CI template
├── jenkins/              Jenkins shared library
├── circleci/             CircleCI orb
├── bitbucket/            Bitbucket Pipelines pipe
├── azure-devops/         Azure DevOps extension
├── pre-commit/           pre-commit hook
└── docs/                 Integration guides and examples
```

---

## Contributing

Want to add an integration for a platform not listed here? We welcome contributions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Related Projects

| Project | Description |
|---|---|
| [bawbel-scanner](https://github.com/bawbel/bawbel-scanner) | The CLI scanner this repo integrates |
| [bawbel-ave](https://github.com/bawbel/bawbel-ave) | AVE standard — the vulnerability database |
| [bawbel.io](https://bawbel.io) | Web scanner, verified registry, enterprise platform |

---

## License

Apache License 2.0 — see [LICENSE](LICENSE)

---

<div align="center">
Built by <a href="https://bawbel.io">Bawbel</a> · <a href="https://twitter.com/bawbel_io">@bawbel_io</a> · <a href="https://linkedin.com/company/bawbel">LinkedIn</a>
</div>
