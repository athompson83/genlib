# Data, charts, docs and office document resources

This guide indexes the `resources/catalog/data-docs-office.json` shard. Choose by the stack you already run first (Python vs. JavaScript/TypeScript vs. Go/Rust), then by scale and license: prefer permissively licensed packages (MIT, BSD, Apache-2.0) that embed in the app; treat records marked `license-review` (AGPL, GPL, source-available or partly commercial) and `service` (hosted platforms) as needing an explicit license, data-handling and budget decision before adoption. For heavy conversions (Office to PDF, OCR) run the tool as an isolated subprocess or internal service instead of linking it. All records are `verification: partial`: identity, links and registry licenses were checked automatically on 2026-10-10 with `scripts/verify-resources.mjs`; the code has not been reviewed or tested in Genlib, so pin and review the version you adopt.

## Data and analytics

### Dataframes

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing CSV/Excel parsing loops, group-by aggregation and join logic in Python | `pandas` | Python DataFrame library for loading, cleaning, joining and aggregating tabular data. | BSD-3-Clause |
| Instead of hand-writing parallel CSV/Parquet processing or slow row-by-row Python transforms on medium-to-large data | `polars` | Fast multi-threaded DataFrame engine with lazy query optimization, for Python and Rust. | MIT |
| Instead of hand-writing group-by, pivot, join and rollup logic over JavaScript arrays | `arquero` | JavaScript table transformation library with dplyr-style verbs and Arrow support. | BSD-3-Clause |

### SQL engines

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing aggregation code over files or standing up a database server for local analytics | `duckdb` | In-process analytical SQL database that queries CSV, Parquet and JSON files directly. | MIT |
| Instead of regex-editing SQL strings or hand-translating queries between warehouse dialects | `sqlglot` | Pure-Python SQL parser, transpiler and optimizer across 20+ dialects. | MIT |
| Instead of hand-building rollup tables or pre-aggregation jobs for event and log analytics | `clickhouse` | Column-oriented OLAP database for real-time analytics over billions of rows. | Apache-2.0 |

### Data formats

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing binary serialization or Parquet readers to move tables between services, languages or the browser | `apache-arrow` | Columnar in-memory format and libraries (C++, Python, JS, Go, Java) for zero-copy data interchange and Parquet IO. | Apache-2.0 |
| Instead of hand-writing CSV splitting that breaks on quotes, newlines in fields or large files | `papaparse` | Fast in-browser and Node CSV parser with streaming, workers and header detection. | MIT |

### Scientific computing

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing numeric loops, matrix operations or random sampling in Python | `numpy` | N-dimensional arrays and vectorized math, the foundation of the Python scientific stack. | BSD-3-Clause |
| Instead of hand-writing statistical tests, optimizers, integration or interpolation routines | `scipy` | Python algorithms for optimization, statistics, signal processing, interpolation and sparse matrices. | BSD-3-Clause |

### Machine learning

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing model training loops, cross-validation, feature scaling or evaluation metrics | `scikit-learn` | Classical machine learning in Python: classification, regression, clustering, pipelines and model evaluation. | BSD-3-Clause |

### Notebooks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building a custom interactive analysis UI for exploratory work and shareable notebooks | `jupyterlab` | Browser-based notebook IDE for interactive Python, R and Julia analysis. | BSD-3-Clause |
| Instead of hand-wiring notebook cell re-execution or converting notebooks into small data apps | `marimo` | Reactive Python notebook stored as plain .py files that can run as scripts or deploy as apps. | Apache-2.0 |

### Data apps

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building a web frontend, routing and widget state for an internal Python data tool | `streamlit` | Python framework that turns scripts into interactive data apps and dashboards. | Apache-2.0 |
| Instead of hand-writing upload forms, result viewers and a REST wrapper for a model or data function demo | `gradio` | Python library for quick web UIs and APIs around models and data functions. | Apache-2.0 |
| Instead of hand-writing a Flask/React dashboard with chart callbacks for Python analytics | `plotly-dash` | Python framework for analytical web apps built on Plotly charts and React components. | MIT |

### BI dashboards

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building a static reporting site with charts from SQL query results | `evidence` | Code-based BI: build reports from SQL and Markdown into a static site. | MIT |
| Instead of building a custom dashboard and SQL exploration UI for internal analytics | `apache-superset` | Self-hosted BI platform with SQL editor, chart builder and dashboards over many databases. | Apache-2.0 |
| Instead of building an internal question builder and dashboard tool for non-technical users | `metabase` | Self-hosted BI tool for questions, dashboards and embedded analytics without writing SQL. (license review) | AGPL-3.0-only |

### Data pipelines

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-maintaining ordered SQL scripts, ad-hoc data tests and lineage docs for warehouse transforms | `dbt-core` | SQL-first transformation framework with tests, lineage and docs for data warehouses. | Apache-2.0 |

### Data quality

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing null, range, uniqueness and schema checks for pipeline data | `great-expectations` | Python framework for declaring and validating data quality expectations on batches of data. | Apache-2.0 |

### Orchestration

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing cron chains, retry logic and pipeline dependency tracking for batch data jobs | `apache-airflow` | Workflow orchestrator for scheduling and monitoring Python-defined data pipelines (DAGs). | Apache-2.0 |
| Instead of hand-writing pipeline scheduling, asset lineage tracking and backfill logic | `dagster` | Asset-oriented data orchestrator with lineage, typed IO and local development tooling. | Apache-2.0 |
| Instead of hand-writing retries, scheduling, caching and run tracking around Python jobs | `prefect` | Python workflow orchestration that turns functions into observable, retryable flows. | Apache-2.0 |

## Charts and maps

### Charts

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-drawing bar, line, pie and scatter charts on canvas or SVG | `chartjs` | Canvas-based JavaScript charts with common chart types, animation and responsive sizing. | MIT |
| Instead of hand-building complex interactive charts (heatmaps, candlesticks, Sankey, large time series) | `apache-echarts` | Feature-rich charting library with large-data rendering, maps, and interactive dashboards. | Apache-2.0 |
| Instead of hand-writing SVG chart components in a React app | `recharts` | Composable React chart components built on SVG and D3 utilities. | MIT |
| Instead of hand-building React heatmaps, chord, treemap, calendar or Sankey charts | `nivo` | React data-visualization components (SVG, canvas, HTML) built on D3 with theming and motion. | MIT |
| Instead of wiring raw D3 into React when you need custom, bespoke chart designs | `visx` | Low-level React visualization primitives (scales, shapes, axes) from Airbnb. | MIT |
| Instead of hand-writing scale math, axis ticks, force layouts or geographic projections | `d3` | Low-level JavaScript toolkit for data-driven SVG/canvas visualization, scales, layouts and geo projections. | ISC |
| Instead of hand-writing D3 code for exploratory or report charts | `observable-plot` | Concise grammar-of-graphics JavaScript library for exploratory charts on top of D3. | ISC |
| Instead of hand-writing chart rendering when charts are generated as data (e.g | `vega-lite` | Declarative JSON grammar for interactive charts, rendered with Vega in the browser. | BSD-3-Clause |
| Instead of hand-building interactive zoomable charts, 3D plots or financial candlesticks | `plotly` | Interactive scientific and financial charts for JavaScript, Python and R, including 3D and maps. | MIT |
| Instead of hand-generating chart images in Python reports, notebooks or PDFs | `matplotlib` | Python plotting library for publication-quality static charts and image export. | PSF-2.0 (Matplotlib License, Python Software Foundation based) |
| Instead of hand-composing Matplotlib code for distribution, regression and categorical plots | `seaborn` | Statistical plotting on top of Matplotlib with DataFrame-aware APIs. | BSD-3-Clause |
| Instead of hand-writing Vega-Lite JSON or interactive chart code from Python | `altair` | Declarative Python charting that emits Vega-Lite specifications. | BSD-3-Clause |
| Instead of hand-writing JavaScript for interactive charts driven from Python | `bokeh` | Python library for interactive browser charts and server-backed data apps. | BSD-3-Clause |

### Maps

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing map panning, zooming, tile loading and marker layers | `leaflet` | Lightweight JavaScript library for mobile-friendly interactive raster maps. | BSD-2-Clause |
| Instead of hand-building vector map rendering or paying for a proprietary map SDK | `maplibre-gl-js` | Open-source WebGL vector-tile map renderer (community fork of Mapbox GL JS v1). | BSD-3-Clause |
| Instead of hand-writing WebGL layers for millions of points, arcs, hexbins or trips on a map | `deck-gl` | GPU-powered framework for large-scale geospatial and data visualization layers. | MIT |
| Instead of hand-writing WMS/WFS clients, projection transforms or GIS vector editing | `openlayers` | Full-featured web mapping library supporting many projections, OGC services and vector formats. | BSD-2-Clause |

### Geospatial

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing haversine distance, point-in-polygon, buffer or area calculations | `turf` | Modular geospatial analysis for GeoJSON in JavaScript (distance, buffers, intersections). | MIT |

## Documentation and knowledge

### Docs sites

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building a docs site with navigation, versioned docs and search integration | `docusaurus` | React-based static documentation site generator with versioning, i18n and blog. | MIT |
| Instead of hand-building a Markdown docs site with sidebar, search and theming | `vitepress` | Vite and Vue powered static site generator for fast Markdown documentation. | MIT |
| Instead of hand-building an accessible docs site layout, sidebar and search on Astro | `starlight` | Astro-based documentation theme with built-in search, i18n and accessible navigation. | MIT |
| Instead of hand-building a Markdown docs site for Python projects | `mkdocs-material` | Python MkDocs theme turning Markdown into a searchable, polished documentation site. | MIT |
| Instead of hand-writing Python API reference docs or cross-referenced technical manuals | `sphinx` | Documentation generator (reStructuredText/MyST Markdown) with API autodoc, cross-references and PDF output. | BSD-2-Clause |
| Instead of hand-building docs pages, sidebars and search inside a Next.js app | `nextra` | Next.js-based framework for MDX documentation sites and blogs. | MIT |
| Instead of self-hosting a docs site when a managed service with API playground and analytics is acceptable | `mintlify` | Hosted docs platform that builds API and product docs from MDX in your Git repo. (hosted service) | Proprietary service |

### API docs

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-maintaining API reference pages for TypeScript libraries | `typedoc` | Generates API reference documentation from TypeScript source and TSDoc comments. | Apache-2.0 |

### Component docs

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing component catalog pages and prop tables for a design system | `storybook` | UI component workshop with auto-generated component docs, MDX pages and interaction tests. | MIT |

### Diagrams

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-drawing diagrams or writing SVG; diagrams live as text in Markdown | `mermaid` | Text-to-diagram renderer for flowcharts, sequence, ER, state and Gantt diagrams. | MIT |
| Instead of hand-drawing UML sequence, class or component diagrams | `plantuml` | Java tool rendering UML and architecture diagrams from text. (license review) | GPL-3.0-or-later |
| Instead of building a sketching/whiteboard canvas from scratch | `excalidraw` | Embeddable hand-drawn style whiteboard and diagram editor as a React component. | MIT |
| Instead of building an infinite canvas editor; obtain a license before production | `tldraw` | Infinite-canvas whiteboard SDK for React with shapes, tools and multiplayer support. (license review) | LicenseRef-tldraw |

### Docs search

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-building a search index or paying for hosted search on a static docs site | `pagefind` | Static full-text search that indexes a built site and serves results with no backend. | MIT |
| Instead of building docs search when the docs are public and qualify for the program | `algolia-docsearch` | Free hosted search for public technical documentation, with an open-source search UI. (hosted service) | MIT |

### Markdown

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing Markdown-to-HTML conversion with regex | `markdown-it` | Fast CommonMark-compliant Markdown parser with a plugin system. | MIT |
| Instead of hand-writing Markdown transforms, linting or MDAST/HTML conversions | `unified-remark` | AST-based content pipeline: parse, transform and serialize Markdown and HTML with plugins. | MIT |
| Instead of hand-building a Markdown renderer that supports interactive components | `mdx` | Markdown with embedded JSX components, compiled to JavaScript. | MIT |
| Instead of hand-writing code block tokenization and highlighting | `shiki` | Syntax highlighter using TextMate grammars and VS Code themes, rendering at build or server time. | MIT |

### Docs quality

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of manual style-guide review of terminology, tone and wording in documentation | `vale` | Prose linter enforcing editorial style guides (e.g. Microsoft, Google) on docs. | MIT |
| Instead of hand-reviewing heading structure, list style and broken Markdown syntax | `markdownlint` | Markdown style and syntax linter with a CLI (markdownlint-cli2) and editor integrations. | MIT |
| Instead of hand-writing a broken-link crawler for docs in CI | `lychee` | Fast async link checker for Markdown, HTML and websites, written in Rust. | Apache-2.0 OR MIT |

## Office documents

### PDF

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing a PDF viewer or text extraction in JavaScript | `pdfjs` | Mozilla's JavaScript PDF renderer and parser for displaying and extracting text in the browser. | Apache-2.0 |
| Instead of hand-positioning text and tables to generate invoices or reports as PDF | `pdfmake` | Declarative JSON document definitions to PDF in the browser or Node, with tables and styles. | MIT |
| Instead of hand-writing PDF byte streams for simple client-side PDF exports | `jspdf` | Client-side PDF generation API in JavaScript with text, images and vector drawing. | MIT |
| Instead of hand-positioning PDF content when the team already composes UI in React | `react-pdf` | Render PDFs from React components with a flexbox layout engine, in browser or Node. | MIT |
| Instead of hand-writing PDF text extraction, page rendering or redaction when AGPL or a commercial license is acceptable | `pymupdf` | Fast Python bindings for MuPDF: render, extract text/images, annotate and edit PDFs and other documents. (license review) | AGPL-3.0-only OR LicenseRef-Artifex-Commercial |
| Instead of hand-writing PDF merge/split, form filling or metadata edits in Python | `pypdf` | Pure-Python PDF library to split, merge, crop, encrypt and read text and metadata. | BSD-3-Clause |
| Instead of hand-writing coordinate-based table extraction from digital PDFs like statements and invoices | `pdfplumber` | Python tool for layout-aware PDF text, character and table extraction. | MIT |
| Instead of hand-writing PDF drawing code for Python-generated reports, invoices and statements | `reportlab` | Python library for programmatic PDF generation with flowable layouts, tables and charts. | BSD-3-Clause |
| Instead of hand-laying out PDFs when templates are easier to write in HTML/CSS | `weasyprint` | Converts HTML and CSS (including paged media) to PDF in Python without a browser. | BSD-3-Clause |

### Conversion

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-managing headless Chromium/LibreOffice processes for document-to-PDF conversion | `gotenberg` | Docker-based API for converting HTML, Markdown and Office documents to PDF via Chromium and LibreOffice. (hosted service) | MIT |
| Instead of hand-writing format converters between Markdown, Word, HTML and LaTeX | `pandoc` | Universal document converter between Markdown, DOCX, HTML, LaTeX, EPUB, ODT and more. (license review) | GPL-2.0-or-later |
| Instead of writing your own Office-format renderer when you need faithful document-to-PDF conversion | `libreoffice` | Open-source office suite whose headless mode converts DOCX/XLSX/PPTX/ODF to PDF and other formats. (license review) | MPL-2.0 |

### Word

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing OOXML to generate Word reports, letters or contracts | `docx-js` | Declarative TypeScript API to generate .docx Word documents in Node or the browser. | MIT |
| Instead of hand-parsing DOCX XML to import Word content into a CMS or knowledge base | `mammoth` | Converts .docx to clean semantic HTML or Markdown using style mappings (JS and Python). | BSD-2-Clause |
| Instead of hand-editing OOXML to generate or modify Word documents in Python | `python-docx` | Python library to create and edit .docx files: paragraphs, tables, styles and images. | MIT |
| Instead of hand-replacing text in OOXML to produce contracts, letters or invoices from Word templates | `docxtemplater` | Template engine that fills {placeholders}, loops and conditions in DOCX/PPTX/XLSX templates. (license review) | MIT |

### Spreadsheets

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing XLSX XML to export styled spreadsheets with formulas | `exceljs` | Read, write and style .xlsx workbooks in Node and the browser, including streaming writes. | MIT |
| Instead of hand-writing parsers for many spreadsheet formats; install from the official CDN tarball, not npm 'xlsx' | `sheetjs` | Spreadsheet parser and writer supporting XLSX, XLS, CSV, ODS and many legacy formats. (license review) | Apache-2.0 |
| Instead of hand-writing XLSX XML to read or edit existing workbooks in Python | `openpyxl` | Python library to read and write Excel .xlsx files, styles, charts and formulas. | MIT |
| Instead of hand-writing styled Excel exports and native charts from Python | `xlsxwriter` | Python module for writing richly formatted .xlsx files with charts, formulas and conditional formats. | BSD-2-Clause |
| Instead of hand-writing XLSX XML from Rust services or CLIs | `rust-xlsxwriter` | Rust port of XlsxWriter for writing formatted .xlsx files with charts and tables. | MIT OR Apache-2.0 |
| Instead of hand-writing OOXML spreadsheet handling in Go services | `excelize` | Go library to read, write and style XLSX/XLSM files including charts, pivot tables and streaming. | BSD-3-Clause |

### Presentations

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of hand-writing PresentationML to generate editable slide decks from data | `python-pptx` | Python library to create and modify PowerPoint .pptx files: slides, text, tables, charts and images. | MIT |
| Instead of hand-writing PresentationML to export editable decks from a web app or Node | `pptxgenjs` | JavaScript library to generate PowerPoint presentations with native charts, tables and images. | MIT |

### OCR

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Instead of building text recognition for scanned images and documents | `tesseract-ocr` | Open-source OCR engine with LSTM models for 100+ languages; also available in the browser via tesseract.js. | Apache-2.0 |
| Instead of hand-wiring Tesseract, image cleanup and PDF assembly for scanned documents | `ocrmypdf` | Adds a searchable text layer to scanned PDFs using Tesseract, producing PDF/A output. | MPL-2.0 |

## Notes

- SheetJS: do not install the stale npm `xlsx` release; use the version-pinned tarball from the official docs.
- PyMuPDF, Metabase, PlantUML and Pandoc carry copyleft terms; tldraw needs a production license key; docxtemplater has paid modules.
- Material for MkDocs is in maintenance mode; check project status before new adoption.

## Genlib integration packs

These resource records include sorted `genlib.integrations` bindings and `readiness.level: recipe-available` with the contract as evidence. Read each contract for its supported profile, actual verification and remaining application work. Existing source/license review and module bindings are preserved.

- [Invoices, PDF templates, email and spreadsheet exports](../../integrations/document-pipeline/CONTRACT.md): `exceljs`, `gotenberg`, `papaparse`.
