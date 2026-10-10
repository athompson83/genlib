# Scheduling and calendar resources

Booking and scheduling apps (Cal.diy, Easy!Appointments, calrs, Rallly, LibreBooking), CalDAV/CardDAV servers (Radicale, Baïkal, Nextcloud Calendar), desktop and mobile calendar apps (Fossify Calendar, Etar, Thunderbird, KOrganizer), calendar UI components, recurrence (RRULE) and iCalendar (ICS) libraries, CalDAV clients, availability and slot engines, and the official Google Calendar, Microsoft Graph and Zoom SDKs in every common language.

Every record was checked on 2026-10-10: registry API for packages, `git ls-remote` for repositories, and Docker Hub or ghcr.io for images; licenses come from registry metadata or the LICENSE file. Cal.com's public repository is now Cal.diy (MIT); the AGPL-era Cal.com image is kept as license-review. Records marked `license-review` are copyleft (AGPL, GPL), commercial (Syncfusion, DHTMLX, Zoom SDKs) or source-available; decide before embedding. Popularity is the registry's own number and only comparable within one ecosystem. Store calendar data and OAuth tokens server-side and respect time zones (store UTC plus the IANA zone).

## Find and install

The canonical `react-big-calendar` and `ical-generator` records connect to the original [calendar and file-tree integration](../../integrations/web-calendar-files/CONTRACT.md), with controlled events, timezone checks and iCalendar generation. The contract records the exercised runtime profile; catalog source checks alone do not establish application behavior.

`schedule-x-calendar` and `schedule-x-react` describe the MIT core and React adapter only. Schedule-X v4 puts drag-and-drop, resize and advanced resource views in separately licensed Premium packages; see the [official v4 announcement](https://schedule-x.dev/blog/schedule-x-v4). Select those features deliberately rather than assuming the core package includes them.

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find booking page calendar --target "$APP_ROOT" --json
node "$GENLIB_ROOT/tools/resources.mjs" search rrule recurrence --language python --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect radicale --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 60 |
| python | 29 |
| go | 9 |
| rust | 11 |
| java | 11 |
| kotlin | 6 |
| csharp | 7 |
| ruby | 8 |
| php | 21 |
| dart | 11 |
| swift | 6 |
| elixir | 3 |
| any | 7 |

Total: 189 records in `resources/catalog/scheduling-calendar.json`.

## Booking and scheduling apps (Calendly alternatives)

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `calcom-embed-react`, `rallly-docker-image` (review), `calcom-atoms` (review), `rallly` (review), `timeful-schej` (review) | AGPL-3.0, MIT |
| python | `thunderbird-appointment` | MPL-2.0 |
| go | `seatsurfing` | GPL-3.0 |
| rust | `crab-fit`, `calrs` (review), `calrs-docker-image` (review) | AGPL-3.0, GPL-3.0 |
| php | `librebooking-docker-image`, `easy-appointments-docker-image`, `easy-appointments`, `librebooking`, `mrbs` | GPL-2.0, GPL-3.0 |

## Self-hosted calendar and CalDAV servers

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| python | `radicale-docker-image-tomsquest`, `radicale`, `xandikos`, `radicale-github` | GPL-3.0, GPL-3.0-or-later |
| rust | `stalwart` (review) | AGPL-3.0 (or proprietary SELv1 enterprise) |
| php | `baikal-docker-image-ckulka`, `sabre-dav`, `baikal`, `davis`, `davical` | BSD-3-Clause, GPL-2.0, GPL-3.0, MIT, MIT (image build files; bundled Baïkal is GPL-3.0) |
| any | `sogo`, `cyrus-imap` | BSD-2-Clause, GPL-2.0 |

## Desktop and mobile calendar apps

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `nextcloud-calendar` (review), `thunderbird-calendar-lightning` | AGPL-3.0, MPL-2.0 |
| python | `vdirsyncer`, `gcalcli`, `khal`, `calcure` | BSD-3-Clause, MIT |
| java | `etar` | GPL-3.0 |
| kotlin | `davx5`, `fossify-calendar`, `icsx5` | GPL-3.0 |
| any | `calcurse`, `gnome-calendar`, `evolution`, `korganizer` (review), `merkuro-calendar` | BSD-2-Clause, GPL-2.0-or-later WITH LicenseRef-Qt-Commercial-exception-1.0, GPL-3.0, GPL/LGPL mixed (per-file SPDX, LGPL-2.1-or-later and GPL-3.0-or-later), LGPL-2.0-or-later OR LGPL-3.0 (per-file headers) |

## Calendar, recurrence, iCalendar and CalDAV libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `react-day-picker`, `luxon-npm`, `date-fns-tz`, `internationalized-date`, `react-datepicker` | Apache-2.0, MIT |
| python | `python-dateutil`, `icalendar-pypi`, `x-wr-timezone`, `recurring-ical-events`, `vobject` | Apache-2.0, Apache-2.0 AND BSD-3-Clause, BSD-2-Clause, LGPL-3.0-or-later |
| go | `go-webdav`, `golang-ical`, `cal`, `rrule-go`, `gocal` | Apache-2.0, BSD-3-Clause, MIT |
| rust | `chrono-tz`, `rrule-crates`, `icalendar-crates`, `calcard`, `libdav` | Apache-2.0 OR MIT, ISC, MIT OR Apache-2.0 |
| java | `org-mnode-ical4j-ical4j`, `net-sf-biweekly-biweekly`, `org-dmfs-lib-recur`, `de-focus-shift-jollyday-core` | Apache-2.0, BSD-2-Clause, BSD-3-Clause |
| kotlin | `com-kizitonwose-calendar-compose` | MIT |
| csharp | `nodatime`, `ical-net`, `radzen-blazor-nuget`, `syncfusion-blazor-schedule` (review) | Apache-2.0, MIT, commercial (Syncfusion license) |
| ruby | `ice-cube`, `icalendar`, `simple-calendar`, `rrule-gem`, `montrose` | Apache-2.0, BSD-2-Clause OR GPL-3.0-only OR icalendar (choice), MIT |
| php | `sabre-vobject`, `spatie-icalendar-generator`, `simshaun-recurr`, `rlanvin-php-rrule`, `eluceo-ical` | BSD-3-Clause, MIT |
| dart | `table-calendar`, `syncfusion-flutter-calendar` (review), `calendar-view`, `timezone`, `add-2-calendar` | Apache-2.0, BSD-2-Clause, MIT, commercial (Syncfusion license) |
| swift | `horizoncalendar`, `calendarkit`, `kvkcalendar` | Apache-2.0, MIT |
| elixir | `icalendar-hex`, `cocktail`, `caldav-client` | Apache-2.0, MIT |

## Official calendar and meeting SDKs

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `googleapis`, `microsoft-microsoft-graph-client`, `googleapis-calendar`, `react-calendly`, `expo-calendar` | Apache-2.0, MIT |
| python | `google-api-python-client-pypi`, `msgraph-sdk`, `o365`, `exchangelib`, `nylas-pypi` | Apache-2.0, BSD-2-Clause, MIT |
| go | `google-api`, `msgraph-sdk-go` | BSD-3-Clause, MIT |
| rust | `google-calendar3`, `graph-rs-sdk` | MIT |
| java | `com-google-apis-google-api-services-calendar`, `com-microsoft-graph-microsoft-graph` | Apache-2.0, MIT |
| kotlin | `com-nylas-sdk-nylas`, `us-zoom-videosdk-zoomvideosdk-core` (review) | MIT, proprietary (Zoom SDK terms) |
| csharp | `microsoft-graph`, `google-apis-calendar-v3` | Apache-2.0, MIT |
| ruby | `google-apis-calendar-v3-gem`, `nylas`, `cronofy` | Apache-2.0, MIT |
| php | `google-apiclient`, `microsoft-microsoft-graph`, `spatie-laravel-google-calendar` | Apache-2.0, MIT |
| dart | `googleapis-pub`, `device-calendar`, `flutter-zoom-videosdk` (review) | BSD-3-Clause, proprietary (Zoom SDK terms) |
| swift | `googleapiclientforrest`, `zoom-meeting-sdk-ios` (review), `apple-eventkit` (review) | Apache-2.0, proprietary (Apple SDK), proprietary (Zoom SDK terms) |

## Scheduling solvers and components

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `nylas-react`, `cronofy-elements` | ISC, MIT |
| python | `ortools`, `pyworkforce` | Apache-2.0, MIT |
| java | `com-google-ortools-ortools-java`, `ai-timefold-solver-timefold-solver-core`, `ai-timefold-solver-timefold-solver-spring-boot-starter`, `timefold-quickstarts` | Apache-2.0 |
| csharp | `google-ortools` | Apache-2.0 |

