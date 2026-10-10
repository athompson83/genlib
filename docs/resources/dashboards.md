# Dashboard resources

Dashboards in every common language: observability (Grafana, Netdata, Uptime Kuma), business intelligence (Apache Superset, Metabase), self-hosted home and service dashboards (Homepage, Pi-hole), admin templates (Tabler, AdminLTE, vue-element-admin), chart and widget libraries, terminal dashboards, embedded analytics and status/KPI boards.

Every record was checked on 2026-10-10: registry API for packages, `git ls-remote` for repositories, and Docker Hub or ghcr.io for images; licenses come from registry metadata or the LICENSE file. Install commands are pinned to the latest stable version. Popularity is the registry's own number (downloads, likes or GitHub stars) and is only comparable within one ecosystem. Records marked `license-review` are copyleft (AGPL, GPL, EUPL), commercial (Highcharts, Syncfusion, AG Charts Enterprise) or custom; decide before embedding. Grafana and Metabase are AGPL: self-hosting unmodified is fine, modified network deployments must share source.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find dashboard charts --target "$APP_ROOT" --json   # picks the app's language first
node "$GENLIB_ROOT/tools/resources.mjs" search admin dashboard --language php --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect grafana --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 256 |
| python | 88 |
| go | 68 |
| rust | 45 |
| java | 36 |
| kotlin | 14 |
| csharp | 61 |
| ruby | 43 |
| php | 59 |
| dart | 47 |
| swift | 22 |
| elixir | 30 |
| any | 32 |

Total: 801 records in `resources/catalog/dashboards.json`.

## Observability and metrics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `bull-board-api`, `bull-board-ui`, `bull-board-express`, `grafana-grafana-foundation-sdk`, `perses-dev-components` | Apache-2.0, MIT |
| python | `tensorboard`, `flower`, `django-silk`, `evidently`, `grafana-foundation-sdk` | Apache-2.0, BSD-3-Clause, MIT |
| go | `beszel`, `cadvisor`, `victoriametrics`, `dozzle`, `thanos` | Apache-2.0, MIT |
| rust | `inferno`, `puffin-egui`, `influxdb`, `grafana-plugin-sdk`, `openobserve` (review) | AGPL-3.0, CDDL-1.0, MIT, MIT OR Apache-2.0 |
| java | `xxl-job` (review), `apache-skywalking`, `sentinel`, `de-codecentric-spring-boot-admin-starter-client`, `de-codecentric-spring-boot-admin-starter-server` | Apache-2.0, GPL-3.0 |
| csharp | `hangfire-core`, `hangfire-aspnetcore`, `aspnetcore-healthchecks-ui`, `miniprofiler-aspnetcore-mvc`, `aspire-hosting` | Apache-2.0, LGPL-3.0, MIT |
| ruby | `sidekiq-gem`, `rack-mini-profiler`, `resque`, `pghero`, `good-job` | LGPL-3.0, MIT |
| php | `laravel-horizon`, `laravel-telescope`, `laravel-pulse`, `rap2hpoutre-laravel-log-viewer`, `spatie-laravel-health` | MIT |
| elixir | `phoenix-live-dashboard`, `ecto-psql-extras`, `prom-ex`, `oban-web`, `broadway-dashboard` | Apache-2.0, MIT |
| any | `netdata` (review), `ntopng` (review), `kube-prometheus`, `dockprom`, `zabbix` (review) | AGPL-3.0, Apache-2.0, GPL-3.0, MIT |

## Business intelligence and data analytics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `evidence-dev-evidence`, `observablehq-framework`, `kibana` (review), `wren-ai` (review), `grist` | AGPL-3.0, Apache-2.0, ISC, MIT |
| python | `marimo-pypi`, `apache-superset-pypi` (review), `django-sql-explorer`, `datasette`, `pygwalker` | Apache-2.0, MIT |
| go | `rill` | Apache-2.0 |
| java | `dataease` (review), `apache-zeppelin` | Apache-2.0, GPL-3.0 |
| csharp | `seal-report` | MIT |
| ruby | `blazer` | MIT |
| php | `koolreport-core` | MIT |
| elixir | `kino`, `livebook` | Apache-2.0 |
| any | `flexdashboard` | MIT |

## Self-hosted home and service dashboards

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `homepage` (review), `dashy`, `homer`, `runtipi` (review), `flame` | Apache-2.0, GPL-3.0, MIT |
| python | `home-assistant`, `tautulli` (review) | Apache-2.0, GPL-3.0 |
| go | `glance` (review), `casaos`, `adguard-home` (review), `1panel` (review), `cosmos-server` (review) | AGPL-3.0, Apache-2.0, Apache-2.0 WITH Commons-Clause, GPL-3.0 |
| csharp | `fenrus` | MIT |
| php | `heimdall`, `speedtest-tracker`, `organizr` (review) | GPL-3.0, MIT |
| any | `pi-hole` (review) | EUPL-1.2 |

## Admin and UI dashboard templates

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `primevue-npm` (review), `flowbite-npm`, `ra-core`, `ant-design-pro-layout`, `refinedev-core` | MIT, SEE LICENSE IN LICENSE.md |
| python | `dash-bootstrap-components`, `flask-admin`, `django-unfold`, `sqladmin`, `piccolo-admin` | Apache-2.0, BSD-3-Clause, MIT |
| go | `gin-vue-admin`, `go-admin`, `go-admin-go` | Apache-2.0, MIT |
| java | `jeecgboot`, `eladmin`, `pig`, `ruoyi-vue`, `com-vaadin-vaadin-core` | Apache-2.0, MIT |
| csharp | `blazorise` (review), `bootstrapblazor`, `codebeam-mudblazor-extensions`, `matblazor`, `antdesign` | Apache-2.0, LicenseRef-custom, MIT |
| ruby | `activeadmin`, `flipper-ui-gem`, `rails-admin`, `administrate`, `avo` | LGPL-3.0, MIT |
| php | `filament-filament`, `sonata-project-admin-bundle`, `easycorp-easyadmin-bundle`, `almasaeed2010-adminlte`, `typo3-cms-dashboard` (review) | GPL-2.0, MIT |
| dart | `responsive-framework`, `shadcn-ui-pub`, `sidebarx`, `easy-sidemenu`, `forui` | MIT, OFL-1.1 |
| swift | `cloud-sdk-ios-fiori` | Apache-2.0 |
| elixir | `fun-with-flags-ui`, `petal-components`, `kaffy`, `torch`, `ash-admin` | MIT |
| any | `adminlte`, `tabler`, `coreui-free-bootstrap-admin-template`, `material-dashboard`, `flowbite-admin-dashboard` | MIT |

## Chart and dashboard component libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `recharts-npm`, `d3-npm`, `chart-js`, `shadcn`, `echarts` | Apache-2.0, ISC, MIT |
| python | `matplotlib-pypi`, `plotly-pypi`, `altair-pypi`, `seaborn-pypi`, `streamlit-pypi` | Apache-2.0, BSD-3-Clause, MIT, PSF-based (Matplotlib License) |
| go | `go-echarts`, `plot-go`, `glot`, `charts-go` | BSD-3-Clause, MIT |
| rust | `plotters`, `egui-crates`, `eframe`, `egui-plot`, `plotly-crates` | MIT, MIT OR Apache-2.0 |
| java | `mpandroidchart`, `com-github-haifengl-smile-plot` (review), `tech-tablesaw-tablesaw-jsplot`, `org-openjfx-javafx-controls` (review), `org-knowm-xchart-xchart` | Apache-2.0, GPL-2.0 WITH Classpath-exception-2.0, LicenseRef-custom |
| kotlin | `com-patrykandpatrick-vico-compose`, `com-patrykandpatrick-vico-multiplatform`, `com-himanshoe-charty`, `io-github-ehsannarmani-compose-charts`, `io-github-koalaplot-koalaplot-core` | Apache-2.0, MIT |
| csharp | `mudblazor`, `radzen-blazor`, `oxyplot-core`, `scottplot`, `oxyplot-wpf` | MIT |
| ruby | `caxlsx`, `chartkick`, `groupdate`, `gruff`, `svg-graph` (review) | GPL-2.0, MIT |
| php | `filament-widgets`, `flowframe-laravel-trend`, `symfony-ux-chartjs`, `szymach-c-pchart` (review), `consoletvs-charts` | GPL-3.0, MIT |
| dart | `fl-chart`, `flutter-staggered-grid-view`, `syncfusion-flutter-charts` (review), `pluto-grid`, `data-table-2` | BSD-3-Clause, LicenseRef-proprietary, MIT |
| swift | `charts`, `chartview`, `swiftcharts`, `aachartkit-swift`, `swiftsunburstdiagram` | Apache-2.0, MIT |
| elixir | `vega-lite-hex`, `contex`, `kino-vega-lite`, `tucan` | Apache-2.0, MIT |
| any | `charts-css`, `perspective`, `shiny-for-r`, `makie-jl`, `stipple-jl` | Apache-2.0, MIT |

## Terminal (TUI) dashboards

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `ink-npm`, `blessed-contrib`, `chartscii` | MIT |
| python | `rich-pypi`, `textual-pypi`, `urwid`, `plotext`, `nvitop` | Apache-2.0, LGPL-2.1, MIT |
| go | `lazydocker`, `bubbletea-go`, `k9s`, `wtf`, `sampler` (review) | Apache-2.0, GPL-3.0, MIT, MPL-2.0 |
| rust | `ratatui-crates`, `prodash`, `ratatui-widgets`, `tui-logger`, `cursive` | MIT |
| java | `com-googlecode-lanterna-lanterna` | LGPL-3.0 |
| kotlin | `com-jakewharton-mosaic-mosaic-runtime`, `com-github-ajalt-mordant-mordant` | Apache-2.0 |
| csharp | `spectre-console`, `terminal-gui` | MIT |
| php | `nunomaduro-termwind`, `php-tui-php-tui` | MIT |
| dart | `nocterm` | MIT |
| swift | `stats`, `swifttui`, `termkit`, `swift-tui`, `spectre-kit` | MIT |
| elixir | `observer-cli`, `owl` | Apache-2.0, MIT |
| any | `btop`, `nvtop` (review), `htop` (review), `ttyplot`, `atop` (review) | Apache-2.0, GPL-2.0, GPL-3.0 |

## Embedded analytics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `powerbi-client`, `cubejs-client-core`, `superset-ui-embedded-sdk`, `cubejs-client-react`, `powerbi-client-react` | Apache-2.0, MIT |
| rust | `cube` | Apache-2.0 |
| php | `luzmo-luzmo-sdk-php` | MIT |

## Status pages, uptime and KPI boards

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `posthog-js-npm`, `countup-js`, `react-countup`, `react-circular-progressbar`, `react-gauge-component` | (Apache-2.0 AND MIT), MIT |
| python | `streamlit-autorefresh` (review), `dash-daq`, `healthchecks` | BSD-3-Clause, MIT |
| go | `gatus`, `wakapi`, `monitoror`, `statsviz`, `statping-ng` (review) | Apache-2.0, GPL-3.0, MIT |
| java | `eu-hansolo-tilesfx`, `eu-hansolo-medusa` | Apache-2.0 |
| csharp | `blazorise-charts-streaming` (review) | LicenseRef-custom |
| ruby | `ahoy-matey`, `smashing`, `active-analytics` | MIT |
| php | `spatie-laravel-analytics-packagist`, `flarum-statistics`, `spatie-laravel-uptime-monitor`, `bezhansalleh-filament-google-analytics`, `spatie-laravel-dashboard` | MIT |
| dart | `percent-indicator`, `syncfusion-flutter-gauges` (review), `animated-flip-counter`, `gauge-indicator`, `geekyants-flutter-gauges` | BSD-2-Clause, LicenseRef-proprietary, MIT |
| swift | `progressui`, `gaugekit` | MIT |
| any | `cstate` | MIT |

