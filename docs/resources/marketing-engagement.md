# Email marketing, marketing automation, CRM and engagement resources

Newsletters and email templates (MJML, React Email), ESP and transactional email SDKs, marketing automation (Mautic, Listmonk), CRM clients (HubSpot, Salesforce, Pipedrive and self-hosted CRMs), web and mobile push, lead-capture forms and landing pages, reviews and social proof, and referral or affiliate programs.

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
| typescript | 303 |
| python | 92 |
| go | 50 |
| rust | 36 |
| java | 29 |
| kotlin | 2 |
| csharp | 70 |
| ruby | 93 |
| php | 156 |
| dart | 17 |
| swift | 15 |
| elixir | 30 |
| any | 78 |

Total: 971 records in `resources/catalog/marketing-engagement*.json`.

## Affiliate

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `referral-codes`, `saasquatch-squatch-js`, `marinedotsh-better-auth-referral`, `growsurfteam-growsurf-mcp` | MIT |
| python | `python-amazon-paapi`, `pinax-referrals`, `django-referral-system` | MIT |
| go | `pa-api` | Apache-2.0 |
| ruby | `talkable`, `refer`, `paapi` | MIT |
| php | `thewirecutter-paapi5-php-sdk`, `mateusjunges-laravel-invite-codes`, `revolution-laravel-amazon-product-api`, `fof-doorman` | Apache-2.0, MIT |
| any | `affiliate-skills`, `cj-affiliate`, `rakuten-advertising`, `refersion` | MIT, n/a |

## Crm

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `intercom-messenger-js-sdk`, `hubspot-api-client-npm`, `jsforce`, `jsforce-jsforce-node` | ISC, MIT |
| python | `simple-salesforce`, `hubspot-api-client-pypi`, `salesforce-bulk`, `apache-airflow-providers-salesforce` | Apache-2.0, MIT |
| go | `corteza`, `zoho`, `go-hubspot`, `force` | Apache-2.0, MIT |
| rust | `hubspot`, `powerplatform-dataverse-service-client`, `rust-sync-force`, `hubspot-contacts` | MIT |
| java | `com-force-api-force-wsc`, `io-intercom-android-intercom-sdk`, `com-force-api-force-partner-api`, `com-frejo-force-rest-api` | Apache-2.0, BSD-3-Clause |
| csharp | `microsoft-crmsdk-coreassemblies` (review), `microsoft-powerplatform-dataverse-client`, `netcoreforce-client`, `aspnet-security-oauth-salesforce` | Apache-2.0, MIT, non-standard |
| ruby | `restforce`, `intercom`, `intercom-rails`, `hubspot-api-client-gem` | Apache-2.0, MIT |
| php | `intercom-intercom-php`, `hubspot-api-client`, `hubspot-hubspot-php`, `omniphx-forrest` | Apache-2.0, MIT |
| dart | `sfmc` | BSD-3-Clause |
| elixir | `ex-force`, `intercom-elixir`, `line-drive`, `papercups` | MIT |
| any | `tiledesk`, `constant-contact`, `drift`, `freshdesk` | MIT, n/a |

## Email marketing

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `nodemailer-npm`, `react-email-render`, `resend`, `sendgrid-client` | MIT, MIT-0 |
| python | `email-validator`, `sendgrid-pypi`, `aiosmtplib`, `resend-pypi` | MIT, Unlicense |
| go | `mailhog`, `billionmail` (review), `mailpit`, `sendgrid-go` | AGPL-3.0, MIT |
| rust | `aws-sdk-sesv2-crates`, `aws-sdk-ses-crates`, `sendgrid-crates`, `mrml` | Apache-2.0, MIT |
| java | `software-amazon-awssdk-sesv2`, `com-sendgrid-sendgrid-java`, `net-sargue-mailgun`, `com-mailjet-mailjet-client` | Apache-2.0, MIT |
| csharp | `sendgrid`, `awssdk-simpleemail`, `sendgrid-extensions-dependencyinjection`, `premailer-net` | Apache-2.0, MIT |
| ruby | `aws-sdk-ses`, `premailer`, `premailer-rails`, `aws-sdk-sesv2` | Apache-2.0, BSD-3-Clause, MIT |
| php | `tijsverkoyen-css-to-inline-styles`, `sendgrid-sendgrid`, `symfony-mailgun-mailer`, `mailgun-mailgun-php` | BSD-3-Clause, MIT |
| dart | `mailer`, `customer-io`, `klaviyo-flutter` | BSD-3-Clause, MIT |
| swift | `mailgun-swift`, `sendgrid-swift`, `customerio-ios` | MIT |
| elixir | `bamboo`, `premailex`, `sendgrid-hex`, `swoosh` | MIT |
| any | `responsive-html-email-template`, `foundation-emails`, `activecampaign`, `autopilot` | MIT, n/a |

## Forms landing

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `typeform-embed`, `grapesjs`, `typeform-embed-react`, `puckeditor-core` | BSD-3-Clause, MIT |
| python | `builder`, `airbyte-source-typeform` | MIT |
| rust | `oranda`, `google-surveys2`, `google-consumersurveys2` | MIT, MIT OR Apache-2.0 |
| csharp | `surveymonkeyapi` (review), `apptentivesurvey` | BSD-3-Clause, non-standard |
| ruby | `invisible-captcha`, `decidim-surveys` (review), `google-apis-forms-v1`, `survey-gizmo-ruby` | AGPL-3.0-or-later, Apache-2.0, MIT |
| php | `spatie-laravel-honeypot`, `kris-laravel-form-builder`, `anahkiasen-former`, `msurguy-honeypot` | MIT |
| dart | `flutter-form-builder` | MIT |
| swift | `eureka` | MIT |
| elixir | `zotonic-mod-survey`, `dynamic-form`, `form-builder-dsl` | Apache-2.0, MIT |

## Marketing automation

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `braze-web-sdk` (review), `braze-react-native-sdk` (review), `iterable-web-sdk`, `braze-expo-plugin` (review) | MIT, SEE LICENSE IN LICENSE.md, SEE LICENSE IN https://github.com/braze-inc/braze-web-sdk/blob/master/LICENSE |
| python | `customerio-pypi`, `klaviyo-api-pypi`, `marketorestpython`, `async-customerio` | MIT |
| go | `pinpoint` | Apache-2.0 |
| java | `com-clevertap-android-clevertap-android-sdk`, `com-leanplum-leanplum-core`, `com-iterable-iterableapi`, `com-braze-android-sdk-ui` | Apache-2.0, LICENSE |
| csharp | `appboyplatform-androidbinding` (review) | non-standard |
| ruby | `mrkt`, `iterable-api-client`, `braze-ruby`, `infusionsoft` | MIT |
| php | `infusionsoft-php-sdk`, `mautic-api-library`, `braze-sdk`, `dripemail-drip-php` | MIT |
| dart | `clevertap-plugin` (review), `braze-plugin` (review), `moengage-flutter` (review) | NOASSERTION |
| swift | `appboy-ios-sdk` (review), `iterable-swift-sdk`, `leanplum-ios-sdk` | Apache-2.0, MIT, NOASSERTION |
| elixir | `active-campaign`, `braze-ex`, `infusionsoft-hex` | MIT |
| any | `awesome-marketing`, `adaptive-insights`, `allocadia`, `asana` | MIT, n/a |

## Push

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `firebase-messaging`, `web-push-npm`, `expo-notifications`, `capacitor-push-notifications` | Apache-2.0, MIT, MPL-2.0 |
| python | `firebase-admin`, `pywebpush`, `aioapns`, `knockapi` | Apache-2.0, MPL-2.0 |
| go | `server`, `gorush`, `firebase-google-com-go`, `apns2-go` | Apache-2.0, MIT |
| rust | `web-push-crates`, `a2`, `google-fcm1`, `web-push-native` | Apache-2.0, MIT, MIT OR Apache-2.0 |
| java | `com-eatthepath-pushy`, `com-onesignal-onesignal`, `com-google-firebase-firebase-admin`, `nl-martijndwars-web-push` | Apache-2.0, MIT |
| kotlin | `com-interaso-webpush` | MIT |
| csharp | `webpush-nuget`, `lib-net-http-webpush`, `dotapns`, `corepush` | Apache-2.0, MIT, MPL-2.0 |
| ruby | `fcm`, `webpush`, `apnotic`, `rpush` | MIT |
| php | `minishlink-web-push`, `laravel-notification-channels-fcm`, `laravel-notification-channels-webpush`, `berkayk-onesignal-laravel` | MIT |
| dart | `firebase-messaging-pub`, `awesome-notifications`, `onesignal-flutter`, `intercom-flutter` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `apnswift`, `onesignal-ios-sdk`, `ios-library`, `fcm-swift` | Apache-2.0, MIT |
| elixir | `pigeon`, `knock`, `google-api-fcm`, `apns4erl` | Apache-2.0, MIT |

## Reviews

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `expo-store-review`, `react-native-in-app-review`, `featurebase-js`, `react-native-store-review` | MIT |
| python | `trustpilot`, `yelpapi` | BSD, MIT |
| go | `fider` (review) | AGPL-3.0 |
| rust | `yelp-fusion-rs` | MIT |
| java | `clearflask` | Apache-2.0 |
| kotlin | `io-github-sergeimikhailovskii-in-app-review-kmp-android` | Apache-2.0 |
| csharp | `plugin-storereview`, `plugin-maui-apprating` | MIT |
| ruby | `zreviewtender` | MIT |
| php | `spryker-feature-product-rating-reviews` (review), `trustpilot-module-reviews` (review), `codebyray-laravel-review-rateable`, `turnto-social-commerce` (review) | MIT, OSL-3.0, proprietary |
| dart | `in-app-review` | MIT |
| swift | `appreview` | MIT |
| any | `brand24`, `podium`, `reputology`, `trustpilot-service` | n/a |

