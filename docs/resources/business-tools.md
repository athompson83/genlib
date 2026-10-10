# Business tools

Tools that run a business: BI and analytics (Apache Superset, Metabase), backend-as-a-service and internal tools (Supabase), self-hosted PaaS (Coolify), spreadsheet databases (NocoDB), link management (Dub), publishing (Ghost), CRM, ERP, helpdesk, HR, project management, forms, wikis, document management and e-signature, e-commerce and point of sale, business email, staff training, time tracking, document and e-invoicing libraries, and official SDKs for business services (Salesforce, HubSpot, Slack, Notion, Airtable, Asana, monday.com, Shopify, DocuSign, Zendesk, Jira and more) in every common language. Records list the proprietary products they replace, so a query such as `airtable alternative` finds them.

Every record was checked on 2026-10-10: `git ls-remote` for repositories, the registry API for packages and Docker Hub or ghcr.io for images, pinned to the latest stable version or tag; licenses come from registry metadata or the LICENSE file. Records marked `license-review` are copyleft (Metabase and Dub are AGPL with commercial editions), source-available (NocoDB now uses the Sustainable Use License, which limits use to internal business or non-commercial purposes) or have no declared license. Service SDKs talk to commercial services that need an account and API keys: keep keys on the trusted server. Dub has no official Docker image; its record installs from the repository. Popularity is the registry's own number or GitHub stars and only comparable within one ecosystem.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find airtable alternative --json
node "$GENLIB_ROOT/tools/resources.mjs" search e-invoice zugferd --language java --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect nocodb --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 233 |
| python | 173 |
| go | 63 |
| rust | 37 |
| java | 68 |
| kotlin | 12 |
| csharp | 60 |
| ruby | 57 |
| php | 89 |
| dart | 15 |
| swift | 17 |
| elixir | 26 |
| any | 18 |

Total: 868 records in `resources/catalog/business-tools*.json`.

## Business document and data libraries (PDF, invoices, e-invoicing, spreadsheets, reports)

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `libphonenumber-js`, `validator`, `cron-parser`, `csv-parse`, `fast-csv` | MIT |
| python | `croniter`, `pendulum`, `apscheduler`, `phonenumbers`, `holidays` | Apache-2.0, MIT |
| go | `dapr`, `go-cron`, `cadence`, `immudb` (review), `go-expr` | Apache-2.0, BUSL-1.1, MIT |
| rust | `rust-csv`, `rust-cron`, `calamine`, `rust-rhai`, `tokio-cron-scheduler` | MIT, MIT OR Apache-2.0, MIT/Apache-2.0, Unlicense/MIT |
| java | `conductor-oss`, `com-googlecode-libphonenumber-libphonenumber`, `activiti`, `flowable`, `org-quartz-scheduler-quartz` | Apache-2.0 |
| kotlin | `io-gorules-zen-engine-kotlin`, `io-github-nsk90-kstatemachine`, `infinitic` (review), `io-github-g0dkar-qrcode-kotlin`, `dev-inmo-krontab` | Apache-2.0, MIT, bsl-1.0 |
| csharp | `csvhelper`, `closedxml`, `epplus` (review), `quartz`, `csharp-npoi` | Apache-2.0, MIT, MS-PL OR Apache-2.0, Polyform Noncommercial 1.0 / commercial |
| ruby | `fugit`, `paper-trail`, `rufus-scheduler`, `ruby-roo`, `ruby-aasm` | MIT |
| php | `dragonmantank-cron-expression`, `league-csv`, `openspout-openspout`, `symfony-expression-language`, `maatwebsite-excel` | MIT |
| dart | `printing`, `excel`, `barcode-pub`, `dart-cron`, `dart-csv` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `efqrcode-swift`, `codescanner-swiftui`, `swiftcsv`, `corexlsx`, `tppdf` | Apache-2.0, MIT |
| elixir | `elixir-csv`, `elixlsx`, `crontab`, `nimble-csv`, `quantum` | Apache-2.0, MIT |
| any | `pgaudit`, `pgmemento` | LGPL-3.0, PostgreSQL License |

## Official business-service SDKs (CRM, e-signature, collaboration, commerce, HR)

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `linear-sdk`, `notionhq-client`, `salesforce-core`, `shopify-admin-api-client`, `shopify-shopify-api` | Apache-2.0, MIT |
| python | `gspread`, `python-jira`, `atlassian-python-api`, `pyairtable`, `notion-client` | Apache-2.0, BSD-3-Clause, MIT |
| go | `jira-cli`, `go-jira`, `notionapi`, `go-shopify`, `go-notion` | BSD-2-Clause, MIT |
| rust | `slack-morphism`, `shopify-function`, `gouqi`, `shopify-api-crates`, `notion` | Apache-2.0, MIT |
| java | `com-dropbox-core-dropbox-core-sdk`, `com-box-box-java-sdk`, `com-cloudbees-thirdparty-zendesk-java-client`, `com-docusign-docusign-esign-java`, `com-asana-asana` | Apache-2.0, MIT |
| kotlin | `com-slack-api-slack-api-client-kotlin-extension`, `salesforce-mobile-sdk-for-android`, `com-shopify-mobilebuysdk-buy3`, `com-github-seratch-notion-sdk-jvm-core`, `com-shopify-checkout-sheet-kit` | Apache-2.0, MIT |
| csharp | `docusign-esign-dll`, `dropbox-api`, `slackapi`, `zendeskapi-v2`, `shopifysharp` | Apache-2.0, MIT |
| ruby | `slack-notifier`, `liquid`, `jira-ruby`, `zendesk-api`, `asana-gem` | Apache-2.0, MIT |
| php | `zendesk-zendesk-api-client-php`, `docusign-esign-client`, `lesstif-php-jira-rest-client`, `jolicode-slack-php-api`, `helpscout-api` | Apache-2.0, MIT |
| dart | `shopify-flutter`, `notion-api` | Apache-2.0, MIT |
| swift | `swiftydropbox`, `salesforce-mobile-sdk-for-ios`, `shopify-mobile-buy-sdk-for-ios`, `notionswift`, `shopify-checkout-sheet-kit-swift` | Apache-2.0, MIT |
| elixir | `slack-elixir` | MIT |

## Business email, newsletters and transactional mail

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `maildev`, `emailengine` (review) | Commercial (source-available, paid license), MIT |
| python | `parsedmarc`, `mailman-3-core` (review), `social-oca-odoo-addons` (review) | AGPL-3.0, Apache-2.0, gpl-3.0+ |
| go | `inbucket`, `chasquid` | Apache-2.0, MIT |
| rust | `mail-parser`, `mail-send`, `mail-auth` | Apache-2.0 OR MIT |
| java | `org-simplejavamail-simple-java-mail`, `simple-java-mail`, `apache-james`, `com-mailersend-java-sdk`, `com-brevo-brevo` | Apache-2.0, MIT |
| csharp | `fluentemail-core`, `smtp4dev`, `fluentemail` | BSD-3-Clause, MIT |
| ruby | `mailersend-ruby`, `mailcatcher` | MIT |
| php | `mailersend-mailersend`, `snappymail` (review) | AGPL-3.0, MIT |
| dart | `dart-mailer` | MIT |
| swift | `swiftsmtp` | Apache-2.0 |
| elixir | `gen-smtp`, `bamboo-elixir` | BSD-2-Clause, MIT |
| any | `opensmtpd`, `sympa` (review) | BSD-3-Clause, GPL-2.0 |

## Backend-as-a-service and internal-tool platforms

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `firebase-admin-npm`, `supabase-ssr`, `electric-sql-client`, `instantdb-react`, `triplit-client` (review) | AGPL-3.0-only, Apache-2.0, MIT |
| python | `convex-pypi` (review), `pocketbase-pypi` | Apache-2.0, MIT |
| go | `pocketbase-go`, `encore-dev-go`, `supabase-cli` (review), `supabase-go`, `sdk-for-go` | BSD-3-Clause, MIT, MPL-2.0, unknown |
| rust | `supabase-rs`, `convex-crates`, `convex-backend` (review), `y-sweet`, `supabase-edge-runtime` | Apache-2.0, MIT |
| java | `parse-android-sdk`, `restheart` (review) | AGPL-3.0, BSD-3-Clause |
| kotlin | `com-powersync-core`, `io-appwrite-sdk-for-kotlin` | BSD-3-Clause, MIT |
| csharp | `firebaseadmin`, `parse-net-sdk` | Apache-2.0 |
| php | `kreait-firebase-php`, `parse-php-sdk` | BSD-3-Clause, MIT |
| dart | `firebase-core`, `powersync` (review), `parse-server-sdk-flutter`, `dart-appwrite`, `nhost-sdk` | Apache-2.0, BSD-3-Clause, MIT, unknown |
| swift | `firebase-ios-sdk`, `parse-swift-sdk`, `powersync-swift-sdk`, `appwrite-swift-server-sdk` | Apache-2.0, BSD-3-Clause, MIT |
| elixir | `supabase-potion`, `electricsql`, `supabase-realtime`, `supavisor` | Apache-2.0, MIT |
| any | `instantdb`, `thin-backend` | Apache-2.0, MIT |

## Employee training and learning

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| python | `open-edx-platform` (review), `relate` | AGPL-3.0, MIT |
| any | `openswad` (review) | AGPL-3.0 |

## E-commerce and point of sale

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `medusajs-js-sdk` (review), `woocommerce-woocommerce-rest-api`, `shopware-ag-meteor-admin-sdk`, `node-thermal-printer`, `shopware-api-client` | ISC, MIT, custom (see LICENSE) |
| python | `woocommerce`, `python-escpos`, `stock-logistics-warehouse-oca-odoo-addons` (review), `pos-oca-odoo-addons` (review), `e-commerce-oca-odoo-addons` (review) | AGPL-3.0, MIT |
| go | `square-go-sdk-go` | Apache-2.0 |
| rust | `escpos` | MIT |
| java | `shopizer`, `broadleaf-commerce-ce` (review), `escpos-thermalprinter-android` | Apache-2.0, MIT |
| csharp | `escpos-net`, `smartstore` (review), `grandnode` (review), `virto-commerce-platform` (review) | AGPL-3.0, GPL-3.0, MIT, custom (see LICENSE) |
| ruby | `bigcommerce` | MIT |
| php | `automattic-woocommerce`, `mike42-escpos-php`, `unopim`, `tastyigniter`, `microweber` | MIT |
| dart | `esc-pos-utils-plus` | BSD-3-Clause |

## Business intelligence and analytics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `lightdash-cli`, `briefer` (review), `graphic-walker`, `malloy`, `datalens` | AGPL-3.0, Apache-2.0, MIT |
| python | `metabase-api`, `redash-toolbelt`, `ydata-profiling`, `preset-cli` (review), `sql-explorer-for-django` | BSD-2-Clause, MIT, Other/Proprietary License |
| java | `apache-kylin`, `poli`, `knowage` (review) | AGPL-3.0, Apache-2.0, MIT |

## CMS and publishing

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `contentful-management`, `contentful-npm`, `prismicio-client`, `datocms-cma-client-node`, `strapi-client` (review) | Apache-2.0, MIT, custom (see LICENSE) |
| python | `contentful-pypi`, `pelican` (review), `lektor`, `plone` (review), `website-cms-oca-odoo-addons` (review) | AGPL-3.0, BSD-3-Clause, GPL-2.0, MIT |
| java | `com-contentful-java-java-sdk` | Apache-2.0 |
| csharp | `contentful-csharp`, `oqtane`, `piranha-cms`, `dnn-platform` | MIT |
| ruby | `contentful`, `bridgetown` | MIT |
| php | `contentful-contentful`, `wordpress-develop-mirror` (review), `processwire` (review), `classicpress` (review), `typemill` | GPL-2.0, MIT, unknown |
| swift | `contentful-swift` | MIT |

## Self-hosted PaaS and deployment

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `caprover-npm`, `ledokku`, `lagoon` | Apache-2.0, MIT |
| python | `fabric`, `fabric-github`, `piku`, `disco` | BSD-2-Clause, BSD-3-Clause, MIT |
| go | `openfaas` (review), `sidekick` (review), `knative-serving`, `devtron`, `uncloud` | Apache-2.0, GPL-3.0, MIT (Community Edition; some components commercial) |
| rust | `komodo` (review) | GPL-3.0 |
| ruby | `capistrano`, `capistrano-github`, `canine` | Apache-2.0, MIT |
| php | `deployer-deployer`, `deployer-php` | MIT |
| any | `swarmpit` | EPL-1.0 |

## Document management and e-signature

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `signpdf-signpdf`, `chromiumly`, `paperless-ai`, `accord-project-concerto`, `docuseal-react-embed` | Apache-2.0, MIT |
| python | `pyhanko`, `gotenberg-client`, `pypaperless`, `endesive` (review), `invoice2data-github` | MIT, MPL-2.0 |
| go | `paperless-gpt` | MIT |
| java | `teedy` (review), `eu-dss-digital-signature-service`, `eu-europa-ec-joinup-sd-dss-dss-pades`, `nuxeo`, `signserver-ce` | Apache-2.0, GPL-2.0, LGPL-2.1 |
| php | `gotenberg-gotenberg-php`, `erugo` | MIT |

## ERP and operations

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `odoo-await`, `frappe-ui` | ISC, MIT |
| python | `frappe-framework`, `ralph`, `frappe-bench` (review), `openupgrade-oca-odoo-addons` (review), `account-financial-tools-oca-odoo-addons` (review) | AGPL-3.0, Apache-2.0, GPL-3.0, MIT |
| php | `snipe-it` (review), `glpi` (review), `weberp` (review) | AGPL-3.0, GPL-2.0, GPL-3.0 |
| any | `frappe-docker`, `openboxes` | EPL-1.0, MIT |

## Project management

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `hello-pangea-dnd`, `frappe-gantt`, `svar-ui-react-gantt`, `dhtmlx-gantt` (review), `jkanban` | Apache-2.0, MIT |
| python | `python-redmine`, `python-taiga`, `kanboard-pypi`, `trac`, `frappe-gameplan` (review) | AGPL-3.0, Apache-2.0, BSD-3-Clause, MIT |
| go | `superplane`, `taskcafe` | Apache-2.0, MIT |
| java | `ganttproject` (review) | GPL-3.0 |
| php | `restyaboard` (review), `taskboard`, `phorge` | Apache-2.0, MIT, OSL-3.0 |

## Forms and surveys

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `jsonforms-core`, `conform-to-react`, `formiojs`, `formily-core`, `formily` | MIT |
| python | `pyxform` (review), `django-crispy-forms`, `citric`, `wtforms`, `survey-oca-odoo-addons` (review) | AGPL-3.0, BSD-2-Clause, BSD-3-Clause, MIT |
| php | `nextcloud-forms` (review) | AGPL-3.0 |

## Knowledge bases and wikis

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `docsify`, `quartz-github`, `fumadocs`, `rspress` | MIT |
| python | `pywikibot`, `mwclient`, `mkdocs`, `frappe-wiki`, `wikmd` | BSD-2-Clause, MIT |
| ruby | `gollum` | MIT |
| php | `mediawiki` (review), `question2answer` (review), `tiki-wiki-cms-groupware` | GPL-2.0, GPL-3.0, LGPL-2.1 |
| any | `foswiki` (review) | unknown |

## Spreadsheet databases and no-code data

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `glideapps-glide-data-grid`, `univerjs-presets`, `nocobase` (review), `univer`, `handsontable` (review) | Apache-2.0, Commercial (free non-commercial key), MIT, custom (see LICENSE.txt) |
| python | `grist-api`, `baserow-client` | Apache-2.0, MIT |
| any | `seatable-developer-edition-docs` (review) | unknown |

## Link management and URL shorteners

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `shlinkio-shlink-js-sdk`, `sink-github` (review), `lynx-url-shortener` | AGPL-3.0, MIT |
| python | `trotto-go-links` | Apache-2.0 |
| go | `tailscale-golink`, `dub-go` (review) | BSD-3-Clause, unknown |
| ruby | `ruby-dub` | Apache-2.0 |
| php | `dub-dub-php`, `shlinkio-shlink-php-sdk` | MIT |
| any | `lstu` (review) | custom (see LICENSE) |

## HR and people operations

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `orgchart-dabeng`, `d3-org-chart`, `timeoff-management`, `ever-teams` (review), `okr-tracker-oslo-kommune` | AGPL-3.0, MIT |
| python | `horilla` (review), `hr-oca-odoo-addons` (review), `openhrms` (review), `payroll-oca-odoo-addons` (review), `hr-attendance-oca-odoo-addons` (review) | AGPL-3.0, LGPL |
| java | `feedbacky` | MIT |
| csharp | `payroll-engine` | MIT |
| php | `orangehrm` (review), `opencats`, `icehrm` (review), `jorani` | GPL-3.0, MIT, MPL-2.0, custom (see LICENSE) |

## Helpdesk and customer support

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `crisp-api-npm`, `trudesk`, `hexabot-github` (review), `botpress-v12` (review) | AGPL-3.0, Apache-2.0, MIT |
| python | `zammad-py`, `crisp-api-pypi`, `helpdesk-oca-odoo-addons` (review) | AGPL-3.0, MIT |
| go | `crisp` | BSD-3-Clause |
| ruby | `crisp-api`, `zammad-api` (review), `helpy` | AGPL-3.0-only, MIT, MIT |
| php | `faveo-helpdesk` (review), `itop` (review) | AGPL-3.0, custom (see LICENSE) |
| any | `znuny` (review), `otobo` (review) | GPL-3.0 |

## Time tracking and scheduling for teams

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `tockler` (review), `titra` (review), `time-to-leave` (review) | AGPL-3.0, GPL-2.0, GPL-3.0 |
| python | `watson`, `hamster` (review), `toggl-cli-toggl-cli`, `gtimelog` (review), `timesheet-oca-odoo-addons` (review) | AGPL-3.0, GPL-2.0, GPL-3.0, MIT |
| go | `klog`, `wakatime-cli` | BSD-3-Clause, MIT |
| rust | `bartib` (review), `furtherance` (review) | GPL-3.0 |
| ruby | `timetrap` | MIT |
| php | `anuko-time-tracker` (review), `cattr` (review) | SSPL-1.0, custom (see license.txt) |
| any | `timewarrior`, `hakatime`, `arbtt` (review) | GPL-2.0, MIT, Unlicense |

## CRM

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `twenty-sdk`, `nextcrm` | MIT |
| python | `django-crm-bottlecrm`, `crm-oca-odoo-addons` (review) | AGPL-3.0, MIT |
| php | `espocrm-php-espo-api-client`, `civicrm` (review), `orocrm` (review), `laravel-crm-venturedrake`, `krayin-rest-api` (review) | AGPL-3.0, MIT, custom (see LICENSE), unknown |

