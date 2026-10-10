# Financial and accounting tools

Tools and libraries for money: personal finance and budgeting (Firefly III, Actual Budget, GnuCash, Ghostfolio, Financial Freedom), accounting and ERP (Akaunting, Frappe Books, ERPNext, Invoice Ninja, InvoiceShelf), plain-text accounting (Ledger, hledger, Beancount, Fava), core banking and ledgers (Apache Fineract, TigerBeetle, Formance) with OFX, MT940, ISO 20022 and IBAN libraries, payments and billing (official Stripe, PayPal, Adyen, Square SDKs; Lago, Kill Bill), money and decimal types, accounting platform SDKs (QuickBooks, Xero, Sage Intacct), market data and quant (OpenBB, QuantLib, TA-Lib, backtesting), portfolio tracking and crypto finance libraries in every common language.

Every record was checked on 2026-10-10: `git ls-remote` for repositories, the registry API for packages and Docker Hub or ghcr.io for images; licenses come from registry metadata or the LICENSE file (OpenBB's LICENSE says Apache-2.0). Records marked `license-review` are copyleft (Firefly III, Ghostfolio and others are AGPL), source-available (Invoice Ninja is Elastic-2.0), non-commercial (Investbrain) or no-resale (vectorbt Commons Clause). Payment, bank and accounting SDKs talk to commercial services that need an account and API keys: keep keys on the trusted server, verify webhooks, and use test modes. Financial Freedom is on hold upstream and Maybe Finance is archived (use its fork, Sure). Market data, broker and exchange libraries carry provider terms; trading code risks real money. Nothing here is financial, tax or legal advice. Popularity is the registry's own number or GitHub stars and only comparable within one ecosystem.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find budgeting app self hosted --json
node "$GENLIB_ROOT/tools/resources.mjs" search money decimal currency --language go --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect firefly-iii --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 45 |
| python | 79 |
| go | 30 |
| rust | 18 |
| java | 32 |
| kotlin | 13 |
| csharp | 23 |
| ruby | 30 |
| php | 33 |
| dart | 16 |
| swift | 15 |
| elixir | 14 |
| any | 12 |

Total: 360 records in `resources/catalog/finance-accounting*.json`.

## Personal finance and budgeting apps

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `actual-app-api`, `typescript-ynab`, `kresus` (review), `spliit`, `budget-zero` (review) | AGPL-3.0, AGPL-3.0-or-later, Apache-2.0, MIT |
| python | `actualpy`, `python-ynab` | Apache-2.0, MIT |
| go | `monetr` | MIT |
| kotlin | `my-expenses` (review) | GPL-3.0 |
| ruby | `ruby-ynab`, `maybe-finance` (review) | AGPL-3.0, Apache-2.0 |
| php | `financial-freedom` (review), `firefly-iii-data-importer` (review) | AGPL-3.0, GPL-3.0 |
| dart | `cashew` (review), `waterfly-iii-firefly-iii-mobile-client` | GPL-3.0, MIT |
| any | `money-manager-ex` (review), `kmymoney` (review), `skrooge` (review) | GPL-2.0, GPL-2.0-or-later, GPL-3.0-or-later |

## Accounting, invoicing and ERP

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `frappe-books` (review) | AGPL-3.0 |
| python | `trytond` (review), `django-ledger` (review), `python-accounting` (review) | GPL-3.0-or-later, MIT |
| java | `apache-fineract`, `metasfresh` (review), `axelor-open-suite` (review), `idempiere` (review) | AGPL-3.0, Apache-2.0, GPL-2.0 |
| ruby | `plutus`, `double-entry` | MIT |
| php | `crater` (review), `ekmungai-eloquent-ifrs` | AGPL-3.0, MIT |
| any | `gnucash` (review), `ledgersmb` (review) | GPL-2.0, GPL-3.0 |

## Plain-text accounting

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| python | `beanquery` (review), `beangulp` (review), `smart-importer`, `ledger-autosync` (review) | GNU General Public License v2 (GPLv2), GPLv3, MIT |
| go | `paisa` (review), `ledger` | AGPL-3.0, ISC |
| rust | `beancount-parser`, `beancount-language-server` | MIT, Unlicense |
| ruby | `reckon` | MIT |
| any | `hledger-docker-image`, `ledger-ledger-cli` | BSD-3-Clause, MIT |

## Core banking, ledgers and bank-data formats

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `react-plaid-link`, `tigerbeetle-node`, `gocardless-nodejs`, `nordigen-node`, `formance-formance-sdk` (review) | Apache-2.0, MIT |
| python | `plaid-python`, `mt-940`, `ofxparse`, `sepaxml`, `gocardless-pro-pypi` | BSD-3-Clause, MIT |
| go | `formance-ledger`, `go-ach`, `blnk`, `plaid-go`, `ofxgo` (review) | Apache-2.0, GPL-2.0, MIT |
| java | `com-tigerbeetle-tigerbeetle-java`, `com-prowidesoftware-pw-swift-core`, `com-prowidesoftware-pw-iso20022`, `com-plaid-plaid-java`, `com-gocardless-gocardless-pro` | Apache-2.0, MIT |
| kotlin | `com-plaid-link-sdk-core` | MIT |
| csharp | `tigerbeetle`, `gocardless`, `going-plaid`, `truelayer-client` | Apache-2.0, MIT |
| ruby | `plaid`, `gocardless-pro`, `sepa-king`, `ruby-cmxl`, `camt-parser` | MIT |
| php | `digitick-sepa-xml`, `gocardless-gocardless-pro`, `genkgo-camt`, `jejik-mt940`, `nemiah-php-fints` | LGPL-3.0-or-later, MIT |
| dart | `plaid-flutter` | MIT |
| swift | `plaid-link-ios` | MIT |
| elixir | `tigerbeetlex`, `ibanity` | Apache-2.0, MIT |
| any | `tigerbeetle-github`, `pgledger` | Apache-2.0, MIT |

## Payments, subscriptions and billing

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `braintree-web`, `stripe-stripe-react-native`, `adyen-adyen-web`, `square-npm`, `polar-sh-sdk` | MIT |
| python | `braintree-pypi`, `adyen-pypi`, `dj-stripe`, `squareup`, `paddle-python-sdk` | Apache-2.0, MIT |
| go | `stripe-go-go`, `stripe-cli`, `adyen-go-api-library`, `paddle-go-sdk`, `lago-go-client` | Apache-2.0, MIT |
| rust | `async-stripe` | MIT OR Apache-2.0 |
| java | `com-stripe-stripe-java`, `com-braintreepayments-gateway-braintree-java`, `com-adyen-adyen-java-api-library`, `com-squareup-square`, `org-kill-bill-billing-killbill-client-java` | Apache-2.0, MIT |
| kotlin | `com-stripe-stripe-android`, `com-revenuecat-purchases-purchases`, `com-braintreepayments-api-card`, `com-adyen-checkout-drop-in`, `com-paypal-android-paypal-web-payments` | Apache-2.0, MIT |
| csharp | `stripe-net`, `braintree-nuget`, `adyen`, `mollie-api`, `square` | Apache-2.0, MIT |
| ruby | `stripe`, `braintree`, `adyen-ruby-api-library`, `ruby-pay`, `square-rb` | MIT |
| php | `stripe-stripe-php`, `laravel-cashier`, `braintree-braintree-php`, `mollie-mollie-api-php`, `adyen-php-api-library` | BSD-2-Clause, MIT |
| dart | `in-app-purchase`, `flutter-stripe`, `dart-pay`, `purchases-flutter`, `square-in-app-payments` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `revenuecat-ios-sdk`, `stripe-ios-sdk`, `braintree-ios-sdk`, `adapty-ios-sdk`, `adyen-ios-sdk` | MIT |
| elixir | `stripity-stripe` | BSD-3-Clause |

## Money, currency and decimal libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `bignumber-js`, `currency-codes`, `currency-js`, `ibantools`, `avatax-npm` | Apache-2.0, MIT, MIT or MPL-2.0 |
| python | `babel-pypi`, `python-stdnum`, `numpy-financial`, `schwifty`, `django-money` | BSD-3-Clause, LGPL, MIT |
| go | `go-money`, `go-apd`, `currency`, `money-go`, `banking` | Apache-2.0, MIT |
| rust | `bigdecimal`, `iban-validate`, `fastnum`, `iso-currency`, `rusty-money` | MIT, MIT OR Apache-2.0, MIT/Apache-2.0 |
| java | `org-joda-joda-money`, `org-mustangproject-library`, `org-javamoney-moneta`, `javax-money-money-api`, `org-iban4j-iban4j` | Apache-2.0 |
| kotlin | `com-ionspin-kotlin-bignum`, `io-fluidsonic-currency-fluid-currency` | Apache-2.0 |
| csharp | `ibannet`, `nodamoney`, `zugferd-csharp` | Apache-2.0 |
| ruby | `money`, `money-rails`, `avatax`, `valvat`, `eu-central-bank` | Apache-2.0, MIT |
| php | `brick-math`, `moneyphp-money`, `brick-money`, `horstoeko-zugferd`, `globalcitizen-php-iban` | LGPL-3.0-only, MIT |
| dart | `flutter-multi-formatter`, `decimal-pub`, `currency-text-input-formatter`, `money2` | Apache-2.0, MIT |
| swift | `bigdecimal-swift` | MIT |
| elixir | `decimal`, `number`, `money-hex`, `ex-cldr-currencies`, `ex-cldr-numbers` | Apache-2.0, MIT |

## Accounting platform SDKs (QuickBooks, Xero, Sage)

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `node-quickbooks`, `mergeapi-merge-node-client` (review), `intacct-intacct-sdk`, `freshbooks-api` | Apache-2.0, ISC, MIT, custom (see LICENSE.md) |
| python | `intuit-oauth-pypi`, `mergepythonclient` (review), `python-quickbooks`, `xero-python`, `freshbooks-sdk` | Apache-2.0, MIT, custom (see LICENSE.md) |
| go | `quickbooks-go` | BSD-2-Clause |
| java | `com-intuit-quickbooks-online-ipp-v3-java-devkit`, `com-intuit-quickbooks-online-oauth2-platform-api`, `com-github-xeroapi-xero-java` | Apache-2.0, MIT |
| csharp | `ippdotnetsdkforquickbooksapiv3`, `xero-netstandard-oauth2`, `intacct-sdk`, `ippoauth2platformsdk` | Apache-2.0, MIT |
| ruby | `quickbooks-ruby`, `xero-ruby` | MIT, Unlicense |
| php | `quickbooks-v3-php-sdk`, `xeroapi-xero-php-oauth2`, `intacct-intacct-sdk-php`, `webleit-zohobooksapi` | Apache-2.0, MIT |

## Market data, backtesting and quantitative finance

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `technicalindicators`, `alpacahq-alpaca-trade-api`, `trading-signals`, `polygon-io-client-js`, `finnhub` (review) | Apache-2.0, MIT |
| python | `yfinance`, `exchange-calendars`, `pandas-market-calendars`, `quantlib`, `fredapi` (review) | Apache-2.0, BSD-3-Clause, MIT |
| go | `indicator` (review), `go-talib`, `alpaca-trade-api-go`, `client-go-go` | AGPL-3.0, Apache-2.0, MIT |
| rust | `rust-ta`, `yahoo-finance-api`, `rust-yata`, `rustquant`, `barter-data` | Apache-2.0, MIT, MIT OR Apache-2.0 |
| java | `org-ta4j-ta4j-core` | MIT |
| csharp | `skender-stock-indicators`, `qlnet`, `lean-quantconnect` | Apache-2.0, BSD-3-Clause |
| any | `quantlib-github`, `ta-lib-c-library`, `quantlib-swig-bindings-java-c-r-scala` | BSD-3-Clause, BSD-3-Clause (QuantLib license) |

## Portfolio tracking and investing

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `wealthfolio` (review), `portfolio-allocation` | AGPL-3.0, MIT |
| python | `quantstats`, `empyrical-reloaded`, `pyportfolioopt`, `skfolio`, `riskfolio-lib` | Apache-2.0, BSD (3-clause), BSD-3-Clause, MIT |
| java | `portfolio-performance` | EPL-1.0 |
| php | `investbrain` (review) | CC-BY-NC-4.0 |

## Crypto wallets, exchanges and blockchain finance

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `typescript-viem`, `ethers`, `bitcoinjs-lib`, `typescript-ccxt` | MIT |
| python | `python-web3`, `python-ccxt`, `python-bitcoinlib` | LGPL-3.0, MIT |
| go | `go-ethereum` (review), `ccxt-go`, `go-btcd` | ISC, LGPL-3.0 (library) / GPL-3.0 (binaries), MIT |
| rust | `bitcoin`, `alloy-crates`, `lightning`, `bdk-wallet` | CC0-1.0, MIT OR Apache-2.0 |
| java | `org-web3j-core`, `org-bitcoinj-bitcoinj-core` | Apache-2.0 |
| kotlin | `org-bitcoindevkit-bdk-android`, `fr-acinq-lightning-lightning-kmp-core`, `fr-acinq-bitcoin-bitcoin-kmp` | Apache-2.0 |
| csharp | `nbitcoin`, `nethereum-web3`, `csharp-ccxt` | MIT |
| ruby | `ruby-eth`, `bitcoinrb` | Apache-2.0, MIT |
| php | `ccxt-ccxt` | MIT |
| dart | `web3dart`, `bdk-flutter` | MIT |
| swift | `web3swift`, `web3-swift-argent`, `swift-secp256k1`, `bdk-swift` | Apache-2.0, MIT |
| elixir | `ethereumex`, `ethers-hex`, `bitcoinex` | Apache-2.0, MIT, Unlicense |

