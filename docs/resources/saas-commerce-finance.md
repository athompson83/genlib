# SaaS, commerce, finance and compliance resources

Records for auth and identity, authorization, payments and billing, commerce, money math and accounting, email and notifications, feature flags, admin/CMS, backend-as-a-service, realtime collaboration and legal/consent tooling. Choose a **package** when you only need the capability inside your code (for example `jose`, `big.js`, `yjs`), a **service** SDK when a hosted vendor owns the hard part (payments, tax, delivery), and an **application** when the client needs a whole self-hosted system. Prefer permissive licenses (MIT, Apache-2.0, BSD) for embedded code; records marked `license-review` are copyleft (GPL/AGPL/MPL) or source-available (BUSL, Elastic, Sustainable Use, MSCL) and need a license decision before use. Money: never use floating point for currency; pick a decimal library for your language. Pair Stripe/Resend/Plaid clients with the Genlib `common-api-clients` module and verify incoming webhooks with `webhook-verification`.

Records are automatically link/license checked (`verification: partial`, 2026-10-10: repository exists, registry license matches, homepage/docs resolve). The code has not been reviewed or tested in Genlib; check current upstream docs, versions and licenses before adoption.

## Authentication

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing session handling, password hashing, OAuth callbacks and org/team membership tables in a TypeScript app | `better-auth` | Framework-agnostic TypeScript authentication library with sessions, OAuth, 2FA, passkeys and organization plugins. | MIT |
| Instead of hand-writing OAuth provider flows and session cookies in an existing Next.js or Auth.js-based app | `authjs` | OAuth/OIDC, email and credentials authentication for Next.js, SvelteKit, Express and other web frameworks. | ISC |
| Instead of building sign-up/sign-in screens, MFA and org invites yourself | `clerk` | Hosted user management with prebuilt sign-in UI, organizations and session SDKs for React, Next.js and Expo. | MIT |
| Instead of hand-writing user signup, JWT issuance and OAuth login | `supabase-auth` | Go JWT-based auth server (formerly GoTrue) with email, OAuth, phone and SSO, used by Supabase. | MIT |
| Instead of hand-writing session rotation, refresh-token theft detection and login UI in Node, Python or Go backends | `supertokens` | Open-source auth core with backend SDKs (Node, Python, Go) and prebuilt UI for sessions, passwordless and social login. | Apache-2.0 |
| Instead of hand-writing per-provider login middleware in an existing Express/Connect app | `passport` | Express-compatible authentication middleware with hundreds of strategy plugins (local, OAuth, SAML, JWT). | MIT |
| Instead of hand-writing signup, email confirmation and social OAuth login in a Django project | `django-allauth` | Django apps for local accounts, email verification, MFA, social login and headless (API) authentication. | MIT |
| Instead of hand-parsing CBOR attestation and verifying WebAuthn assertions | `simplewebauthn` | TypeScript server and browser libraries for WebAuthn passkey registration and authentication. | MIT |

## OAuth, OIDC and JWT protocol libraries

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing PKCE, token requests, DPoP and ID-token validation against an OIDC provider | `oauth4webapi` | Low-level OAuth 2 / OpenID Connect client using only Web APIs, for browsers, Node, Deno, Bun and edge runtimes. | MIT |
| Instead of hand-writing discovery, authorization-code + PKCE and token refresh | `openid-client` | OpenID Certified OAuth 2 / OIDC relying-party client for JavaScript runtimes, built on oauth4webapi. | MIT |
| Instead of hand-writing JWT signing/verification, JWKS fetching and key import with raw crypto APIs | `jose` | Dependency-free JWA, JWS, JWE, JWT and JWK implementation for all Web-interoperable JavaScript runtimes. | MIT |
| Instead of hand-writing OAuth client flows or an OAuth/OIDC provider in a Python web app | `authlib` | Python library for building OAuth 1/2 and OpenID Connect clients and servers, plus JOSE/JWT, with Flask, Django and httpx integrations. | BSD-3-Clause |

## Identity servers (self-hosted)

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building an in-house SSO/OIDC provider | `keycloak` | Self-hosted Java identity and access management server with OIDC, SAML, SSO, user federation and admin console. | Apache-2.0 |
| Instead of hand-writing account recovery, verification and MFA flows | `ory-kratos` | Headless, API-first Go identity server for registration, login, MFA, account recovery and profile management. | Apache-2.0 |
| Instead of implementing an OAuth 2.0 authorization server (token, consent, client registration) yourself | `ory-hydra` | OpenID Certified OAuth 2.0 and OpenID Connect provider in Go that delegates login and consent to your app. | Apache-2.0 |
| Instead of wiring per-app login for self-hosted internal tools | `authentik` | Self-hosted identity provider with SSO via OIDC, SAML, LDAP and proxy outposts plus configurable login flows. | MIT |
| Instead of building multi-tenant B2B identity (orgs, SSO per customer, audit log) from scratch | `zitadel` | Go identity platform with multi-tenancy, OIDC/SAML, passkeys, actions and an event-sourced audit trail. **License review.** | AGPL-3.0-only |
| Instead of building sign-in experience, organizations and RBAC for a SaaS product | `logto` | OIDC-based identity platform for B2C/B2B apps with organizations, RBAC, social sign-in and SDKs for many frameworks. **License review.** | MPL-2.0 |

## Authorization and policy

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing role/permission checks scattered through handlers | `casbin` | Authorization library supporting ACL, RBAC and ABAC models via a policy config, with ports for Go, Node, Python, Java and more. | Apache-2.0 |
| Instead of hand-coding permission logic in each service | `cerbos` | Stateless policy decision point that evaluates YAML resource policies (RBAC/ABAC) via gRPC/HTTP with SDKs for many languages. | Apache-2.0 |
| Instead of hand-writing sharing/permission graphs (owner, editor, viewer, inherited folders) in application tables | `openfga` | CNCF relationship-based (Zanzibar-style) fine-grained authorization server with SDKs for JS, Go, Python, Java and .NET. | Apache-2.0 |
| Instead of hard-coding policy decisions (API authz, Kubernetes admission, config compliance) in each service | `opa` | CNCF general-purpose policy engine using the Rego language for authorization, admission control and compliance checks. | Apache-2.0 |

## Payments

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing HTTP calls, idempotency keys and webhook signature checks against the Stripe API | `stripe-node` | Official typed Node.js client for the Stripe API, including webhook signature verification. | MIT |
| Instead of hand-writing Stripe API requests and webhook signature verification in Django, FastAPI or Flask | `stripe-python` | Official Python client for the Stripe API with typed resources and webhook verification helpers. | MIT |
| Instead of hand-writing Stripe REST calls and webhook verification in Go services | `stripe-go` | Official Go client for the Stripe API with webhook event construction and signature verification. | MIT |
| Instead of building card forms yourself | `stripe-js` | Typed loader for Stripe.js plus React components for Elements and Embedded Checkout. | MIT |
| Instead of hand-writing Paddle API calls and webhook verification | `paddle-node-sdk` | Official server-side SDK for Paddle Billing, a merchant of record that handles subscriptions and global sales tax. | Apache-2.0 |
| Instead of hand-writing REST calls for checkouts, subscriptions and software license keys on Lemon Squeezy | `lemonsqueezy-js` | Official typed JavaScript SDK for the Lemon Squeezy merchant-of-record API (products, checkouts, subscriptions, licenses). | MIT |
| Instead of hand-injecting the PayPal script and managing button lifecycles in a web checkout | `paypal-js` | Official loader and React components for PayPal Checkout buttons, Venmo and card fields. | Apache-2.0 |

## Subscription and usage billing

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing usage aggregation, plan pricing tiers and invoice generation for metered SaaS billing | `lago` | Open-source usage-based metering and billing engine (events, plans, invoices) that works with Stripe or other gateways. **License review.** | AGPL-3.0-only |
| Instead of building subscription lifecycle, proration and invoice runs | `killbill` | Mature Java subscription billing and payments platform with plugins for gateways, tax and invoicing. | Apache-2.0 |

## Commerce platforms

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building cart, checkout, order and inventory modules for a custom storefront | `medusa` | Modular headless commerce platform in TypeScript/Node with carts, orders, payments, fulfillment and an admin dashboard. | MIT core; separate Enterprise terms |
| Instead of building a GraphQL commerce backend (catalog, orders, promotions, channels) from scratch | `vendure` | Headless TypeScript/NestJS commerce framework with a GraphQL API, plugin system and admin UI. **License review.** | GPL-3.0-or-later |
| Instead of hand-writing Storefront API queries, cart state and SEO helpers for a headless Shopify store | `shopify-hydrogen` | React Router-based framework and components for building custom Shopify storefronts on the Storefront API. | MIT |
| Instead of building a Laravel storefront, catalog and order admin from scratch | `bagisto` | Laravel/PHP e-commerce platform with multi-channel, multi-currency and marketplace extensions. | MIT |
| Instead of hand-building order/checkout workflows in a Symfony PHP application | `sylius` | Symfony-based headless e-commerce framework with API Platform, checkout state machines and an admin panel. | MIT |
| Instead of building cart, checkout, tax and promotion logic in a Rails app | `solidus` | Ruby on Rails e-commerce framework (Spree fork) for customizable storefronts, orders and promotions. | BSD-3-Clause |

## Money and decimal math

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of floating-point money math and hand-written allocation/rounding/currency conversion in JS | `dinero-js` | Immutable JavaScript/TypeScript library for creating, calculating and formatting monetary amounts in integer minor units. | MIT |
| Instead of Number arithmetic for prices, tax and totals where 0.1 + 0.2 errors are unacceptable | `big-js` | Small, fast arbitrary-precision decimal arithmetic library for JavaScript. | MIT |
| Instead of floating-point math for financial or scientific calculations that need exact decimal results | `decimal-js` | Arbitrary-precision Decimal type for JavaScript with trigonometric, exponential and configurable rounding functions. | MIT |
| Instead of hand-written money tuples and currency formatting in Python | `py-moneyed` | Python Money and Currency classes built on Decimal with Babel-based locale formatting. | BSD-3-Clause |
| Instead of float64 for money and rates in Go services | `shopspring-decimal` | Arbitrary-precision fixed-point decimal numbers for Go. | MIT |
| Instead of f64 or hand-rolled integer cents for exact decimal money math in Rust | `rust-decimal` | 96-bit decimal number type for Rust suited to financial calculations, with serde and database integrations. | MIT |

## Plain-text ledgers

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing a double-entry ledger format, balance assertions and reports for personal or small-business books | `beancount` | Plain-text double-entry accounting language and Python tools for validating and querying ledgers. **License review.** | GPL-2.0-only |
| Instead of building a custom ledger report tool for plain-text journals (balance sheets, income statements, CSV import rules) | `hledger` | Fast, reliable plain-text double-entry accounting CLI, TUI and web UI written in Haskell. **License review.** | GPL-3.0-or-later |

## Personal finance apps

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building a personal budgeting app | `actual-budget` | Local-first envelope budgeting app with optional self-hosted sync server and bank-sync integrations. | MIT |
| Instead of building a self-hosted personal finance tracker with transaction rules and reports | `firefly-iii` | Self-hosted PHP/Laravel personal finance manager with double-entry bookkeeping, budgets, rules and a REST API. **License review.** | AGPL-3.0-or-later |

## Invoicing

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building invoice generation, client portals and payment-gateway collection for a small business | `invoice-ninja` | Invoicing, quotes, payments, expenses and time-tracking app built on Laravel, self-hostable or hosted. **License review.** | Elastic-2.0 |

## Accounting and ERP apps

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| A self-hosted small-business accounting reference instead of building invoicing and bookkeeping screens | `akaunting` | Laravel-based small-business accounting app with invoicing, bills, banking and an app marketplace. **License review.** | BUSL-1.1 |
| Instead of building accounting, stock and procurement modules | `erpnext` | Full ERP on the Frappe framework: accounting, inventory, manufacturing, HR, CRM and point of sale. **License review.** | GPL-3.0-only |

## Banking and accounting APIs

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing Plaid REST calls and token exchange | `plaid-node` | Official generated Node.js client for the Plaid API (Link tokens, transactions, auth, identity, balances). | MIT |
| Instead of hand-writing Intuit OAuth flows and token refresh before calling QuickBooks Online accounting endpoints | `intuit-oauth` | Official Intuit OAuth 2.0 client for Node.js used to authorize and call QuickBooks Online APIs. | Apache-2.0 |
| Instead of hand-writing Xero OAuth and REST calls to sync invoices, contacts and payments | `xero-node` | Official Node.js SDK for Xero accounting, payroll, assets and files APIs with OAuth 2.0 helpers. | MIT |

## Email

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing SMTP or REST email sending, batch sends and idempotency for transactional mail | `resend-node` | Official Node.js client for the Resend transactional email API, with React Email support. | MIT |
| Instead of hand-writing table-based HTML email markup and inline styles for transactional templates | `react-email` | React components and a preview server for building responsive, client-compatible HTML emails. | MIT |
| Instead of hand-coding nested tables and conditional comments for responsive email templates in any backend | `mjml` | Markup language and compiler that turns semantic tags into responsive, Outlook-compatible HTML email. | MIT |
| Instead of hand-writing SMTP sessions, MIME encoding and DKIM signing in Node.js | `nodemailer` | Zero-dependency Node.js module for sending email over SMTP, SES and other transports with attachments and DKIM. | MIT-0 |
| Instead of building subscriber lists, campaign sending and unsubscribe handling for newsletters | `listmonk` | Self-hosted Go newsletter and mailing-list manager with a single binary, PostgreSQL and an API. **License review.** | AGPL-3.0-only |
| Instead of running raw Postfix plus custom tracking | `postal` | Self-hosted mail delivery platform for sending and receiving transactional email with webhooks and tracking. | MIT |

## Notifications and push

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building notification routing, batching, user preferences and in-app feeds across email, SMS, push and chat | `knock-node` | Official Node.js client for Knock, a hosted service for cross-channel notification workflows, preferences and in-app feeds. | Apache-2.0 |
| Instead of hand-implementing VAPID JWTs and aes128gcm payload encryption for browser push notifications | `web-push` | Node.js library for sending Web Push Protocol messages with VAPID and payload encryption. | MPL-2.0 |
| Instead of building a push channel for ops alerts or personal notifications to phones and desktops | `ntfy` | Simple HTTP pub-sub push notification service with phone apps; send alerts with a single POST. | Apache-2.0 |

## Feature flags and experimentation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of coupling code to one flag vendor's SDK | `openfeature-js-sdk` | CNCF vendor-neutral feature-flag evaluation API for JavaScript with providers for most flag backends. | Apache-2.0 |
| Instead of binding Python code to a single flag vendor's client | `openfeature-python-sdk` | Vendor-neutral OpenFeature evaluation API for Python services. | Apache-2.0 |
| Instead of binding Go services to a single flag vendor's client | `openfeature-go-sdk` | Vendor-neutral OpenFeature evaluation API for Go services. | Apache-2.0 |
| Instead of building a flag table, targeting rules and percentage rollouts in your own database | `unleash` | Self-hostable feature-flag server with gradual rollouts, strategies, variants and SDKs for many languages. | Apache-2.0 |
| Instead of building remote config and per-segment flag targeting yourself | `flagsmith` | Open-source feature-flag and remote-config service with segments, A/B variants and self-hosting. | BSD-3-Clause |
| Instead of hand-rolling experiment assignment and significance calculations on top of your data warehouse | `growthbook` | Feature flags plus warehouse-native A/B testing with Bayesian and frequentist statistics. | MIT |

## Product analytics

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of wiring separate analytics, flag and experiment tools | `posthog` | Product analytics, session replay, feature flags, experiments and surveys in one platform, hosted or self-hosted. | MIT |

## CMS

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building admin CRUD screens, access control and content APIs inside a Next.js project | `payload` | TypeScript headless CMS and app framework that installs into a Next.js app with auth, access control and admin UI. | MIT |
| Instead of building content models, editorial admin and content APIs from scratch | `strapi` | Node.js headless CMS with a content-type builder, REST/GraphQL APIs, roles and a plugin marketplace. | MIT |
| Instead of hand-building an admin panel and API over an existing SQL schema | `directus` | Data platform that wraps any SQL database with instant REST/GraphQL APIs and a no-code admin app. **License review.** | see record |
| Instead of building structured content editing and a content API | `sanity` | Customizable React content studio backed by the hosted Sanity Content Lake with GROQ queries and real-time collaboration. | MIT |
| Instead of hand-writing GraphQL CRUD, access control and admin screens from a data schema | `keystone` | Schema-driven Node.js CMS and GraphQL API generator with Prisma and an admin UI. | MIT |
| Instead of building a blog, newsletter and paid-membership site from scratch | `ghost` | Node.js publishing platform for blogs and newsletters with memberships, paid subscriptions and a Content API. | MIT |

## Admin frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing list/edit/create pages, auth guards and data fetching for internal admin apps | `refine` | Headless React framework for CRUD-heavy admin panels and internal tools with data-provider adapters. | MIT |
| Instead of hand-building data grids, forms, filters and auth for back-office apps | `react-admin` | React framework for B2B admin apps on REST/GraphQL APIs, built on Material UI. | MIT |

## Internal tools and no-code databases

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-coding dashboards and CRUD back-office tools over existing databases and APIs | `appsmith` | Low-code internal-tool builder with drag-and-drop widgets, database/API connectors and JavaScript. | Apache-2.0 |
| Instead of hand-coding admin dashboards and approval tools for internal teams | `tooljet` | Low-code platform for internal tools and workflows with many datasource connectors. **License review.** | AGPL-3.0-only |
| Instead of building spreadsheet-like data editing and quick APIs over an existing database for non-developers | `nocodb` | Spreadsheet-style UI and REST APIs on top of PostgreSQL, MySQL or SQLite (Airtable alternative). **License review.** | see record |
| Instead of building an Airtable-like collaborative table editor and API for internal data | `baserow` | Open-source no-code database and application builder with a REST API, built on Django and Vue. | MIT |

## Backend as a service

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of assembling auth, REST/GraphQL APIs, file storage and realtime on Postgres yourself | `supabase` | Postgres-based backend platform with auth, instant APIs, realtime, storage, edge functions and vector support. | Apache-2.0 |
| Instead of building auth, document storage, file uploads and serverless functions for web and mobile apps | `appwrite` | Self-hostable backend platform with auth, databases, storage, functions, messaging and realtime. | BSD-3-Clause |
| Instead of building a small app backend (auth, CRUD API, realtime) for prototypes and modest workloads | `pocketbase` | Single-file Go backend with embedded SQLite, auth, realtime subscriptions, file storage and admin UI. | MIT |
| Instead of building auth, realtime document sync and push messaging | `firebase-js-sdk` | Modular web SDK for Firebase Auth, Firestore, Storage, Cloud Messaging, Remote Config and more. | Apache-2.0 |
| Instead of hand-wiring an API layer, cache invalidation and websocket subscriptions for live data in a TypeScript app | `convex` | Reactive backend with TypeScript server functions, a transactional document database and live-updating queries. | Apache-2.0 |

## Realtime and collaboration

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing operational transforms or conflict resolution for collaborative editing and offline sync | `yjs` | High-performance CRDT framework for shared types with bindings for ProseMirror, Tiptap, CodeMirror, Monaco and more. | MIT |
| Instead of designing your own merge logic for local-first documents that sync between peers or servers | `automerge` | JSON-like CRDT library (Rust core with JavaScript bindings) for local-first apps with sync and history. | MIT |
| Instead of hand-writing reconnection, heartbeats, rooms and broadcast fan-out on raw WebSockets | `socket-io` | Bidirectional event-based realtime communication with rooms, reconnection, acknowledgements and fallbacks. | MIT |
| Instead of implementing the WebSocket protocol handshake and framing yourself in Node.js | `ws` | Fast, tested WebSocket client and server implementation for Node.js. | MIT |
| Instead of hand-implementing WebSocket framing and connection handling in Python asyncio services | `python-websockets` | Python library for building WebSocket servers and clients with asyncio, focused on correctness and simplicity. | BSD-3-Clause |
| Instead of building presence, multiplayer cursors, comments and collaborative storage infrastructure yourself | `liveblocks` | Hosted realtime collaboration infrastructure: presence, storage, comments, notifications and Yjs sync with React hooks. | Apache-2.0 |
| Instead of hand-writing Durable Object routing, websocket hibernation and reconnecting clients for multiplayer rooms on Cloudflare | `partyserver` | Cloudflare-maintained libraries for stateful realtime rooms on Durable Objects, successor to the PartyKit platform. | ISC |
| Instead of building your own pub/sub fan-out tier for live updates in any backend language | `centrifugo` | Scalable Go realtime messaging server (WebSocket, SSE, HTTP-streaming) with channels, presence and history. | Apache-2.0 |
| Instead of building chat sync, rooms and E2EE messaging yourself | `matrix-js-sdk` | Client-server SDK for the Matrix open, federated chat protocol, including end-to-end encryption. | Apache-2.0 |
| Instead of hand-writing a Yjs sync server, document persistence and auth hooks for collaborative editors | `hocuspocus` | Plug-and-play Yjs WebSocket backend from the Tiptap team with auth hooks, persistence extensions and scaling. | MIT |

## E-signature

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building PDF field placement, signing flows and audit trails for contracts | `docuseal` | Self-hostable document e-signature platform with a PDF form builder, API and embeddable signing components. **License review.** | AGPL-3.0-only |
| Instead of building a document signing product or embedding signing flows from scratch | `documenso` | Open-source DocuSign alternative built with Next.js, offering signing workflows, templates and an API. **License review.** | AGPL-3.0-only |
| Instead of building multi-party PDF signing and completion certificates yourself | `opensign` | Open-source PDF e-signature app with templates, multi-signer workflows and audit certificates. **License review.** | AGPL-3.0-only |

## Cookie consent and privacy services

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building a consent banner, preference storage and conditional loading of analytics scripts | `cookieconsent` | Lightweight, dependency-free cookie consent banner and preferences modal with category-based script blocking. | MIT |
| A client needs a managed consent platform with legal updates instead of a self-maintained banner | `osano` | Commercial consent-management and privacy platform (cookie consent, DSAR, vendor monitoring). | see record |
| A small site owner wants generated policies and a managed consent banner rather than custom legal text | `termly` | Commercial service for generating privacy policies and terms and running a cookie-consent banner. | see record |

## Medusa source boundary

[Medusa repository terms](https://github.com/medusajs/medusa) distinguish the MIT core from identified Enterprise Edition materials. Review exact package/files and retain notices; do not interpret `SEE LICENSE IN LICENSE` package metadata as permission for every repository feature. The original Genlib storefront integration may use reviewed core interfaces without copying Enterprise source.

## Genlib integration packs

These resource records include sorted `genlib.integrations` bindings and `readiness.level: recipe-available` with the contract as evidence. Read each contract for its supported profile, actual verification and remaining application work. Existing source/license review and module bindings are preserved.

- [Authorization and collaborative state](../../integrations/authorization-collaboration/CONTRACT.md): `openfga`.
- [Medusa core storefront and explicit checkout](../../integrations/commerce-storefront/CONTRACT.md): `medusa`.
- [Invoices, PDF templates, email and spreadsheet exports](../../integrations/document-pipeline/CONTRACT.md): `react-email`.
