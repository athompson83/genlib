# Backend and API resources

Records in [resources/catalog/backend-api.json](../../resources/catalog/backend-api.json) cover server frameworks, persistence, queues, API contracts, HTTP clients and search for API backends, SaaS products and web apps. Choose by the project's existing language and runtime first, then by the smallest tool that removes the hand-written work: stay inside one ecosystem (for example FastAPI + SQLAlchemy/SQLModel + Alembic + Celery, or Fastify/Hono + Drizzle/Prisma + BullMQ), prefer PostgreSQL unless a constraint says otherwise, and prefer Valkey (BSD) over Redis when license obligations matter. Records marked `service` are run as separate processes; `license-review` records (Redis, MongoDB) need an explicit license decision before adoption. Auth, payments and email live in the SaaS shard; observability, containers and testing in the DevOps shard; vector databases in the AI shard.

Every record has `verification: "partial"`: on 2026-10-10 the repository, homepage/docs links and npm/PyPI/crates license metadata were checked automatically with `scripts/verify-resources.mjs`. The code was not reviewed, built or tested in Genlib. Pin the reviewed version, keep upstream notices, and test the real integration.

Inspect a record for cautions, packages and install notes: `node tools/resources.mjs inspect <id> --json`.

## Server frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Minimal, widely used HTTP server and middleware framework for Node.js | `express` | Use instead of hand-writing routing, middleware chaining and request/response helpers on raw node:http. | MIT |
| Fast, low-overhead Node.js web framework with JSON-schema validation, serialization and a plugin system | `fastify` | Use instead of hand-writing routing, schema-based request validation and response serialization for a Node.js API. | MIT |
| Small Web-Standards-based router and framework that runs on Node.js, Bun, Deno, Cloudflare Workers and other edge runtimes | `hono` | Use instead of hand-writing a fetch-handler router, middleware and typed RPC client for edge or multi-runtime APIs. | MIT |
| Opinionated TypeScript server framework with modules, dependency injection, guards and pipes on Express or Fastify | `nestjs` | Use instead of hand-building dependency injection, module structure and cross-cutting guards/interceptors for a large TypeScript backend. | MIT |
| Small async-middleware HTTP framework for Node.js from the original Express team | `koa` | Use instead of hand-writing an async middleware pipeline and context object on raw node:http. | MIT |
| Bun-first TypeScript web framework with end-to-end type safety and schema validation | `elysia` | Use instead of hand-writing typed routes, validation and an end-to-end typed client for a Bun API. | MIT |
| Python async web framework that derives validation and OpenAPI docs from type hints via Pydantic | `fastapi` | Use instead of hand-writing request parsing, validation and OpenAPI generation for a Python API. | MIT |
| Batteries-included Python web framework with ORM, migrations, admin, auth and templating | `django` | Use instead of hand-assembling ORM, migrations, admin screens, sessions and CSRF protection for a Python web app. | BSD-3-Clause |
| Toolkit for building REST APIs on Django with serializers, viewsets, auth and a browsable API | `django-rest-framework` | Use instead of hand-writing JSON serialization, permissions, pagination and throttling for Django REST endpoints. | BSD-3-Clause |
| Lightweight Python WSGI micro-framework with routing, request context and extensions | `flask` | Use instead of hand-writing WSGI routing and request handling for a small Python service. | BSD-3-Clause |
| Python ASGI framework with typed handlers, dependency injection, DTOs and OpenAPI generation | `litestar` | Use instead of hand-writing ASGI routing, DTO serialization and OpenAPI docs for a typed Python API. | MIT |
| Popular Go HTTP web framework with a fast router, middleware and JSON binding | `gin` | Use instead of hand-writing routing, parameter binding and middleware on net/http for a Go API. | MIT |
| High-performance, minimalist Go web framework with router, middleware and data binding | `echo` | Use instead of hand-writing routing, binding and centralized error handling on net/http for a Go API. | MIT |
| Express-inspired Go web framework built on fasthttp | `fiber` | Use instead of hand-writing routing and middleware for a Go API when Express-style ergonomics matter. | MIT |
| Lightweight, idiomatic net/http-compatible router for Go | `chi` | Use instead of hand-writing path routing, sub-routers and middleware stacks while staying on standard net/http. | MIT |
| Ergonomic Rust web framework built on Tokio, Hyper and Tower middleware | `axum` | Use instead of hand-writing routing, extractors and middleware on Hyper for a Rust HTTP service. | MIT |
| High-performance Rust web framework with routing, extractors and middleware | `actix-web` | Use instead of hand-writing an HTTP server, routing and request extraction in Rust. | MIT OR Apache-2.0 |
| Convention-over-configuration Java/Kotlin framework for production-ready Spring applications | `spring-boot` | Use instead of hand-wiring an embedded server, configuration, dependency injection and actuator health checks for a JVM service. | Apache-2.0 |
| Kubernetes-native Java framework with fast startup and optional GraalVM native images | `quarkus` | Use instead of hand-tuning a JVM microservice stack for container startup time and memory. | Apache-2.0 |
| Cross-platform .NET framework for web APIs, minimal APIs, MVC and real-time apps | `aspnet-core` | Use instead of hand-writing HTTP hosting, routing, model binding and middleware for a .NET service. | MIT |
| Full-stack Ruby framework with Active Record ORM, migrations, jobs, mailers and conventions | `rails` | Use instead of hand-assembling ORM, migrations, background jobs and conventions for a Ruby web app or API. | MIT |
| Full-featured PHP framework with Eloquent ORM, queues, migrations and routing | `laravel` | Use instead of hand-building routing, ORM, queues and migrations for a PHP web app or API. | MIT |
| Elixir web framework with channels, LiveView and fault-tolerant BEAM runtime | `phoenix` | Use instead of hand-writing routing, WebSocket channels and real-time server rendering for an Elixir app. | MIT |

## ORMs and query builders

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Type-safe TypeScript ORM with a declarative schema, generated client and migrations | `prisma` | Use instead of hand-writing SQL access code, row-to-type mapping and migration files for a TypeScript backend. | Apache-2.0 |
| Lightweight SQL-like TypeScript ORM with schema-as-code and drizzle-kit migrations | `drizzle-orm` | Use instead of hand-writing typed SQL queries and migration diffs in TypeScript, including edge runtimes. | Apache-2.0 |
| Type-safe TypeScript SQL query builder | `kysely` | Use instead of hand-concatenating SQL strings while keeping full control of queries with compile-time column checking. | MIT |
| Decorator-based ORM for TypeScript/JavaScript supporting Data Mapper and Active Record patterns | `typeorm` | Use instead of hand-writing entity mapping, relations and migrations when a decorator/entity-class model fits (common with NestJS). | MIT |
| Mature promise-based Node.js ORM for Postgres, MySQL, MariaDB, SQLite and SQL Server | `sequelize` | Use instead of hand-writing model mapping, associations and transactions in an existing JavaScript backend. | MIT |
| Python SQL toolkit and ORM with Core expression language and unit-of-work sessions | `sqlalchemy` | Use instead of hand-writing SQL composition, connection pooling and object mapping in Python. | MIT |
| Python ORM combining SQLAlchemy and Pydantic models in one class | `sqlmodel` | Use instead of maintaining duplicate Pydantic schemas and SQLAlchemy models in a FastAPI app. | MIT |
| Asyncio Python ORM inspired by the Django ORM | `tortoise-orm` | Use instead of hand-writing async SQL access and model mapping in an asyncio Python service. | Apache-2.0 |
| Full-featured ORM for Go with associations, hooks and auto-migration | `gorm` | Use instead of hand-writing struct scanning, associations and CRUD SQL in Go. | MIT |
| Generates type-safe Go (and other language) code from plain SQL queries and schema | `sqlc` | Use instead of hand-writing row scanning and query wrapper functions for SQL you already write by hand. | MIT |
| Safe, extensible compile-time-checked ORM and query builder for Rust | `diesel` | Use instead of hand-writing SQL strings and row mapping in Rust with compile-time query checking. | MIT OR Apache-2.0 |
| Async dynamic ORM for Rust built on SQLx | `sea-orm` | Use instead of hand-writing async entity mapping and relations in a Rust service. | MIT OR Apache-2.0 |
| Elixir toolkit for data mapping, changesets, queries and migrations | `ecto` | Use instead of hand-writing data validation, query composition and migrations in Elixir. | Apache-2.0 |

## Schema migrations

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Database migration tool for SQLAlchemy with autogenerate support | `alembic` | Use instead of hand-writing and ordering schema change scripts for a SQLAlchemy/SQLModel database. | MIT |
| Database migrations as a Go library and CLI supporting many databases and sources | `golang-migrate` | Use instead of hand-writing migration version tracking and up/down runners in a Go service. | MIT |
| Declarative, schema-as-code database migration tool with diffing, linting and planning | `atlas` | Use instead of hand-diffing schemas and writing migration linting for SQL databases. | Apache-2.0 (review) |
| Versioned SQL migration tool for JVM and CLI use across many databases | `flyway` | Use instead of hand-writing versioned SQL migration runners for JVM services or polyglot teams. | Apache-2.0 |

## Self-hosted databases and caches

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Advanced open-source relational database with JSONB, full-text search and rich extensions | `postgresql` | Use instead of building custom persistence; default relational database for most new backends. | PostgreSQL |
| Embedded, serverless, single-file SQL database engine | `sqlite` | Use instead of hand-rolling file-based storage for local, embedded, test or low-write single-node apps. | Public domain |
| Linux Foundation open-source (BSD) fork of Redis: in-memory key-value store for cache, queues and pub/sub | `valkey` | Use instead of hand-building an in-memory cache, rate-limit store or job broker; BSD-licensed Redis-compatible choice. | BSD-3-Clause |
| In-memory data store for caching, streams, pub/sub, queues and data structures | `redis` | Use instead of hand-building caching, sessions and job brokering when Redis-specific features or managed Redis are required. | AGPL-3.0-only OR RSALv2 OR SSPL-1.0 (review) |
| Document database storing JSON-like BSON documents with flexible schemas | `mongodb` | Use instead of building custom document storage when the data is document-shaped and the SSPL terms are acceptable. | SSPL-1.0 (review) |
| Widely deployed open-source relational database from Oracle | `mysql` | Use instead of custom persistence when the stack, host or existing data requires MySQL. | GPL-2.0-only |

## Database drivers

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| PostgreSQL client for Node.js with pooling, parameterized queries and streaming | `node-postgres` | Use instead of hand-implementing the Postgres wire protocol or connection pooling in Node.js. | MIT |
| Fast PostgreSQL client for Node.js, Deno and Bun with tagged-template queries | `postgres-js` | Use instead of hand-writing safe SQL parameterization and pooling with tagged template literals. | Unlicense |
| PostgreSQL adapter for Python with sync/async APIs, pooling and COPY support | `psycopg` | Use instead of hand-implementing Postgres connectivity, type adaptation and connection pooling in Python. | LGPL-3.0-only |
| Pure-Go PostgreSQL driver and toolkit with pooling and native type support | `pgx` | Use instead of hand-writing Postgres connectivity, pooling and type mapping in Go. | MIT |
| Official, actively maintained Redis client for Node.js, also usable with Valkey for core commands | `node-redis` | Use instead of hand-writing the Redis protocol, reconnection and command typing in Node.js. | MIT |

## Background jobs, queues and workflows

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Redis-backed job and message queue for Node.js with retries, delays, priorities and flows | `bullmq` | Use instead of hand-writing job queues, retry/backoff and scheduled jobs on Redis in Node.js. | MIT |
| Distributed task queue for Python with RabbitMQ/Redis brokers, scheduling and retries | `celery` | Use instead of hand-writing distributed background workers, periodic tasks and retries in Python. | BSD-3-Clause |
| Simple Python library for queueing jobs on Redis and processing them with workers | `rq` | Use instead of hand-writing a small Redis-backed background worker in Python when Celery is too heavy. | BSD-2-Clause |
| Reliable distributed task processing for Python with RabbitMQ or Redis | `dramatiq` | Use instead of hand-writing background task workers with retries and middleware in Python. | LGPL-3.0-or-later |
| Redis-backed background job processing for Ruby | `sidekiq` | Use instead of hand-writing threaded background workers and retries in Ruby/Rails. | LGPL-3.0-only |
| Robust PostgreSQL-backed job processing for Elixir | `oban` | Use instead of hand-writing persistent, transactional job queues in Elixir. | Apache-2.0 |
| Durable execution platform for long-running, fault-tolerant workflows with SDKs in many languages | `temporal` | Use instead of hand-building workflow state machines, durable timers, retries and compensations across services. | MIT |
| TypeScript SDK for event-driven, durable step functions and background jobs | `inngest-sdk` | Use instead of hand-writing event-triggered background functions with steps, retries and schedules in TypeScript. | Apache-2.0 |
| Fast, transactional PostgreSQL-backed job queue for Go | `river` | Use instead of hand-writing a Postgres job table, locking and retries in Go, enqueueing jobs in the same transaction. | MPL-2.0 |
| Redis-backed distributed task queue for Go with retries, scheduling and a web UI | `asynq` | Use instead of hand-writing Redis-backed background workers and retries in Go. | MIT |

## In-process caching

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Fast in-memory LRU cache for JavaScript with TTL and size limits | `lru-cache` | Use instead of hand-writing an in-process LRU map with eviction and TTL in Node.js. | BlueOak-1.0.0 |
| Extensible memoizing collections and decorators for Python (LRU, TTL, LFU) | `cachetools` | Use instead of hand-writing TTL/LRU caches and memoization decorators in Python. | MIT |
| High-performance concurrent in-memory cache for Rust with TTL and size-based eviction | `moka` | Use instead of hand-writing a concurrent cache with eviction policies in Rust. | MIT OR Apache-2.0 |

## OpenAPI tooling

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Generates TypeScript types from OpenAPI 3 schemas, with the companion openapi-fetch client | `openapi-typescript` | Use instead of hand-writing TypeScript types and fetch wrappers for an OpenAPI-described API. | MIT |
| Generates typed API clients, TanStack Query hooks, Zod schemas and mocks from OpenAPI | `orval` | Use instead of hand-writing API client functions, data-fetching hooks and mocks from an OpenAPI spec. | MIT |
| Interactive in-browser documentation and try-it-out console for OpenAPI specs | `swagger-ui` | Use instead of hand-building interactive API reference pages from an OpenAPI document. | Apache-2.0 |
| Generates clean three-panel API reference documentation from OpenAPI | `redoc` | Use instead of hand-writing static API reference docs from an OpenAPI spec. | MIT |

## RPC

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| High-performance RPC framework using Protocol Buffers over HTTP/2 with implementations in many languages | `grpc` | Use instead of hand-designing service-to-service RPC, streaming and code-generated stubs. | Apache-2.0 |
| Protobuf RPC libraries compatible with gRPC and gRPC-Web that also work over plain HTTP/JSON | `connect-rpc` | Use instead of hand-writing typed RPC clients/servers for browsers and services from .proto definitions. | Apache-2.0 |

## GraphQL servers

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Spec-compliant, runtime-agnostic GraphQL server built on Web standards and Envelop plugins | `graphql-yoga` | Use instead of hand-writing GraphQL-over-HTTP handling, subscriptions and plugins across Node, Bun, Deno or Workers. | MIT |
| Popular spec-compliant GraphQL server for Node.js with integrations for common frameworks | `apollo-server` | Use instead of hand-writing GraphQL request execution, error formatting and caching hints in Node.js. | MIT |
| Python GraphQL library using type hints and dataclasses, with Django/FastAPI integrations | `strawberry` | Use instead of hand-writing GraphQL schemas and resolvers by string in Python. | MIT |
| Schema-first GraphQL server code generator for Go | `gqlgen` | Use instead of hand-writing GraphQL resolvers and type plumbing from a schema in Go. | MIT |
| Plugin-based, code-first GraphQL schema builder for TypeScript | `pothos` | Use instead of hand-writing GraphQL SDL and resolver types separately in TypeScript. | ISC |

## Server-side validation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Data validation and settings management for Python using type hints, with a Rust core | `pydantic` | Use instead of hand-writing validation, parsing and serialization of request bodies and config in Python. | MIT |
| ORM/framework-agnostic Python library for (de)serializing and validating complex objects | `marshmallow` | Use instead of hand-writing schema validation and object serialization in Flask or other Python apps. | MIT |
| Decorator-based validation for TypeScript classes, commonly used with NestJS DTOs | `class-validator` | Use instead of hand-writing DTO validation logic in NestJS or decorator-based TypeScript code. | MIT |
| Expressive schema description and data validation for JavaScript | `joi` | Use instead of hand-writing object validation rules for JavaScript request payloads and config. | BSD-3-Clause |

## HTTP clients

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Promise-based HTTP client for browsers and Node.js with interceptors and cancellation | `axios` | Use instead of hand-writing fetch wrappers with interceptors, timeouts and JSON handling. | MIT |
| Tiny fetch-based HTTP client with retries, timeouts and hooks | `ky` | Use instead of hand-writing retry, timeout and error-on-non-2xx logic around fetch. | MIT |
| Better fetch API with smart JSON parsing, retries and interceptors that works in Node, browsers and workers | `ofetch` | Use instead of hand-writing JSON parsing, retry and base-URL handling around fetch across runtimes. | MIT |
| Feature-rich HTTP request library for Node.js with retries, hooks, streams and pagination | `got` | Use instead of hand-writing retries, pagination and streaming downloads on node:http. | MIT |
| Fully featured Python HTTP client with sync and async APIs and HTTP/2 support | `httpx` | Use instead of hand-writing async HTTP calls, connection pooling and timeouts in Python. | BSD-3-Clause |
| Simple, widely used synchronous HTTP library for Python | `requests` | Use instead of hand-writing urllib request code, sessions and auth handling in synchronous Python. | Apache-2.0 |
| Asyncio HTTP client and server framework for Python | `aiohttp` | Use instead of hand-writing asyncio HTTP clients, WebSockets and connection pools in Python. | Apache-2.0 |
| Simple HTTP and REST client library for Go with retries and middleware | `resty` | Use instead of hand-writing request builders, retries and JSON decoding on net/http in Go. | MIT |
| Ergonomic async and blocking HTTP client for Rust | `reqwest` | Use instead of hand-writing HTTP requests, TLS and JSON handling on Hyper in Rust. | MIT OR Apache-2.0 |

## serialization

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Pure JavaScript Protocol Buffers implementation with reflection and static code generation | `protobufjs` | Use instead of hand-writing protobuf encoding/decoding in JavaScript or TypeScript. | BSD-3-Clause |
| Serializes JavaScript values like Date, Map, Set and BigInt over JSON and restores them | `superjson` | Use instead of hand-writing revivers for Dates, Maps, Sets and BigInts sent over JSON (e.g. with tRPC). | MIT |
| Official MessagePack encoder/decoder for JavaScript and TypeScript | `msgpack-javascript` | Use instead of hand-writing a compact binary encoding for messages, caches or WebSocket payloads. | ISC |

## Object storage

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Distributed object/file store with an S3-compatible API for self-hosted blob storage | `seaweedfs` | Use instead of hand-building file upload storage when a self-hosted S3-compatible endpoint is needed (MinIO's open-source repository is no longer maintained). | Apache-2.0 |

## Search engines

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Fast, typo-tolerant search engine with a simple REST API | `meilisearch` | Use instead of hand-writing typo-tolerant search, faceting and ranking over app data. | MIT |
| Open-source, typo-tolerant in-memory search engine with faceting and geo search | `typesense` | Use instead of hand-writing instant search, faceting and typo tolerance over app data. | GPL-3.0-only |
| Apache-2.0 distributed search and analytics engine forked from Elasticsearch | `opensearch` | Use instead of hand-building large-scale full-text search, aggregations and log analytics. | Apache-2.0 |

## Not included

- MinIO: its open-source repository states it is no longer maintained; `seaweedfs` is listed as a self-hosted S3-compatible alternative.
- ioredis: maintained on a best-effort basis upstream; `node-redis` is listed (BullMQ still depends on ioredis).
- tRPC is catalogued in the frontend-web shard (`trpc`).
