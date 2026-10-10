# Chat and messaging resources

Team chat (Mattermost, Rocket.Chat, Zulip, Stoat/Revolt), live chat and omnichannel support (Chatwoot, Papercups), federated and encrypted protocols and servers (Matrix: Synapse, Conduit, Tuwunel, Dendrite; XMPP: Prosody, ejabberd, Openfire; IRC), encrypted messengers (SimpleX Chat, Signal, Session, Briar, Jami, Delta Chat, Element), real-time chat SDKs and UI kits (Socket.IO, Centrifugo, Soketi, Tinode, matrix SDKs, libsignal), bot frameworks (Slack Bolt, discord.js, discord.py, JDA, Microsoft 365 Agents and Teams SDKs) and hosted chat APIs (Stream, Sendbird, CometChat, Ably, Pusher, Twilio) in every common language, plus the entries of the awesome-communication list.

Every record was checked on 2026-10-10: registry API for packages, `git ls-remote` for repositories, and Docker Hub, ghcr.io or quay.io for images; licenses come from registry metadata or the LICENSE file. Records marked `license-review` are copyleft (AGPL servers such as Signal-Server, Synapse, Mattermost), commercial or custom (Stream, Sendbird, CometChat, PubNub); decide before embedding. Hosted SDKs need an account and keep keys server-side. Unofficial WhatsApp/Telegram puppeting bridges are excluded for terms-of-service risk. Popularity is the registry's own number and only comparable within one ecosystem.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find team chat self hosted --target "$APP_ROOT" --json
node "$GENLIB_ROOT/tools/resources.mjs" search slack bot --language python --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect mattermost --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 79 |
| python | 34 |
| go | 21 |
| rust | 21 |
| java | 20 |
| kotlin | 7 |
| csharp | 11 |
| ruby | 9 |
| php | 12 |
| dart | 13 |
| swift | 11 |
| elixir | 3 |
| any | 22 |

Total: 263 records in `resources/catalog/chat-messaging.json`.

## Team and workplace chat

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `rocket-chat` (review), `huly`, `element-web` (review), `franz`, `ferdium` | AGPL-3.0, Apache-2.0, EPL-2.0, MIT (Community) + proprietary Enterprise directories |
| python | `zulip-github` | Apache-2.0 |
| go | `mattermost` (review), `tinode` (review) | AGPL-3.0 / Apache-2.0 (mixed, see LICENSE.txt), GPL-3.0 |
| rust | `halloy` (review), `stoat-formerly-revolt-backend` (review) | AGPL-3.0, GPL-3.0 |
| java | `conversations` (review) | GPL-3.0 |
| ruby | `campfire-once` | MIT |
| php | `nextcloud-talk` (review), `movim` (review) | AGPL-3.0 |
| dart | `fluffychat` (review), `commet` (review) | AGPL-3.0 |
| any | `weechat` (review), `wire-server` (review), `nheko` (review), `dino` (review), `monal` | AGPL-3.0, BSD-3-Clause, GPL-3.0 |

## Live chat and customer support

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `intercom-client-npm` (review), `crisp-sdk-web` (review), `tiledesk-tiledesk-server` (review), `ghostchat-widget` | AGPL-3.0, Apache-2.0, MIT |
| go | `libredesk` (review) | AGPL-3.0 |
| php | `uvdesk-community` (review), `freescout` (review), `live-helper-chat` | AGPL-3.0, Apache-2.0, OSL-3.0 |

## Matrix, XMPP and IRC servers

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `soketi` (review) | AGPL-3.0 |
| python | `synapse` (review) | AGPL-3.0 |
| go | `ergo`, `dendrite` (review), `soju` (review) | AGPL-3.0, MIT |
| rust | `tuwunel`, `conduit`, `matrix-authentication-service` (review), `continuwuity` | AGPL-3.0, Apache-2.0 |
| java | `signal-server` (review), `openfire`, `tigase-xmpp-server` (review) | AGPL-3.0, Apache-2.0 |
| php | `laravel-reverb` | MIT |
| any | `simplex-smp-server` (review), `prosody`, `ejabberd` (review), `znc`, `mongooseim` (review) | AGPL-3.0, Apache-2.0, GPL-2.0, MIT |

## Encrypted messengers

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `signal-desktop` (review), `quiet` (review), `chitchatter` (review), `delta-chat-desktop` (review), `session-desktop` (review) | AGPL-3.0, GPL-2.0, GPL-3.0 |
| go | `berty`, `cwtch` (review) | Apache-2.0, unknown |
| rust | `delta-chat-core-chatmail-core` | MPL-2.0 |
| java | `delta-chat-android` (review), `threema-android` (review), `briar` (review) | AGPL-3.0, GPL-3.0 |
| kotlin | `signal-android` (review), `molly` (review), `element-x-android` (review), `session-android` (review) | AGPL-3.0, GPL-3.0 |
| swift | `signal-ios` (review), `element-x-ios` (review), `session-ios` (review) | AGPL-3.0, GPL-3.0 |
| any | `simplex-chat` (review), `c-toxcore` (review), `retroshare`, `status-desktop`, `jami-daemon` (review) | AGPL-3.0, GPL-2.0-or-later / LGPL-3.0 (REUSE, see .reuse/dep5), GPL-3.0, MPL-2.0 |

## Real-time chat SDKs, UI kits and protocol libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `ws-npm`, `socket-io-npm`, `socket-io-client`, `partysocket`, `phoenix-npm` | MIT |
| python | `websockets`, `python-socketio`, `channels`, `matrix-nio` (review), `mautrix` | BSD-3-Clause, ISC, MIT, MPL-2.0 |
| go | `websocket`, `websocket-go`, `melody`, `centrifuge-go`, `mautrix-go` | BSD-2-Clause, ISC, MIT, MPL-2.0 |
| rust | `tokio-tungstenite`, `matrix-org-matrix-sdk-crypto-wasm`, `vodozemac`, `socketioxide`, `ruma` | Apache-2.0, MIT |
| java | `org-java-websocket-java-websocket`, `io-socket-socket-io-client`, `org-igniterealtime-smack-smack-core` | Apache-2.0, MIT |
| kotlin | `net-folivo-trixnity-client` | Apache-2.0 |
| csharp | `microsoft-aspnetcore-signalr-client`, `socketioclient` | MIT |
| ruby | `anycable` | MIT |
| php | `workerman-workerman` | MIT |
| dart | `web-socket-channel`, `flutter-chat-ui`, `socket-io-client-pub`, `dash-chat-2`, `matrix` (review) | AGPL-3.0, Apache-2.0, BSD-3-Clause, MIT |
| swift | `starscream`, `messagekit`, `socket-io-swift-client`, `exyte-chat`, `matrix-rust-components-swift` | Apache-2.0, MIT |
| elixir | `phoenix-hex`, `phoenix-pubsub` | MIT |
| any | `xmppframework` | BSD-3-Clause |

## Bot frameworks

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `grammy-npm`, `slack-bolt`, `chat-npm`, `microsoft-teams-apps`, `discord-js-npm` | Apache-2.0, MIT |
| python | `slack-bolt-pypi`, `python-telegram-bot-pypi`, `discord-py-pypi`, `aiogram-pypi`, `microsoft-agents-hosting-core` | LGPL-3.0-only, MIT |
| go | `mattermost-public`, `discordgo-go`, `slack`, `telebot-v3` | Apache-2.0, BSD-2-Clause, BSD-3-Clause, MIT |
| rust | `serenity-crates`, `teloxide-crates`, `poise-crates`, `twilight-gateway` | ISC, MIT |
| java | `net-dv8tion-jda-maven`, `com-discord4j-discord4j-core-maven`, `bot-libre`, `com-slack-api-bolt`, `com-slack-api-bolt-jakarta-servlet` | Apache-2.0, EPL-1.0, LGPL-3.0, MIT |
| kotlin | `dev-kord-kord-core-maven` | MIT |
| csharp | `slacknet`, `telegram-bot-nuget`, `discord-net-nuget`, `dsharpplus-nuget`, `microsoft-agents-hosting-aspnetcore` | MIT |
| ruby | `discordrb-gem`, `slack-ruby-bot-server`, `stealth` | MIT |
| php | `team-reflex-discord-php-packagist`, `botman-botman` | MIT |
| dart | `nyxx-pub` | Apache-2.0 |
| elixir | `nostrum-hex` | MIT |

## Hosted chat and messaging service SDKs

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `slack-web-api` (review), `twilio` (review), `pusher-js` (review), `ably` (review), `pusher-npm` (review) | Apache-2.0, MIT |
| python | `slack-sdk` (review), `twilio-pypi` (review), `pusher-pypi` (review), `ably-pypi` (review), `stream-chat-pypi` (review) | Apache-2.0, MIT, custom (see LICENSE) |
| go | `pusher-http-go` (review), `ably-go` (review), `stream-chat-go` (review) | Apache-2.0, BSD-3-Clause, MIT |
| java | `com-slack-api-slack-api-client` (review), `com-pusher-pusher-java-client` (review), `io-ably-ably-java` (review) | Apache-2.0, MIT |
| kotlin | `io-getstream-stream-chat-android-client` (review) | custom (see LICENSE) |
| csharp | `pusherserver` (review), `ably-io` (review), `stream-chat-net` (review) | Apache-2.0, MIT, custom (see LICENSE) |
| ruby | `slack-ruby-client` (review), `pusher` (review), `stream-chat-ruby` (review), `ably-gem` (review) | Apache-2.0, MIT, custom (see LICENSE) |
| php | `pusher-pusher-php-server` (review), `ably-ably-php` (review), `get-stream-stream-chat` (review) | Apache-2.0, BSD-3-Clause, MIT |
| dart | `stream-chat-flutter` (review), `pusher-channels-flutter` (review), `ably-flutter` (review), `sendbird-chat-sdk` (review) | Apache-2.0, MIT, custom (see LICENSE) |
| swift | `stream-chat-swift` (review), `ably-cocoa` (review), `sendbird-chat-ios` (review) | Apache-2.0, custom (see LICENSE), custom (see LICENSE.md) |

