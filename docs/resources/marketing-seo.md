# SEO, AI optimization and content marketing resources

Meta tags, sitemaps, robots rules, structured data (JSON-LD), Open Graph images, crawlers and audits, llms.txt and AI-crawler rules for answer-engine optimization (AEO/GEO), keyword and readability analysis, feeds, short links, UTM builders and QR codes.

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
| typescript | 453 |
| python | 154 |
| go | 43 |
| rust | 53 |
| java | 14 |
| csharp | 42 |
| ruby | 54 |
| php | 108 |
| dart | 11 |
| swift | 10 |
| elixir | 26 |
| any | 60 |

Total: 1028 records in `resources/catalog/marketing-seo*.json`.

## Ai optimization

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `natural`, `keyword-extractor` (review), `starlight-llms-txt`, `usenotra-geo` | MIT |
| python | `markdownify`, `sentence-transformers-pypi`, `html2text` (review), `firecrawl-py` | Apache-2.0, GPL-3.0-or-later, MIT |
| go | `html-to-markdown`, `lingua-go` | Apache-2.0, MIT |
| rust | `rake`, `yake-rust`, `actix-block-ai-crawling` (review), `rust-readability` (review) | AGPL-3.0, Apache-2.0, GPL-3.0-or-later, MIT |
| php | `donatello-za-rake-php-plus`, `passionweb-ai-seo-helper` (review), `stolt-llms-txt-php`, `mikestecker-craft-readability` | GPL-3.0, MIT |
| any | `llms-txt-github`, `gtm-engineer-skills`, `awesome-generative-engine-optimization` (review) | Apache-2.0, MIT, n/a |

## Content

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `satori`, `vercel-og`, `remotion-npm` (review), `remotion-player` (review) | MPL-2.0, SEE LICENSE IN LICENSE.md |
| python | `feedparser`, `htmldate`, `trafilatura`, `emoji` | Apache-2.0, BSD, BSD-2-Clause |
| go | `gofeed`, `feeds`, `go-rss`, `go-readability` | BSD-3-Clause, MIT, Unlicense |
| rust | `takumi`, `leptos-next-metadata`, `oembed-rs`, `url-preview` | MIT, MIT OR Apache-2.0 |
| java | `eu-michael-simons-java-oembed` | BSD-3-Clause |
| csharp | `dawoe-oembedpickerpropertyeditor`, `oembed-nuget`, `urlpreview`, `umbraco-cms` | MIT |
| ruby | `ruby-oembed`, `blacklight-oembed`, `jekyll-linkpreview`, `oembed-proxy` | Apache-2.0, MIT |
| php | `wp-cli-embed-command`, `mpratt-embera`, `marcelklehr-link-preview`, `wrav-oembed` | MIT |
| swift | `linkpreview`, `linkpreviewswift` | MIT |
| elixir | `oembed`, `req-embed`, `zotonic-mod-oembed` | Apache-2.0, MIT |
| any | `adobe-spark`, `animoto`, `bcms`, `brandfolder` | n/a |

## Links qr

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `qrcode`, `qrcode-react`, `qrcode-terminal` (review), `toqr` | Apache-2.0, ISC, MIT |
| python | `qrcode-pypi` (review), `segno`, `python-barcode`, `types-qrcode` | Apache-2.0, BSD, BSD OR LicenseRef-Other, MIT |
| go | `go-qrcode`, `barcode-go`, `xurls`, `gozxing` | Apache-2.0 AND MIT, BSD-3-Clause, MIT |
| rust | `qrcode-crates`, `qrcodegen`, `qrcode-generator-crates`, `rqrr` | Apache-2.0, MIT, MIT OR Apache-2.0 |
| java | `com-google-zxing-core`, `io-nayuki-qrcodegen` | Apache-2.0, MIT |
| csharp | `net-codecrete-qrcodegenerator`, `skiasharp-qrcode`, `barcode` (review) | MIT, non-standard |
| ruby | `rqrcode`, `bitly`, `prawn-qrcode`, `fastqr` | Apache-2.0, LGPL-2.1, MIT |
| php | `bacon-bacon-qr-code`, `endroid-qr-code`, `chillerlan-php-qrcode`, `simplesoftwareio-simple-qrcode` | BSD-2-Clause, MIT, MIT OR Apache-2.0 |
| dart | `qr-flutter`, `mobile-scanner`, `qr-code-scanner`, `pretty-qr-code` | BSD-2-Clause, BSD-3-Clause, MIT |
| swift | `efqrcode`, `qrcode-swift`, `qrdispenser` | MIT |
| elixir | `eqrcode`, `qr-code`, `nitro-qrcode` | Apache-2.0, BSD-4-Clause, MIT |

## Seo

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `web-vitals`, `slugify`, `github-slugger`, `sindresorhus-slugify` | Apache-2.0, ISC, MIT |
| python | `python-slugify`, `courlan`, `protego`, `url-normalize` | Apache-2.0, BSD-3-Clause, MIT |
| go | `muffet`, `slug-go`, `colly`, `seonaut` | Apache-2.0, MIT, MPL-2.0 |
| rust | `slug`, `rss-crates`, `feed-rs`, `spider` | Apache-2.0, MIT |
| java | `com-google-apis-google-api-services-pagespeedonline`, `com-google-apis-google-api-services-searchconsole`, `edu-uci-ics-crawler4j`, `com-rometools-rome` | Apache-2.0 |
| csharp | `schema-net`, `codehollow-feedreader`, `seochecker` (review), `cloudscribe-web-sitemap` | Apache-2.0, MIT, non-standard |
| ruby | `babosa`, `friendly-id`, `sitemap-generator`, `webrobots` | BSD-2-Clause, MIT |
| php | `spatie-image-optimizer`, `cocur-slugify`, `laminas-laminas-feed`, `spatie-robots-txt` | BSD-3-Clause, MIT |
| dart | `seo-pub`, `metadata-fetch`, `dart-rss`, `linkcheck` | BSD-3-Clause, MIT |
| swift | `plot`, `feedkit`, `opengraph` (review), `tagkit` | MIT, NOASSERTION |
| elixir | `slugify-hex`, `slugger`, `sitemapper`, `ecto-autoslug-field` | MIT |
| any | `schemaorg`, `htmltest`, `accuranker`, `ahrefs` | Apache-2.0, MIT, n/a |

