# DevOps, testing and security resources

Records live in `resources/catalog/devops-testing-security.json`. Each one is automatically checked (verification `partial`, 2026-10-10): the repository exists, homepage/docs resolve and the registry license matches the recorded license. The code is **not** reviewed or tested in Genlib, so pin versions and run the project's own checks before relying on a pick.

**How to choose.** Start from the project's existing stack and package manager: prefer the tool already configured in the repository, then the official or most widely used option for that language (for example Vitest for Vite/TypeScript, pytest for Python, Testify for Go, rstest/proptest for Rust). Prefer OSI-licensed tools; records marked `license-review` (Terraform and Vault under BUSL, CodeQL CLI terms, Infisical open-core) need a license decision before embedding, and AGPL tools (Grafana, Loki, Tempo, k6, Renovate, TruffleHog) are fine to run unmodified but need review before modification or offering as a network service. `service` records (Fly.io, Render, Railway, Snyk, Socket, Dependabot) are hosted products governed by provider terms, pricing and data paths. Security scanners, load tests and DAST tools must only target systems you own or are authorized to test. Related Genlib modules: `structured-logger` (pino, winston, structlog, loguru, zap, zerolog, tracing, OpenTelemetry, Loki), `health-checks` (Kubernetes probes, Prometheus, Uptime Kuma), `security-headers` (Caddy, NGINX, ZAP baseline) and `env-config` (SOPS, Infisical).

Search with `node tools/resources.mjs search "<need>" --project devops-infra` (or `testing-qa`, `security`).

## CI/CD and release

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Official GitHub Action that checks out the repository into the workflow workspace. | `actions-checkout` | Use instead of hand-written git clone/auth steps in GitHub Actions workflows. | MIT |
| Official GitHub Action that installs a Node.js version and optionally caches npm, yarn or pnpm dependencies. | `actions-setup-node` | Use instead of hand-written Node installation and package-cache scripts in GitHub Actions. | MIT |
| Official GitHub Action that saves and restores dependency and build caches between workflow runs. | `actions-cache` | Use instead of hand-rolled artifact upload/download tricks for caching build outputs in GitHub Actions. | MIT |
| Runs GitHub Actions workflows locally in Docker containers. | `act` | Use instead of push-and-wait debugging of GitHub Actions workflows. | MIT |
| Versioning and changelog workflow for single packages and monorepos based on committed change files. | `changesets` | Use instead of hand-editing versions and changelogs across monorepo packages. | MIT |
| Fully automated version bumps, changelogs and publishing from Conventional Commit messages. | `semantic-release` | Use instead of hand-written release scripts that compute versions, tag and publish. | MIT |
| Generates release pull requests with version bumps and changelogs from Conventional Commits. | `release-please` | Use instead of manual release PRs and changelog edits; supports many languages via release types. | Apache-2.0 |
| Automated dependency update bot for many package managers, lockfiles, Dockerfiles and CI configs. | `renovate` | Use instead of manually checking and bumping dependencies across ecosystems. | AGPL-3.0-only |
| GitHub's built-in dependency update and security alert service. | `dependabot` | Use instead of manual dependency monitoring on GitHub-hosted repositories with a committed dependabot.yml. (service) | Service / terms |
| High-performance task runner and build cache for JavaScript/TypeScript monorepos. | `turborepo` | Use instead of hand-written monorepo scripts that order builds and skip unchanged packages. | MIT |
| Monorepo build system with task graph, affected-project detection, caching and code generators. | `nx` | Use instead of custom scripts computing which monorepo projects changed and need rebuilding. | MIT |
| Fast, disk-efficient Node.js package manager with strict dependency isolation and workspace support. | `pnpm` | Use instead of hand-managed node_modules linking in monorepos when a project standardizes on pnpm. | MIT |
| Polyglot tool version manager, environment loader and task runner (asdf-compatible). | `mise` | Use instead of per-language version managers and ad-hoc setup scripts for Node, Python, Go and other toolchains. | MIT |
| Plugin-based version manager for multiple language runtimes via .tool-versions. | `asdf` | Use instead of juggling nvm, pyenv and similar tools separately. | MIT |
| Lightweight manager for Git hooks committed with the repository. | `husky` | Use instead of hand-copying scripts into .git/hooks for pre-commit and commit-msg checks. | MIT |
| Runs linters and formatters only on staged Git files. | `lint-staged` | Use instead of custom scripts that diff staged files and pipe them to linters. | MIT |
| Fast polyglot Git hooks manager with parallel commands configured in lefthook.yml. | `lefthook` | Use instead of hand-written hook scripts in multi-language repositories. | MIT |

## Containers, infrastructure as code and deployment

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Official reference for Dockerfiles, images, builds, networking and the Docker CLI. | `docker-docs` | Use instead of guessing Dockerfile syntax or build/security best practices. | Service / terms |
| Defines and runs multi-container applications from a compose.yaml file. | `docker-compose` | Use instead of shell scripts that start, network and tear down local service containers. | Apache-2.0 |
| Daemonless, rootless OCI container engine with a Docker-compatible CLI. | `podman` | Use instead of a root Docker daemon when rootless containers or Docker Desktop licensing are concerns. | Apache-2.0 |
| Container orchestration platform for deploying, scaling and healing workloads. | `kubernetes` | Use instead of custom scheduling, rolling-update and health-restart scripts when operating many services. | Apache-2.0 |
| Package manager for Kubernetes that templates and versions application manifests as charts. | `helm` | Use instead of copy-pasted, hand-templated Kubernetes YAML per environment. | Apache-2.0 |
| Runs local Kubernetes clusters using Docker container nodes, mainly for testing and CI. | `kind` | Use instead of provisioning a cloud cluster to test manifests or controllers in CI. | Apache-2.0 |
| Runs lightweight k3s Kubernetes clusters in Docker for local development. | `k3d` | Use instead of heavyweight local clusters when iterating on Kubernetes deployments. | MIT |
| Open-source infrastructure-as-code tool compatible with Terraform configurations and providers. | `opentofu` | Use instead of click-ops or hand-written cloud API scripts for provisioning infrastructure, when an OSI license is required. | MPL-2.0 |
| HashiCorp's infrastructure-as-code tool with a large provider ecosystem. | `terraform` | Use instead of hand-written cloud provisioning scripts when the organization already standardizes on Terraform and accepts BUSL terms. (license-review) | BUSL-1.1 |
| Infrastructure as code in TypeScript, Python, Go, C# and Java. | `pulumi` | Use instead of hand-written cloud SDK provisioning scripts when infrastructure should live in a general-purpose language. | Apache-2.0 |
| Agentless configuration management and automation over SSH using YAML playbooks. | `ansible` | Use instead of hand-written SSH shell scripts for server configuration and deployment. | GPL-3.0-or-later |
| Web server and reverse proxy with automatic HTTPS certificates. | `caddy` | Use instead of hand-configured TLS certificate renewal and reverse-proxy setup. | Apache-2.0 |
| Cloud-native reverse proxy and load balancer that configures routes from Docker and Kubernetes labels. | `traefik` | Use instead of manually rewriting proxy configs when containers come and go. | MIT |
| High-performance HTTP server, reverse proxy and load balancer. | `nginx` | Use instead of serving static assets or proxying from application code. | BSD-2-Clause |
| Self-hostable PaaS for deploying apps, databases and services to your own servers. | `coolify` | Use instead of building a custom deploy dashboard on top of Docker and a reverse proxy. | Apache-2.0 |
| Docker-powered single-server PaaS with git-push deploys. | `dokku` | Use instead of hand-written deployment scripts for small apps on a single VPS. | MIT |
| Deploys containerized web apps to any servers with zero-downtime rolling restarts. | `kamal` | Use instead of hand-written SSH + Docker deployment scripts for VMs or bare metal. | MIT |
| Framework for defining and deploying full-stack apps and infrastructure on AWS and Cloudflare in TypeScript. | `sst` | Use instead of hand-writing infrastructure and deploy glue for serverless full-stack apps. | MIT |
| Hosted platform that runs containerized apps on VMs close to users. | `flyio-docs` | Use instead of operating your own servers when a managed container host with global regions fits. (service) | Service / terms |
| Managed hosting for web services, static sites, workers, cron jobs and databases. | `render-docs` | Use instead of self-managing servers for typical web apps with Git-based deploys. (service) | Service / terms |
| Managed platform for deploying apps and databases from Git or Docker images. | `railway-docs` | Use instead of self-managing servers for prototypes and small production services. (service) | Service / terms |

## Observability and logging

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Vendor-neutral tracing, metrics and logs SDK for Node.js and browsers. | `opentelemetry-js` | Use instead of hand-instrumenting request timing and vendor-specific tracing clients. | Apache-2.0 |
| Vendor-neutral tracing, metrics and logs API and SDK for Python. | `opentelemetry-python` | Use instead of hand-written timing middleware and vendor-locked tracing clients in Python services. | Apache-2.0 |
| Vendor-agnostic agent/gateway that receives, processes and exports telemetry. | `opentelemetry-collector` | Use instead of custom telemetry relays, batching and per-vendor exporters in each service. | Apache-2.0 |
| Pull-based metrics database and alerting toolkit with the PromQL query language. | `prometheus` | Use instead of custom metric storage and threshold-alert scripts. | Apache-2.0 |
| Dashboards and alerting over Prometheus, Loki, Tempo, SQL and many other data sources. | `grafana` | Use instead of building custom operational dashboards and alert UIs. | AGPL-3.0-only |
| Log aggregation system that indexes labels rather than full log content. | `grafana-loki` | Use instead of shipping logs to ad-hoc files or a custom search index. | AGPL-3.0-only |
| High-scale distributed tracing backend that stores traces in object storage. | `grafana-tempo` | Use instead of running a custom trace store for OpenTelemetry data. | AGPL-3.0-only |
| Distributed tracing backend and UI that accepts OpenTelemetry data. | `jaeger` | Use instead of grepping logs to follow requests across services. | Apache-2.0 |
| Error and performance monitoring SDK for browsers, Node.js and JS frameworks. | `sentry-javascript` | Use instead of hand-written global error handlers that post stack traces to a custom endpoint. | MIT |
| Error and performance monitoring SDK for Python with Django, Flask, FastAPI and Celery integrations. | `sentry-python` | Use instead of custom exception hooks and email-on-error scripts. | MIT |
| Very fast JSON structured logger for Node.js. | `pino` | Use instead of console.log wrappers or hand-built JSON log formatting in Node services. | MIT |
| Versatile Node.js logger with pluggable transports and formats. | `winston` | Use instead of hand-rolled multi-destination logging in Node applications. | MIT |
| Structured logging for Python with processor pipelines and JSON output. | `structlog` | Use instead of string-formatted logging and custom JSON log formatters in Python. | MIT OR Apache-2.0 |
| Python logging library with zero-boilerplate setup, rotation and structured serialization. | `loguru` | Use instead of verbose logging.config setup for scripts and services. | MIT |
| Blazing fast, structured, leveled logging for Go. | `zap` | Use instead of fmt-based log lines or hand-built JSON logging in Go services. | MIT |
| Zero-allocation JSON logger for Go. | `zerolog` | Use instead of hand-written JSON log encoding in latency-sensitive Go code. | MIT |
| Application-level structured tracing and logging framework for Rust, including async code. | `tokio-tracing` | Use instead of println!-style logging or hand-built span timing in Rust services. | MIT |
| Self-hosted uptime monitor with HTTP, TCP, DNS checks, status pages and notifications. | `uptime-kuma` | Use instead of cron-based ping scripts for endpoint availability monitoring. | MIT |

## Testing and QA

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Vite-native unit test framework with Jest-compatible APIs, fast watch mode and coverage. | `vitest` | Use instead of hand-rolled assertion runners or slow transpile-heavy test setups in Vite/TypeScript projects. | MIT |
| Widely used JavaScript test runner with mocking, snapshots and coverage. | `jest` | Use instead of custom test harnesses in existing Jest-based or React Native projects. | MIT |
| Cross-browser end-to-end testing and automation for Chromium, Firefox and WebKit. | `playwright` | Use instead of hand-written Selenium scripts and sleeps for end-to-end and browser regression tests. | Apache-2.0 |
| In-browser end-to-end and component testing with time-travel debugging. | `cypress` | Use instead of hand-written browser automation for front-end E2E and component tests. | MIT |
| Utilities for testing UI components the way users interact with them, for React, Vue, Svelte, Angular and DOM. | `testing-library` | Use instead of implementation-detail tests that poke component internals. | MIT |
| API mocking library that intercepts network requests in browsers and Node.js. | `msw` | Use instead of stubbing fetch/axios by hand in tests and local development. | MIT |
| Turns Storybook stories into executable smoke, interaction and accessibility tests. | `storybook-test-runner` | Use instead of duplicating component states in separate test files. | MIT |
| Python testing framework with fixtures, parametrization and a large plugin ecosystem. | `pytest` | Use instead of unittest boilerplate or custom test runners in Python. | MIT |
| Property-based testing for Python that generates and shrinks failing inputs. | `hypothesis` | Use instead of hand-enumerated edge-case tables for parsers, serializers and invariants. | MPL-2.0 |
| Assertions, mocks and suites for Go tests. | `testify` | Use instead of repetitive if/t.Errorf assertion boilerplate in Go tests. | MIT |
| Fixture-based and parametrized test framework for Rust. | `rstest` | Use instead of copy-pasted Rust test functions for each input case. | MIT OR Apache-2.0 |
| Hypothesis-like property-based testing with shrinking for Rust. | `proptest` | Use instead of hand-picked edge cases for Rust parsers and data structures. | MIT OR Apache-2.0 |
| Load and performance testing tool with JavaScript test scripts. | `k6` | Use instead of hand-written concurrent request loops for load testing. | AGPL-3.0-only |
| Scalable load testing with user behavior written in Python. | `locust` | Use instead of custom threaded Python scripts for load generation. | MIT |
| Load testing for HTTP, WebSocket and Playwright-driven browser scenarios defined in YAML or JS. | `artillery` | Use instead of hand-written load scripts when YAML scenarios or Playwright-based load tests fit. | MPL-2.0 |
| Accessibility rules engine for automated WCAG checks in browsers and test frameworks. | `axe-core` | Use instead of hand-written accessibility assertions in unit, E2E and CI tests. | MPL-2.0 |
| Command-line and Node accessibility tester that runs axe or HTML_CodeSniffer against pages. | `pa11y` | Use instead of manual page-by-page accessibility spot checks; pa11y-ci runs URL lists in CI. | LGPL-3.0-only |
| Runs Lighthouse in CI and asserts budgets for performance, accessibility, SEO and best practices. | `lighthouse-ci` | Use instead of manual Lighthouse runs and ad-hoc performance budget scripts. | Apache-2.0 |
| Starts throwaway Docker containers (databases, brokers, browsers) from integration tests. | `testcontainers-node` | Use instead of shared test databases or hand-written docker run scripts in integration tests. | MIT |
| Go library for disposable Docker containers in integration tests. | `testcontainers-go` | Use instead of hand-written container setup and teardown in Go integration tests. | MIT |
| Python library for disposable Docker containers in integration tests. | `testcontainers-python` | Use instead of hand-written container fixtures in pytest integration tests. | Apache-2.0 |
| Generates realistic fake names, addresses, dates and other data for tests and seeds. | `faker-js` | Use instead of hand-written fixture generators and hard-coded sample data. | MIT |
| Python package that generates fake data for tests, seeds and anonymization. | `faker-python` | Use instead of hand-written random fixture builders in Python. | MIT |
| Property-based testing for JavaScript and TypeScript with shrinking. | `fast-check` | Use instead of hand-picked edge cases for parsers, reducers and validation logic. | MIT |
| Mutation testing for JavaScript and TypeScript to measure test-suite effectiveness. | `stryker-js` | Use instead of relying on line coverage alone to judge test quality. | Apache-2.0 |

## Code quality

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Pluggable linter for JavaScript and TypeScript. | `eslint` | Use instead of code-review comments for style and bug-pattern checks. | MIT |
| Parser and rules that let ESLint lint TypeScript, including type-aware rules. | `typescript-eslint` | Use instead of custom TypeScript lint scripts or relying on tsc alone for bug patterns. | MIT |
| Fast all-in-one formatter and linter for JavaScript, TypeScript, JSON and CSS. | `biome` | Use instead of configuring separate ESLint and Prettier setups when Biome's rules cover the project. | MIT OR Apache-2.0 |
| Opinionated code formatter for JS, TS, CSS, Markdown, YAML and more. | `prettier` | Use instead of style debates and manual formatting fixes. | MIT |
| Very fast Rust-based JavaScript/TypeScript linter from the Oxc toolchain. | `oxlint` | Use instead of slow full ESLint passes for common correctness rules, often alongside ESLint. | MIT |
| Extremely fast Python linter and formatter written in Rust. | `ruff` | Use instead of combining flake8, isort, pyupgrade and Black configurations. | MIT |
| Static type checker for Python. | `mypy` | Use instead of runtime-only discovery of Python type errors. | MIT |
| Fast static type checker for Python. | `pyright` | Use instead of mypy when faster checks or editor-consistent results are preferred. | MIT |
| Fast Go linters runner aggregating dozens of linters with caching. | `golangci-lint` | Use instead of wiring go vet, staticcheck and other linters individually. | GPL-3.0 |
| Official Rust linter with hundreds of correctness, style and performance lints. | `clippy` | Use instead of manual review for common Rust mistakes. | MIT OR Apache-2.0 |
| Finds unused files, exports and dependencies in JavaScript/TypeScript projects. | `knip` | Use instead of hand-auditing dead code and unused package.json dependencies (replaces unmaintained depcheck). | ISC |

## Security, secrets and crypto

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Fast pattern-based static analysis for security bugs across many languages. | `semgrep` | Use instead of grep-based security audits and hand-written AST scanners. | LGPL-2.1 |
| Semantic code analysis engine and query packs used by GitHub code scanning. | `codeql` | Use instead of custom security code review scripts on GitHub repositories with code scanning. (license-review) | Service / terms |
| Scanner for vulnerabilities, misconfigurations, secrets and licenses in images, filesystems, repos and IaC. | `trivy` | Use instead of separate ad-hoc scripts for container, dependency and IaC security scanning. | Apache-2.0 |
| Vulnerability scanner for container images, filesystems and SBOMs. | `grype` | Use instead of manual CVE lookups for image and package dependencies. | Apache-2.0 |
| Generates software bills of materials (SPDX, CycloneDX) from images and filesystems. | `syft` | Use instead of hand-assembled dependency inventories for SBOM requirements. | Apache-2.0 |
| Scans lockfiles, SBOMs and directories for known vulnerabilities using the OSV database. | `osv-scanner` | Use instead of per-ecosystem audit commands when a repository spans several languages. | Apache-2.0 |
| Detects hardcoded secrets in Git history, files and staged changes. | `gitleaks` | Use instead of hand-written regex secret checks in pre-commit hooks and CI. | MIT |
| Finds and verifies leaked credentials across Git, filesystems, cloud storage and more. | `trufflehog` | Use instead of unverified regex secret scanning when you need to know which secrets are live. | AGPL-3.0-only |
| Command-line client for Snyk dependency, code, container and IaC scanning. | `snyk-cli` | Use instead of manual vulnerability triage when the organization already licenses Snyk. (service) | Apache-2.0 |
| Dynamic application security testing (DAST) proxy and scanner, including baseline header checks. | `owasp-zap` | Use instead of manual penetration probes for common web vulnerabilities and missing security headers. | Apache-2.0 |
| Built-in npm command that reports known vulnerabilities in installed dependencies. | `npm-audit` | Use instead of manual advisory lookups for npm projects; run in CI with an audit level. | Artistic-2.0 |
| Supply-chain security service that flags risky package behavior such as install scripts, network access and typosquats. | `socket-dev` | Use instead of manual review of every new npm/PyPI dependency's behavior. (service) | Service / terms |
| Signs and verifies container images and blobs, including keyless signing with OIDC identities. | `cosign` | Use instead of hand-managed GPG signing of release artifacts and images. | Apache-2.0 |
| Encrypts values in YAML, JSON, ENV and INI files with age, PGP or cloud KMS keys. | `sops` | Use instead of committing plaintext secrets or inventing a custom file-encryption scheme. | MPL-2.0 |
| Simple, modern file encryption tool and Go library with small explicit keys. | `age` | Use instead of GPG or hand-built encryption for files and backups. | BSD-3-Clause |
| Open-core secrets management platform with CLI injection, SDKs and secret rotation. | `infisical` | Use instead of sharing .env files or building a custom secrets store. (license-review) | MIT |
| Secrets management, dynamic credentials, encryption-as-a-service and PKI. | `hashicorp-vault` | Use instead of custom credential stores and rotation scripts when BUSL terms are acceptable. (license-review) | BUSL-1.1 |
| Automated checks that score open-source projects on supply-chain security practices. | `openssf-scorecard` | Use instead of manual due diligence on dependency maintenance and repository hygiene. | Apache-2.0 |
| Portable, easy-to-use crypto library for encryption, signatures, password hashing and key exchange. | `libsodium` | Use instead of hand-assembling crypto primitives or writing custom encryption code. | ISC |
| Python bindings to libsodium from the Python Cryptographic Authority. | `pynacl` | Use instead of custom Python encryption or signing code. | Apache-2.0 |
| Argon2 password hashing bindings for Node.js. | `node-argon2` | Use instead of SHA-based or home-made password hashing in Node services. | MIT |
| Argon2 password hashing for Python with safe defaults. | `argon2-cffi` | Use instead of hashlib-based password storage in Python apps. | MIT |
| Modern bcrypt password hashing for Python from the Python Cryptographic Authority. | `pyca-bcrypt` | Use instead of custom salted-hash password storage when bcrypt is required for compatibility. | Apache-2.0 |
| Native bcrypt password hashing for Node.js. | `node-bcrypt` | Use instead of custom salted-hash password code in Node when bcrypt compatibility is needed. | MIT |

## Genlib integration packs

These resource records include sorted `genlib.integrations` bindings and `readiness.level: recipe-available` with the contract as evidence. Read each contract for its supported profile, actual verification and remaining application work. Existing source/license review and module bindings are preserved.

- [Telemetry and disposable database tests](../../integrations/observability-harness/CONTRACT.md): `opentelemetry-collector`, `opentelemetry-js`, `opentelemetry-python`, `testcontainers-node`, `testcontainers-python`.
