# Marketing analytics, attribution, experimentation, consent and advertising resources

Product and web analytics SDKs, self-hosted analytics, UTM and campaign attribution, A/B testing and feature flags, cookie consent, and ad platform APIs (Google, Meta, LinkedIn, TikTok, Microsoft and programmatic).

Every record here was checked against its registry or repository on 2026-10-10: the package or repository exists, is not deprecated, and its license comes from registry metadata or the LICENSE file. Popularity is the registry's own number (monthly downloads, total downloads, importers or GitHub stars) and is only comparable within one ecosystem. Records marked `license-review` are copyleft, commercial or have no declared license; decide before embedding them. Platform terms change often: prefer official APIs, keep keys and user tokens on the server, and honor consent and unsubscribe laws.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find <need> --target "$APP_ROOT" --json   # picks the app's language first
node "$GENLIB_ROOT/tools/resources.mjs" search <need> --language python --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect <id> --json   # license, cautions and the exact install command
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 475 |
| python | 91 |
| go | 35 |
| rust | 39 |
| java | 43 |
| kotlin | 4 |
| csharp | 44 |
| ruby | 60 |
| php | 94 |
| dart | 34 |
| swift | 21 |
| elixir | 29 |
| any | 38 |

Total: 1007 records in `resources/catalog/marketing-analytics*.json`.

## Advertising

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `mux-mux-data-google-ima`, `google-ads-node`, `google-ads-api`, `react-native-google-mobile-ads` | Apache-2.0, MIT |
| python | `google-ads` (review), `facebook-business` (review), `googleads`, `bingads` | Apache-2.0, MIT, n/a |
| go | `v20`, `prebid-server`, `v3-go-4`, `v3-go-5` | Apache-2.0, MIT |
| rust | `librashader-capi` (review), `google-doubleclicksearch2`, `google-doubleclickbidmanager1`, `graphannis-capi` | Apache-2.0, MIT, MPL-2.0 OR GPL-3.0-only |
| java | `com-google-apis-google-api-services-dfareporting`, `com-google-apis-google-api-services-displayvideo`, `com-facebook-business-sdk-facebook-java-business-sdk`, `com-applovin-applovin-sdk` | Apache-2.0, AppLovin Corporation SDK EULA, Facebook Platform License |
| csharp | `google-ads-googleads-nuget`, `microsoft-bingads-sdk` (review), `plugin-admob`, `soenneker-google-ads-client` | Apache-2.0, MIT, non-standard |
| ruby | `google-ads-common`, `google-ads-googleads`, `facebookbusiness`, `google-dfp-api` | Apache-2.0, Nonstandard |
| php | `facebook-php-business-sdk` (review), `googleads-googleads-php-lib`, `googleads-google-ads-php`, `facebook-php-ads-sdk` (review) | Apache-2.0, NOASSERTION |
| dart | `google-mobile-ads`, `unity-ads-plugin`, `stack-appodeal-flutter`, `gma-mediation-unity` | Apache-2.0, MIT |
| swift | `prebid-mobile-ios` | Apache-2.0 |
| elixir | `google-ads-hex`, `google-api-display-video`, `open-rtb-ecto`, `google-api-dfa-reporting` | Apache-2.0, MIT |
| any | `openrtb` (review), `openrtb2-x` (review), `adthrive`, `adyoulike` | n/a |

## Analytics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `posthog-core`, `posthog-js`, `posthog-node`, `firebase-analytics` | (Apache-2.0 AND MIT), Apache-2.0, MIT |
| python | `posthog-pypi`, `snowplow-tracker-pypi`, `amplitude-analytics`, `mixpanel` | Apache-2.0, MIT |
| go | `fathom`, `goatcounter` (review), `rudder-server` (review), `vince` (review) | AGPL-3.0, EUPL-1.2, Elastic-2.0, MIT |
| rust | `posthog-rs`, `segment-crates`, `mixpanel-rs`, `rudderanalytics-crates` | MIT |
| java | `com-google-analytics-google-analytics-admin`, `com-google-analytics-google-analytics-data`, `com-mixpanel-android-mixpanel-android`, `ly-count-android-sdk` | Apache-2.0, MIT |
| kotlin | `com-segment-analytics-kotlin-android`, `com-amplitude-analytics-android` | MIT |
| csharp | `analytics`, `rudderanalytics`, `mixpanel-csharp`, `xamarin-googleplayservices-tagmanager-v4-impl` | MIT |
| ruby | `snowplow-tracker`, `analytics-ruby`, `mixpanel-ruby`, `staccato` | Apache-2.0, MIT |
| php | `segmentio-analytics-php`, `mixpanel-mixpanel-php`, `theiconic-php-ga-measurement-protocol`, `google-analytics-data` | Apache-2.0, MIT |
| dart | `firebase-analytics-pub`, `clarity-flutter`, `mixpanel-flutter`, `amplitude-flutter` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `mixpanel-swift`, `matomo-sdk-ios`, `amplitude-ios`, `swiftsdk` | Apache-2.0, MIT |
| elixir | `segment`, `posthog-hex`, `mixpanel-api-ex`, `google-api-analytics-data` | Apache-2.0, MIT |
| any | `goaccess`, `snowplow`, `community-edition`, `adobe-analytics` | Apache-2.0, MIT, n/a |

## Attribution

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `react-native-appsflyer`, `react-native-branch`, `dub-analytics`, `react-native-adjust` | MIT, MPL-2.0 |
| python | `lifetimes`, `pymc-marketing`, `causalml`, `scikit-uplift` (review) | Apache-2.0, MIT, n/a |
| java | `com-adjust-sdk-adjust-android`, `io-branch-sdk-android-library`, `com-tenjin-android-sdk`, `com-kochava-tracker-tracker` (review) | Apache-2.0, MIT, Proprietary |
| csharp | `xamarin-firebase-dynamic-links`, `appsflyerxamarinbindingandroid`, `appsflyerxamarinbinding` (review), `adame-firebase-ios-dynamiclinks` (review) | MIT, MIT AND Apache-2.0, NOASSERTION, non-standard |
| ruby | `referer-parser` (review), `firebase-dynamic-link`, `referer-tracking`, `google-apis-firebasedynamiclinks-v1` | Apache-2.0, MIT, NOASSERTION |
| php | `yedincisenol-dynamic-links`, `kyranb-footprints`, `xsuchy09-utm-cookie`, `suarez-laravel-utm-parameter` | Apache-2.0, MIT |
| dart | `flutter-branch-sdk`, `appsflyer-sdk`, `adjust-sdk`, `flutter-facebook-app-links` | MIT |
| swift | `ios-branch-deep-linking-attribution`, `appsflyerframework` (review) | MIT, NOASSERTION |
| elixir | `google-api-firebase-dynamic-links` | Apache-2.0 |

## Consent

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `detect-europe-js`, `vanilla-cookieconsent`, `iabtcf-core`, `c15t` | Apache-2.0, MIT |
| python | `django-cookie-consent`, `django-cookiebanner` (review), `leukeleu-django-gdpr` | BSD-2-Clause-first-lines, GPL-3.0-or-later, MIT |
| rust | `lib-tcstring` | Apache-2.0 |
| java | `com-sourcepoint-cmplibrary-cmplibrary`, `com-usercentrics-sdk-usercentrics-ui`, `io-didomi-sdk-android` | Apache-2.0, Custom |
| csharp | `cloudscribe-common-gdpr`, `bytexdigital-blazor-components-cookieconsent`, `lombiq-privacy`, `cookieconsent-orchardcore` (review) | Apache-2.0, BSD-3-Clause, NOASSERTION |
| ruby | `gdpr`, `al-cookie`, `klaro-client` | MIT |
| php | `spatie-laravel-cookie-consent`, `drupal-klaro-js`, `whitecube-laravel-cookie-consent`, `jfeltkamp-cookiesjsr` (review) | BSD-3-Clause, GPL-3.0-or-later, MIT |
| dart | `app-tracking-transparency`, `iabtcf-consent-info`, `usercentrics-sdk`, `onetrust-publishers-native-cmp` (review) | Apache-2.0, MIT, NOASSERTION |
| swift | `ios-cmp-app` | MIT |

## Experimentation

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `firebase-remote-config`, `openfeature-server-sdk`, `statsig-js-client`, `launchdarkly-node-server-sdk` | Apache-2.0, ISC |
| python | `launchdarkly-server-sdk-pypi`, `statsig-python-core`, `statsig-pypi`, `openfeature-sdk` | Apache-2.0, ISC |
| go | `go-sdk-go-3`, `go-feature-flag-go`, `v9-go`, `v4-go-8` | Apache-2.0, MIT |
| rust | `statsig`, `launchdarkly-server-sdk-evaluation`, `statsig-rust`, `launchdarkly-server-sdk-crates` | Apache-2.0, ISC |
| java | `io-getunleash-unleash-client-java-maven`, `dev-openfeature-sdk-maven`, `com-launchdarkly-launchdarkly-android-client-sdk-maven`, `com-optimizely-ab-core-api-maven` | Apache-2.0 |
| kotlin | `com-statsig-serversdk-maven`, `io-growthbook-sdk-growthbook-maven` | ISC, MIT |
| csharp | `launchdarkly-serversdk`, `unleash-client`, `openfeature`, `configcat-client` | Apache-2.0, MIT |
| ruby | `flipper`, `flipper-ui`, `unleash-gem`, `launchdarkly-server-sdk` | Apache-2.0, MIT |
| php | `laravel-pennant`, `launchdarkly-server-sdk-packagist`, `flagception-flagception`, `growthbook-growthbook-packagist` | Apache-2.0, MIT |
| dart | `flagsmith-pub-2`, `growthbook-sdk-flutter-pub`, `launchdarkly-flutter-client-sdk-pub`, `unleash-proxy-client-flutter-pub` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `featureflags-swift`, `realflags-swift`, `ios-client-sdk-swift`, `statsig-kit-swift` | Apache-2.0, ISC, MIT |
| elixir | `fun-with-flags`, `launchdarkly-server-sdk-hex`, `unleash-fresha`, `unleash-hex` | Apache-2.0, MIT |

