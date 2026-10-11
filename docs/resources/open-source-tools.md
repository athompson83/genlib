# Popular open-source tools

The most popular self-hostable open-source applications and the libraries and SDKs that drive them, across local AI (Ollama, Open WebUI, whisper.cpp, Context-Mode), documents and productivity (Stirling-PDF, AppFlowy, Docmost), design (Penpot), automation (n8n), PaaS (Coolify), monitoring (Uptime Kuma), BI (Apache Superset), databases, search, storage, auth, security, media, e-commerce, project management and more, plus every entry of the open-source alternatives directories (RunaCapital/awesome-oss-alternatives, btw-so/open-source-alternatives). Records note the proprietary products they replace, so a search such as `figma alternative` finds Penpot.

Every record was checked on 2026-10-10: `git ls-remote` for repositories, the registry API for packages, and Docker Hub, ghcr.io or quay.io for official images, pinned to the latest release tag where one exists. Licenses come from registry metadata or the LICENSE file. Records marked `license-review` are copyleft (GPL, AGPL), source-available (BUSL, SSPL, Elastic, Sustainable Use such as n8n, Commons Clause), custom (Open WebUI branding clause) or unknown; decide before embedding or offering them as a service. Popularity is the registry's own number or GitHub stars and only comparable within one ecosystem.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find figma alternative --json
node "$GENLIB_ROOT/bin/genlib.mjs" find run llm locally --target "$APP_ROOT" --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect ollama --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 333 |
| python | 178 |
| go | 191 |
| rust | 79 |
| java | 64 |
| kotlin | 10 |
| csharp | 46 |
| ruby | 42 |
| php | 121 |
| dart | 16 |
| swift | 6 |
| elixir | 13 |
| any | 143 |

Total: 1242 records in `resources/catalog/open-source-tools*.json`.

## Local AI: model runners, chat UIs, speech and RAG

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `playwright-mcp`, `upstash-context7-mcp`, `node-llama-cpp`, `mem0ai-npm`, `dify-ai` (review) | Apache-2.0, Dify-Open-Source-License (Apache-2.0 with additional conditions), MIT |
| python | `langchain-core`, `mlflow`, `pytesseract`, `llama-index-core`, `ultralytics` (review) | AGPL-3.0, Apache License 2.0, Apache-2.0, MIT |
| go | `ragflow`, `localai`, `github-mcp-server`, `seldon-core` (review), `go-sdk-go-4` (review) | Apache-2.0, BUSL-1.1, MIT, unknown |
| rust | `rust-rmcp`, `ollama-rs`, `openinterpreter`, `jan`, `tabby` | Apache-2.0, non-standard |
| java | `io-modelcontextprotocol-sdk-mcp`, `io-github-ollama4j-ollama4j` | MIT |
| kotlin | `io-modelcontextprotocol-kotlin-sdk` (review) | unknown |
| csharp | `modelcontextprotocol` (review), `ollamasharp` | MIT, unknown |
| ruby | `ollama-ai` | MIT |
| php | `ardagnsrn-ollama-php` | MIT |
| dart | `ollama-dart` | MIT |
| any | `gpt4all`, `mindsdb`, `llamafile`, `metarank`, `ycmd` (review) | Apache-2.0, GPL-3.0, MIT |

## Productivity, documents and knowledge

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `pdf-lib`, `blocknote-core`, `pdfjs-nuget`, `stirling-pdf`, `affine` | Apache-2.0, MIT, MPL-2.0 |
| python | `paperless-ngx` (review), `archivebox`, `calibre-github` (review), `suitenumerique-docs`, `linkding` | GPL-3.0, MIT |
| go | `memos`, `shiori`, `miniflux`, `pdfcpu`, `bitmagnet` | Apache-2.0, MIT |
| rust | `lopdf`, `rustypaste`, `wastebin` | MIT |
| java | `commafeed`, `org-apache-pdfbox-pdfbox`, `xwiki` | Apache-2.0, LGPL-2.1 |
| csharp | `questpdf` (review), `pdfpig`, `mail-archiver` (review) | Apache-2.0, GPL-3.0, unknown |
| ruby | `prawn`, `hexapdf` (review), `stringer`, `password-pusher` | AGPL-3.0, Apache-2.0, MIT, Nonstandard |
| php | `phpoffice-phpspreadsheet`, `dompdf-dompdf`, `tecnickcom-tcpdf`, `mpdf-mpdf` (review), `freshrss` (review) | AGPL-3.0, GPL-2.0-only, LGPL-2.1, LGPL-3.0-or-later, MIT |
| dart | `appflowy` (review), `dart-pdf`, `syncfusion-flutter-pdfviewer` (review) | AGPL-3.0, Apache-2.0, unknown |
| any | `logseq` (review), `onlyoffice` (review), `athens-research`, `qpdf`, `online` | AGPL-3.0, Apache-2.0, EPL-2.0, MPL-2.0 |

## Design, whiteboards and diagramming

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `xyflow-react`, `tldraw-npm` (review), `bpmn-js`, `antv-x6`, `draw-io` | Apache-2.0, MIT, SEE LICENSE IN LICENSE, tldraw-license (source-available; production needs license key) |
| python | `diagrams` | MIT |
| any | `blender-github` (review), `gimp-github` | GPL-2.0, LGPL-2.1 |

## Workflow automation and ETL

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `pg-boss`, `n8n-workflow` (review), `cronicle`, `fredy`, `cronmaster` (review) | AGPL-3.0, Apache-2.0, MIT, Sustainable-Use-1.0 |
| python | `python-dlt`, `inngest` (review), `luigi`, `changedetection-io`, `matchering` (review) | Apache-2.0, GPL-3.0 |
| go | `argo-workflows`, `connect` (review), `hatchet`, `inngest-docker` (review), `dagu` (review) | Apache-2.0, Apache-2.0 (core) + commercial/enterprise parts, GPL-3.0, MIT, SSPL-1.0 |
| java | `kestra`, `nifi`, `hop`, `io-temporal-temporal-sdk` | Apache-2.0 |
| csharp | `temporalio` | MIT |
| ruby | `temporalio-gem` | MIT |
| php | `temporal-sdk`, `discount-bandit` (review) | MIT, unknown |

## PaaS, deployment and DevOps

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `dockerode`, `kubernetes-client-node`, `dagger-io-dagger`, `dokploy`, `nginx-proxy-manager` | Apache-2.0, MIT |
| python | `docker`, `kubernetes-pypi`, `dagger-io`, `openbb-terminal`, `bunkerweb` (review) | AGPL-3.0, Apache-2.0 |
| go | `moby`, `lazydocker-go`, `harness`, `k3s`, `colima` | Apache-2.0, MIT |
| rust | `rust-kube`, `nixpacks`, `static-web-server`, `ferron`, `startos` | Apache-2.0, MIT |
| java | `jenkins`, `io-kubernetes-client-java` | Apache-2.0, MIT |
| php | `elgg-elgg`, `openmediavault` (review), `personal-management-system`, `solidinvoice` | LGPL-2.1, MIT, custom |
| any | `envoy`, `haproxy` (review), `dietpi` (review), `zoraxy` (review), `swag-secure-web-application-gateway` (review) | AGPL-3.0, Apache-2.0, GPL-2.0, GPL-3.0 |

## Monitoring, uptime and error tracking

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `sentry-react`, `highlight-run-rrweb`, `highlight-hex` | Apache-2.0, MIT |
| python | `prometheus-client`, `uptime-kuma-api`, `checkmk` (review) | Apache-2.0 AND BSD-2-Clause, GPL-2.0, MIT |
| go | `telegraf-docker`, `go-otel`, `client-golang`, `cortex`, `alloy` | Apache-2.0, MIT |
| rust | `opentelemetry-crates`, `prometheus-crates`, `sentry-crates`, `vector`, `quickwit` | Apache-2.0, MIT, MPL-2.0 |
| java | `zipkin`, `io-opentelemetry-opentelemetry-sdk`, `io-prometheus-prometheus-metrics-core`, `io-sentry-sentry` | Apache-2.0, MIT |
| csharp | `opentelemetry`, `prometheus-net`, `sentry-nuget` | Apache-2.0, MIT |
| ruby | `sentry-ruby`, `opentelemetry-sdk`, `fluentd` | Apache-2.0, MIT |
| php | `sentry-sentry`, `open-telemetry-sdk`, `cachethq-cachet` (review) | Apache-2.0, MIT, custom |
| dart | `sentry-flutter` | MIT |
| elixir | `sentry-hex`, `opentelemetry-hex` | Apache-2.0, MIT |
| any | `self-hosted` (review), `fluent-bit`, `pixie`, `icinga2` (review), `nagioscore` (review) | Apache-2.0, FSL-1.1, GPL-2.0, GPL-3.0 |

## BI and analytics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `netron`, `openmetadata`, `jitsu-cli`, `middleware`, `trench-js` | Apache-2.0, MIT |
| python | `notebook`, `great-expectations-pypi`, `datahub` | Apache-2.0, BSD-3-Clause |
| go | `taleshape-shaper` | MPL-2.0 |
| rust | `dbt` | Apache-2.0 |
| php | `open-web-analytics-open-web-analytics` (review) | GPL-2.0 |

## Databases and database tools

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `ioredis`, `supabase-supabase-js`, `mongodb-npm`, `better-sqlite3`, `kafkajs` | Apache-2.0, MIT |
| python | `redis-pypi`, `pymongo`, `confluent-kafka` (review), `clickhouse-connect`, `supabase-pypi` | Apache-2.0, MIT, unknown |
| go | `etcd`, `tidb`, `cockroach` (review), `go-redis`, `dgraph` | Apache-2.0, BSD-2-Clause, CockroachDB-Software-License |
| rust | `rust-sqlx`, `redis-crates`, `rust-cozo`, `surrealdb-docker` (review), `neon` | Apache-2.0, BSD-3-Clause, BUSL-1.1, MIT OR Apache-2.0, MPL-2.0 |
| java | `pydoris`, `dbeaver`, `kafka`, `flink`, `questdb` | Apache-2.0 |
| kotlin | `org-jetbrains-exposed-exposed-core`, `io-github-jan-tennert-supabase-postgrest-kt`, `io-appwrite-sdk-for-android` | Apache-2.0, BSD-3-Clause, MIT |
| csharp | `microsoft-entityframeworkcore`, `stackexchange-redis` (review), `npgsql`, `supabase-nuget` (review), `appwrite-nuget` | BSD-3-Clause, MIT, PostgreSQL, unknown |
| ruby | `redis-gem`, `ruby-pg`, `appwrite-gem` | BSD-2-Clause, BSD-3-Clause, MIT |
| php | `predis-predis`, `appwrite-appwrite`, `phpmyadmin` (review), `adminer` (review), `totum` | Apache-2.0 OR GPL-2.0, BSD-3-Clause, GPL-2.0, MIT |
| dart | `drift-pub`, `supabase-flutter`, `appwrite-pub`, `postgres-pub`, `pocketbase-pub` | BSD-3-Clause, MIT |
| swift | `supabase-swift`, `sdk-for-apple` | BSD-3-Clause, MIT |
| elixir | `postgrex`, `redix` | Apache-2.0, MIT |
| any | `deeplake` (review), `spark`, `dragonfly` (review), `postgrest`, `tdengine` (review) | AGPL-3.0, Apache-2.0, BUSL-1.1, MIT |

## CMS and site builders

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `sanity-client`, `strapi-strapi` (review), `11ty-eleventy`, `directus-sdk`, `tinacms-npm` | Apache-2.0, MIT, MIT (core) + commercial/enterprise parts |
| python | `wagtail-pypi`, `django-cms` | BSD-3-Clause, MIT |
| go | `hugo`, `ech0` (review) | AGPL-3.0, Apache-2.0 |
| csharp | `umbracocms`, `umbraco-cms-nuget`, `orchardcore-application-cms-targets`, `squidex` | BSD-3-Clause, MIT |
| ruby | `jekyll`, `jekyll-docker`, `haven` | MIT |
| php | `statamic-cms` (review), `pimcore-pimcore` (review), `craftcms-cms` (review), `modx-revolution` (review), `october` (review) | GPL-2.0, custom |
| any | `starter`, `publify`, `vvveb-cms` (review), `superdesk` (review) | AGPL-3.0, MIT |

## Authentication and identity

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `oidc-client-ts`, `keycloak-js`, `ory-client`, `logto-next`, `lucia` | Apache-2.0, MIT |
| python | `python-keycloak`, `supertokens-python`, `opal-permit-io`, `privacyidea` (review) | AGPL-3.0, Apache 2.0, Apache-2.0, MIT |
| go | `authelia`, `casbin-github`, `oauth2-proxy`, `casdoor`, `dex` | Apache-2.0, MIT |
| rust | `rust-oso`, `lldap` (review), `kanidm` | Apache-2.0, GPL-3.0, MPL-2.0 |
| java | `org-keycloak-keycloak-admin-client` | Apache-2.0 |
| csharp | `duende-identityserver` (review) | unknown |
| ruby | `devise`, `omniauth` | MIT |
| php | `league-oauth2-server`, `laravel-socialite` | MIT |
| dart | `flutter-appauth` (review) | unknown |
| elixir | `ueberauth` | MIT |
| any | `fusionauth` (review) | unknown |

## Storage, file sync and media servers

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `tus-js-client`, `uppy-core`, `minio-npm`, `filepond`, `tus-server` | Apache-2.0, MIT |
| python | `minio-pypi`, `kinto`, `copyparty`, `librephotos`, `onionshare` (review) | AGPL-3.0, Apache-2.0, MIT |
| go | `syncthing`, `alist` (review), `photoprism` (review), `harbor`, `cloudreve` (review) | AGPL-3.0, Apache-2.0, GPL-3.0, MPL-2.0 |
| rust | `minio-crates`, `rustfs`, `miniserve`, `hoodik` (review) | Apache-2.0, MIT, custom |
| java | `peergos` (review), `io-minio-minio` | AGPL-3.0, Apache-2.0 |
| csharp | `minio`, `slskd` (review), `damselfly` (review) | AGPL-3.0, Apache-2.0, GPL-3.0 |
| ruby | `shrine` | MIT |
| php | `league-flysystem`, `spatie-laravel-medialibrary`, `nextcloud` (review), `tiny-file-manager` (review), `lychee-docker` | AGPL-3.0, GPL-3.0, MIT |
| dart | `ente` (review) | AGPL-3.0 |
| any | `qbittorrent` (review), `ceph` (review), `seafile`, `transmission` (review), `unison` (review) | AGPL-3.0, GPL-2.0, GPL-3.0, LGPL-2.1 |

## Security, secrets and scanning

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `node-vault`, `infisical-sdk`, `clients` (review), `aliasvault` (review), `padloc` (review) | AGPL-3.0, GPL-2.0, ISC, MIT |
| python | `pip-audit`, `bandit`, `python-hvac`, `checkov`, `infisicalsdk` (review) | Apache License 2.0, Apache-2.0, unknown |
| go | `vault-api` (review), `nuclei`, `crowdsec`, `cert-manager`, `netmaker` | Apache-2.0, BUSL-1.1, MIT |
| rust | `cargo-audit`, `cargo-deny`, `vaultwarden` (review), `openvas-scanner` (review), `matano` | AGPL-3.0, Apache-2.0, Apache-2.0 OR MIT, GPL-2.0, MIT OR Apache-2.0 |
| java | `dependency-track` | Apache-2.0 |
| csharp | `bitwarden` (review) | AGPL-3.0 + Bitwarden-License (custom) |
| ruby | `brakeman` | Brakeman Public Use License |
| php | `roave-security-advisories`, `passbolt` (review), `teampass` (review) | AGPL-3.0, GPL-3.0, MIT |
| elixir | `sobelow`, `firezone` | Apache-2.0 |
| any | `keepassxc` (review), `wazuh`, `falco` | Apache-2.0, GPL-3.0, LGPL-2.1 |

## Video, audio and streaming

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `livekit-client`, `media-chrome`, `livekit-server-sdk`, `lossless-cut` (review), `jitsi-meet` | Apache-2.0, GPL-2.0, MIT |
| python | `speechrecognition`, `livekit`, `beets`, `metube` (review), `mopidy` | AGPL-3.0, Apache-2.0, BSD-3-Clause, MIT |
| go | `navidrome-music-server` (review), `livekit-docker`, `go2rtc`, `stash` (review), `gonic` (review) | AGPL-3.0, Apache-2.0, GPL-3.0, MIT |
| rust | `livekit-crates`, `polaris`, `pinepods` (review), `audioserve` (review) | Apache-2.0, GPL-3.0, MIT, unknown |
| kotlin | `komga`, `io-livekit-livekit-android` | Apache-2.0, MIT |
| csharp | `jellyfin` (review), `sonarr` (review), `jackett` (review), `radarr` (review), `kavita` (review) | GPL-2.0, GPL-3.0 |
| ruby | `black-candy` | MIT |
| php | `azuracast` (review), `ampache` (review), `moode-audio` (review), `libretime` (review), `phanan-koel` | AGPL-3.0, GPL-3.0, MIT |
| dart | `livekit-client-pub` | Apache-2.0 |
| swift | `client-sdk-swift` | Apache-2.0 |
| elixir | `membrane-core`, `pinchflat` (review), `glimesh` | AGPL-3.0, Apache-2.0, MIT |
| any | `srs`, `invidious` (review), `handbrake`, `kodi` (review), `vlc` (review) | AGPL-3.0, GPL-2.0, LGPL-2.1, MIT |

## E-commerce

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `medusajs-medusa`, `lago-javascript-client`, `aimeos-aimeos`, `saleor-app-sdk`, `reaction` (review) | BSD-3-Clause, GPL-3.0, MIT, SEE LICENSE IN LICENSE |
| python | `django-oscar`, `lago-python-client`, `pretix` (review), `shuup` (review) | AGPL-3.0, BSD-3-Clause, MIT, custom |
| go | `flexprice` (review), `openmeter` | AGPL-3.0, Apache-2.0 |
| rust | `hyperswitch` | Apache-2.0 |
| csharp | `nopcommerce` (review), `btcpay-server` | AGPL-3.0 (core) + commercial/enterprise parts, MIT |
| ruby | `solidus-core`, `spree`, `sharetribe` (review) | BSD-3-Clause, custom |
| php | `aimeos-aimeos-laravel`, `woocommerce-woocommerce` (review), `opencart-opencart` (review), `magento-open-source`, `prestashop` | AGPL-3.0, GPL-3.0, MIT, OSL-3.0 |

## Project management

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `fortawesome-font-awesome`, `plane` (review), `focalboard` (review), `feather`, `super-productivity` | AGPL-3.0, AGPL-3.0 (core) + commercial/enterprise parts, MIT |
| python | `activitywatch`, `beaver-habit-tracker`, `timetagger` (review), `reviewboard`, `taiga-back` | BSD-3-Clause, GPL-3.0, MIT, MPL-2.0 |
| go | `vikunja` (review), `donetick` (review), `paca`, `traggo` (review) | AGPL-3.0, Apache-2.0, GPL-3.0 |
| java | `onedev`, `gerrit` | Apache-2.0, MIT |
| ruby | `openproject` (review), `redmine` (review), `octobox` (review), `tracks` (review), `eigenfocus` (review) | AGPL-3.0, GPL-2.0, GPL-3.0, custom |
| php | `phabricator`, `leantime` (review), `kanboard`, `solidtime` (review), `kimai` (review) | AGPL-3.0, Apache-2.0, MIT |
| any | `remixicon` (review), `gitbucket`, `taiga` | Apache-2.0, MPL-2.0, unknown |

## Forms and surveys

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `rjsf-core`, `survey-core`, `formbricks-js`, `typebot-io-js` (review), `formkit` | Apache-2.0, FSL-1.1-ALv2, MIT |
| python | `django-formtools`, `tracardi` (review), `kpi` (review) | AGPL-3.0, BSD, Commons-Clause |
| go | `keploy`, `space-cloud` | Apache-2.0 |
| rust | `engine` (review) | GPL-3.0 |
| ruby | `simple-form` | MIT |
| php | `filament-forms`, `fusio-fusio` | Apache-2.0, MIT |
| elixir | `claper` (review) | AGPL-3.0 |
| any | `apl-core` | Apache-2.0 |

## Search engines and vector search

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `minisearch`, `elastic-elasticsearch`, `opensearch-project-opensearch`, `orama-orama`, `flexsearch` | Apache-2.0, MIT |
| python | `opensearch-py`, `elasticsearch`, `pgvector-pypi`, `typesense-pypi`, `meilisearch-pypi` | Apache 2.0, Apache-2.0, MIT |
| go | `zincsearch`, `hister` (review), `meilisearch-go`, `go-client-go`, `weaviate-go-client` | AGPL-3.0, Apache-2.0, BSD-3-Clause, MIT |
| rust | `tantivy`, `qdrant-client`, `meilisearch-sdk`, `sonic`, `paradedb` (review) | AGPL-3.0, Apache-2.0, MIT, MPL-2.0 |
| java | `elasticsearch-docker` (review), `vespa`, `yacy` (review), `apache-solr`, `fess` | Apache-2.0, SSPL-1.0, unknown |
| csharp | `qdrant-client-nuget`, `meilisearch-nuget` | Apache-2.0, MIT |
| ruby | `searchkick`, `neighbor`, `meilisearch-gem`, `typesense-gem`, `meme-search` | Apache-2.0, MIT |
| php | `laravel-scout`, `meilisearch-meilisearch-php`, `typesense-typesense-php` | Apache-2.0, MIT |
| dart | `meilisearch-pub` | MIT |
| swift | `meilisearch-swift` | MIT |
| any | `manticore-search` (review), `faiss-pypi` | GPL-3.0, MIT |

## Email servers

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `mailparser`, `imapflow`, `smtp-server`, `haraka`, `mailcow` (review) | GPL-3.0, MIT, MIT-0 |
| python | `aiosmtpd`, `mail-in-a-box`, `mailu`, `simplelogin` (review), `modoboa` | AGPL-3.0, Apache-2.0, CC0-1.0, ISC, MIT |
| go | `maddy-mail-server` (review), `go-mox`, `go-imap` | GPL-3.0, MIT |
| rust | `lettre` | MIT |
| java | `davmail` (review), `org-eclipse-angus-angus-mail` (review) | GPL-2.0, unknown |
| csharp | `mailkit` | MIT |
| ruby | `ruby-mail` | MIT |
| php | `symfony-mailer`, `phpmailer-phpmailer`, `jason-munro-cypht`, `roundcube` (review), `anonaddy` (review) | AGPL-3.0, GPL-3.0, LGPL-2.1, LGPL-2.1-only, MIT |
| any | `docker-mailserver`, `debops` (review), `rspamd`, `iredmail` (review), `dovecot` | Apache-2.0, GPL-3.0, MIT, unknown |

## Backup

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `backrest` (review) | GPL-3.0 |
| python | `borgbackup`, `borgmatic` (review), `borgmatic-docker` (review) | BSD-2-Clause, GPL-3.0, GPL-3.0-or-later |
| go | `rclone`, `restic`, `kopia`, `velero`, `wal-g` | Apache-2.0, BSD-2-Clause, MIT |
| csharp | `duplicati` | MIT |
| php | `spatie-laravel-backup` | MIT |
| any | `pgbackrest`, `sanoid` (review), `bareos` (review), `docker-duplicati` (review) | AGPL-3.0, GPL-3.0, MIT |

## Developer tools: forges, code search, API clients

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `typescript-svix`, `redocly-cli`, `openapitools-openapi-generator-cli`, `scalar-api-reference`, `composio` | Apache-2.0, MIT |
| python | `pre-commit`, `python-uv`, `python-svix`, `apprise-pypi`, `mitmproxy` | BSD-2-Clause, MIT, MIT OR Apache-2.0 |
| go | `fzf`, `lazygit`, `gitea`, `gogs`, `cli-cli` | MIT |
| rust | `testcontainers-crates`, `rust-bat`, `rust-just`, `ripgrep`, `fd-find` | Apache-2.0, CC0-1.0, MIT OR Apache-2.0, Unlicense |
| java | `openapi-generator`, `sonarqube`, `org-testcontainers-testcontainers`, `wiremock`, `rstudio-server` (review) | AGPL-3.0 (core) + commercial/enterprise parts, Apache-2.0, LGPL-3.0, MIT |
| kotlin | `io-gitlab-arturbosch-detekt-detekt-cli`, `metriql`, `com-pinterest-ktlint-ktlint-cli` (review) | Apache-2.0, unknown |
| csharp | `testcontainers`, `microsoft-codeanalysis-netanalyzers` (review) | MIT, unknown |
| ruby | `rubocop`, `gitlabhq` | MIT |
| php | `phpstan-phpstan`, `laravel-pint`, `grumpydictator-firefly-iii` (review), `owncloud` (review), `libresign` (review) | AGPL-3.0, MIT |
| dart | `very-good-analysis` | MIT |
| elixir | `credo` | MIT |
| any | `neovim` (review), `nvm`, `kong`, `jq`, `vscodium` | Apache-2.0, GPL-2.0, MIT |

For search by meaning across a codebase or a folder of documents, from an agent or the terminal, `zvec-grep` (`zg`, Apache-2.0) combines ripgrep, BM25 and local vector retrieval behind one CLI and MCP server; keep native grep or `ripgrep` for exact strings.

## Low-code and internal tools

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `windmill-client`, `teable` (review), `nocodb-sdk` (review), `lowdefy`, `illa-builder` | AGPL-3.0, Apache 2.0, Apache-2.0, Sustainable Use License |
| python | `wmill`, `baserow-docker` | Apache-2.0, MIT |
| rust | `trailbase`, `sqlpage` | MIT, OSL-3.0 |
| java | `halo` (review) | GPL-3.0 |

## Curated lists and directories

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `awesome-javascript` (review) | unknown |
| python | `awesome-python` (review) | custom |
| go | `awesome-go` | MIT |
| rust | `awesome-rust` | CC0-1.0 |
| java | `awesome-java` | CC-BY-SA-4.0 |
| csharp | `awesome-net` | CC0-1.0 |
| ruby | `awesome-ruby` (review) | unknown |
| php | `awesome-php` | WTFPL |
| dart | `awesome-flutter` (review) | unknown |
| swift | `awesome-swift` | CC0-1.0 |
| elixir | `awesome-elixir` | MIT |
| any | `awesome`, `awesome-selfhosted`, `awesome-mcp-servers`, `awesome-docker`, `awesome-sysadmin` (review) | Apache-2.0, CC-BY-SA-3.0, CC0-1.0, MIT, custom |

## Communication

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `openwa`, `fluxer` (review), `fonoster`, `spacebar-github` (review), `workadventure` (review) | AGPL-3.0, MIT, unknown |
| python | `globaleaks` (review), `misago-pypi` (review) | AGPL-3.0, GPL-2.0 |
| go | `artalk-npm`, `centrifugo-go`, `screego` (review), `whatsapp-github` (review), `galene` | AGPL-3.0, Apache-2.0, GPL-3.0, MIT |
| rust | `redlib` (review) | AGPL-3.0 |
| java | `hyphanet` (review), `scoold` | Apache-2.0, GPL-2.0 |
| kotlin | `jitsi-video-bridge` | Apache-2.0 |
| csharp | `notifo` | MIT |
| ruby | `one-time-secret`, `loomio` (review) | AGPL-3.0, MIT |
| php | `flarum-flarum`, `simple-machines-forum`, `remdex-livehelperchat` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `messenger` (review) | unknown |
| any | `janus-gateway` (review), `mumble`, `simplex-chat-npm` (review) | AGPL-3.0, BSD-3-Clause, GPL-3.0 |

## CRM and ERP

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `bigcapital` (review), `recipesage` (review) | AGPL-3.0, unknown |
| python | `python-fava`, `frappe-hr` (review), `inventree`, `spoolman`, `octobot` (review) | GPL-3.0, MIT |
| go | `homebox-sysadminsmedia` (review), `ezbookkeeping` | AGPL-3.0, MIT |
| java | `ofbiz` | Apache-2.0 |
| csharp | `openbudgeteer` (review), `budget-board` (review) | AGPL-3.0 |
| ruby | `sure` (review) | AGPL-3.0 |
| php | `krayin-laravel-crm`, `wallos` (review), `invoiceplane`, `invoiceshelf` (review), `part-db` (review) | AGPL-3.0, GPL-3.0, MIT |
| any | `grocy` | MIT |

## Customer support

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `frappe-helpdesk` (review) | AGPL-3.0 |
| python | `bugsink` (review) | custom |
| php | `osticket` (review), `itflow` (review), `mantisbt-mantisbt` (review) | GPL-2.0, GPL-3.0, unknown |
| any | `uvdesk-community-skeleton`, `request-tracker` (review) | GPL-2.0, OSL-3.0 |

## Networking and VPN

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `wg-easy` (review), `pangolin` (review), `termix`, `myip`, `outline-server` | AGPL-3.0, AGPL-3.0 (core) + commercial/enterprise parts, Apache-2.0, MIT |
| python | `netalertx` (review), `canary-tokens` | BSD-3-Clause, GPL-3.0 |
| go | `frp`, `headscale`, `tailscale`, `tailscale-com`, `netbird` (review) | AGPL-3.0, Apache-2.0, BSD-3-Clause |
| rust | `rustdesk` (review), `rustdesk-server` (review), `warpgate`, `numa` | AGPL-3.0, Apache-2.0, MIT |
| csharp | `technitium-dns-server` (review) | GPL-3.0 |
| any | `meshcentral`, `tinyproxy` (review), `guacamole`, `maza-ad-blocking` | Apache-2.0, GPL-2.0 |

## IoT and home automation

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `typescript-mqtt`, `gladys`, `webthings-gateway` | Apache-2.0, MIT, MPL-2.0 |
| python | `paho-mqtt`, `homeassistant` | Apache-2.0, EPL-2.0 OR BSD-3-Clause |
| go | `go-evcc` | MIT |
| java | `thingsboard` (review), `openhab`, `openremote-cli` (review) | AGPL-3.0, BUSL-1.1, EPL-2.0 |
| any | `tasmota` (review), `domoticz` (review), `iobroker` | GPL-3.0, MIT |

## Web utilities

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `dub-cli` (review) | AGPL-3.0 |

## Learning

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| ruby | `canvas-lms` (review) | AGPL-3.0 |
| php | `chamilo-lms` (review) | GPL-3.0 |

