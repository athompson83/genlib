# Social media resources

Official API clients and protocol SDKs for X, Meta (Facebook, Instagram, Threads), LinkedIn, TikTok, YouTube, Reddit, Pinterest, Bluesky/AT Protocol, Mastodon/ActivityPub, Telegram, Discord and more; social schedulers such as Postiz and Mixpost; share buttons and embeds; and self-hosted social networks (Mastodon, Pixelfed, PeerTube, HumHub, OSSN, Elgg).

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
| typescript | 330 |
| python | 92 |
| go | 54 |
| rust | 44 |
| java | 19 |
| kotlin | 4 |
| csharp | 32 |
| ruby | 35 |
| php | 87 |
| dart | 14 |
| swift | 21 |
| elixir | 21 |
| any | 43 |

Total: 796 records in `resources/catalog/social-media*.json`.

## Advertising

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `facebook-nodejs-business-sdk` (review), `react-facebook-pixel`, `nextjs-linkedin-insight-tag`, `react-native-tiktok-business-sdk` | MIT, Platform License |
| any | `adespresso`, `adroll`, `canva`, `facebook-ads-manager` | n/a |

## Analytics

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `segment-analytics-react-native-plugin-facebook-app-events` | MIT |

## Content

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `rsshub` (review), `nolebase-vitepress-plugin-og-image` | AGPL-3.0, MIT |
| php | `rss-bridge` | Unlicense |

## Crm

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| ruby | `chatwoot` | MIT |

## Links qr

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| php | `linkstack` (review) | AGPL-3.0 |
| any | `littlelink` | MIT |

## Marketing automation

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `botpress`, `hexabot` | Apache-2.0, MIT |

## Seo

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `svelte-seo`, `react-og-preview` | MIT |

## Social media

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `grammy`, `discord-api-types`, `chat`, `react-player` | MIT |
| python | `google-api-python-client`, `youtube-transcript-api`, `yt-dlp`, `line-bot-sdk` | Apache-2.0, MIT, Unlicense |
| go | `answer`, `owncast`, `discordgo`, `matterbridge` | Apache-2.0, BSD-3-Clause, MIT |
| rust | `serenity`, `twapi-v2`, `twilight-http`, `teloxide` | ISC, MIT |
| java | `com-google-apis-google-api-services-youtube`, `com-google-apis-google-api-services-youtubeanalytics`, `com-github-binarywang-weixin-java-mp`, `com-facebook-android-facebook-android-sdk` | Apache-2.0, Facebook Platform License |
| kotlin | `amethyst`, `dev-kord-kord-core`, `sh-christian-ozone-bluesky`, `work-socialhub-kbsky-core` | MIT |
| csharp | `telegram-bot`, `facebook`, `google-apis-youtube-v3`, `tweetinviapi` | Apache-2.0, MIT |
| ruby | `koala`, `discordrb-webhooks`, `twitter`, `twitter-text` | Apache-2.0, MIT |
| php | `abraham-twitteroauth`, `prestashop-ps-sharebuttons`, `google-apiclient-services`, `irazasyed-telegram-bot-sdk` | AFL-3.0, Apache-2.0, BSD-3-Clause, MIT |
| dart | `share-plus`, `youtube-player-flutter`, `flutter-facebook-auth`, `bluesky` | BSD-3-Clause, MIT |
| swift | `facebook-ios-sdk` (review), `icecubesapp` (review), `mastodon-ios` (review), `damus` (review) | AGPL-3.0, GPL-3.0, NOASSERTION |
| elixir | `nadia`, `extwitter`, `tmi`, `nostrum` | Apache-2.0, MIT |
| any | `nips` (review), `pds`, `lemmy-ui` (review), `commento` | AGPL-3.0, Apache-2.0, MIT, n/a |

