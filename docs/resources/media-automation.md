# Media, design assets and automation resources

Records for image, video and audio processing, 3D and creative coding, design tools and assets, browser/computer automation and workflow automation (catalog: `resources/catalog/media-automation.json`). Choose a maintained library for automated pipelines (sharp/libvips, FFmpeg/PyAV, faster-whisper) and treat desktop applications (GIMP, Blender, Kdenlive, Audacity) as manual tools or headless CLIs, not code dependencies. Check the `integrationMode`: `license-review` means source-available, AGPL/SSPL or custom terms (Remotion, n8n, Browserless, Skyvern, Firecrawl, Windmill, unDraw, nut.js) that need review before commercial or hosted use, and `service` means a paid or proprietary API. Codecs, AI models, voice models, icon sets and fonts often carry licenses separate from the code. For scraping and automation, respect site terms, robots.txt, rate limits, privacy law and per-asset rights; never bypass access controls.

All records are `verification: "partial"`: identity, links and registry licenses were checked automatically on 2026-10-10 with `scripts/verify-resources.mjs`; the code has not been reviewed or tested in Genlib. Verify versions and licenses again before adopting.

## Images

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Resize, crop, format conversion (JPEG/PNG/WebP/AVIF) and thumbnail pipelines in Node | `sharp` | High-performance Node.js image resizing and conversion built on libvips. | Apache-2.0 |
| Image decoding, resizing, drawing and format conversion in Python | `pillow` | The standard Python imaging library for opening, editing and saving raster images. | MIT-CMU |
| Batch image conversion, montage, annotation and format support scripts | `imagemagick` | Command-line suite and library for converting, compositing and transforming 200+ image formats. | ImageMagick |
| Streaming image pipelines for very large images or high-throughput thumbnailing | `libvips` | Demand-driven, low-memory image processing library with C, Python, Ruby, Go and other bindings. | LGPL-2.1-or-later |
| Simple resize/crop/blit/text operations where native modules (sharp) cannot be installed | `jimp` | Pure-JavaScript image manipulation with no native dependencies. | MIT |
| Edge detection, contour finding, perspective transforms, camera calibration or video… | `opencv` | Computer vision library for image/video analysis, feature detection, calibration and DNN inference. | Apache-2.0 |
| Segmentation, filtering, morphology, registration or feature extraction on NumPy arrays | `scikit-image` | NumPy-based collection of image processing algorithms for scientific Python. | BSD-3-Clause |
| Building your own on-demand image resizing/CDN-origin service | `imgproxy` | Self-hosted, libvips-based server that resizes and converts images on the fly via signed URLs. | MIT |
| An image resizing service when you need smart cropping and a Python stack | `thumbor` | Python image service for on-demand cropping, resizing, filters and smart (face/feature) cropping. | MIT |
| Guessing codec settings: compare quality/size visually, then encode the chosen… | `squoosh` | Browser-based image compression app for comparing codecs (MozJPEG, WebP, AVIF, OxiPNG) side by side. | Apache-2.0 |
| Cleaning exported SVG markup or writing regex-based SVG minifiers | `svgo` | Node.js tool and library that optimizes SVG files by removing redundant markup. | MIT |
| Bitmap tracing to turn logos, scans or masks into scalable vectors | `potrace` | Bitmap-to-vector tracing tool that converts black-and-white images into smooth SVG/EPS/PDF paths. | GPL-2.0-or-later |
| Low-quality image placeholders (LQIP) or base64 thumbnails for lazy-loaded images | `blurhash` | Compact string encoding of a blurred image placeholder with encoders/decoders in many languages. | MIT |
| Image placeholder encodings when you need alpha support and aspect ratio | `thumbhash` | Very compact image placeholder hash that preserves aspect ratio and alpha, with JS, Rust, Swift and Java code. | MIT |
| Metadata parsers or GPS/EXIF stripping for user uploads | `exiftool` | Perl library and CLI for reading, writing and stripping metadata (EXIF, IPTC, XMP, GPS) in images, video and documents. | Artistic-1.0-Perl OR GPL-1.0-or-later |
| Background removal or paying per-image APIs for cutouts | `rembg` | Python CLI/library/HTTP server for local AI background removal using ONNX segmentation models. | MIT |
| Paid editors for manual retouching and layered compositing | `gimp` | Free cross-platform raster image editor with layers, masks, plug-ins and scripting. | GPL-3.0-or-later |
| Painted illustrations, concept art and frame-by-frame animation instead of paid… | `krita` | Free digital painting and illustration application with brush engines, animation and Python scripting. | GPL-3.0-or-later |
| Paid vector editors for SVG illustration, and its CLI for batch SVG-to-PNG/PDF export | `inkscape` | Free vector graphics editor using SVG natively, with a command line for batch export. | GPL-2.0-or-later |
| Paid RAW developers for photo editing | `darktable` | Non-destructive RAW photo developer and photo manager with a darktable-cli for batch export. | GPL-3.0-or-later |
| RAW development with processing profiles ( | `rawtherapee` | Cross-platform RAW image processing application with a CLI for applying processing profiles. | GPL-3.0-or-later |
| An in-browser design editor (drag, resize, rotate, layers, export) | `fabricjs` | Interactive HTML5 canvas object model with selection, transforms, text, SVG import/export and serialization. | MIT |
| Canvas hit detection, layering and drag-and-drop for diagram or image editors | `konva` | 2D canvas framework with shapes, layers, events, drag-and-drop and React/Vue bindings. | MIT |

## Video

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Transcoding, thumbnail extraction, HLS packaging, trimming or audio extraction | `ffmpeg` | The standard CLI and libraries for decoding, encoding, transcoding, muxing, filtering and streaming audio/video. | LGPL-2.1-or-later |
| Uploading media to a server for simple client-side trims, conversions or thumbnails | `ffmpeg-wasm` | FFmpeg compiled to WebAssembly for in-browser video and audio processing. | MIT |
| Shelling out to FFmpeg or hand-writing MP4/WebM muxing for browser-side recording,… | `mediabunny` | TypeScript library for reading, writing and converting media files using WebCodecs, without FFmpeg. | MPL-2.0 |
| Frame-by-frame canvas rendering and FFmpeg stitching for data-driven or templated videos | `remotion` | Framework for creating videos programmatically with React components and rendering them to MP4. **License review.** | LicenseRef-Remotion |
| FFmpeg filter graphs for programmatic edits in Python | `moviepy` | Python library for scripted video editing: cuts, concatenation, titles, compositing and effects. | MIT |
| Parsing FFmpeg CLI output when you need per-frame access to video/audio in Python | `pyav` | Pythonic bindings to FFmpeg libraries for frame-level decoding, encoding and muxing. | BSD-3-Clause |
| Manual timeline editing instead of paid editors | `shotcut` | Free cross-platform video editor built on MLT and FFmpeg. | GPL-3.0-or-later |
| Multi-track editing, titles and proxies instead of paid editors | `kdenlive` | Free multi-track video editor from KDE, built on MLT. | GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL |
| Simple manual edits, or libopenshot when you need a scriptable timeline engine | `openshot` | Beginner-friendly free video editor with a Python-scriptable libopenshot engine. | GPL-3.0-or-later |
| Building screen capture/streaming tooling | `obs-studio` | Free software for screen recording and live streaming with scenes, sources and a WebSocket control API. | GPL-2.0-or-later |
| Custom video controls, captions, adaptive streaming and player accessibility | `videojs` | Widely used open-source HTML5 video player with HLS/DASH support, plugins and skins. | Apache-2.0 |
| HLS playlist parsing and adaptive bitrate switching | `hlsjs` | JavaScript HLS client that plays HTTP Live Streaming in browsers via Media Source Extensions. | Apache-2.0 |
| DASH/HLS playback with Widevine/PlayReady/FairPlay DRM | `shaka-player` | JavaScript player for adaptive DASH and HLS with DRM (EME) and offline storage. | Apache-2.0 |
| Styled, accessible media controls for simple video or audio embeds | `videojs-10` | Video.js 10 player elements and skins for HTML, React, YouTube and Vimeo; replaces Plyr, which is deprecated upstream. | Apache-2.0 |
| Building your own ingest/relay server for cameras, OBS streams or WebRTC playback | `mediamtx` | Ready-to-use real-time media server and proxy for RTSP, RTMP, WebRTC, SRT and HLS. | MIT |

## Audio and speech

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Web Audio scheduling, synthesizers and musical timing in the browser | `tonejs` | Web Audio framework for interactive music: synths, effects, sequencing and transport timing. | MIT |
| Cross-browser sound effects, audio sprites and mobile unlock handling | `howler` | Cross-browser audio playback library with sprites, spatial audio and Web Audio/HTML5 fallback. | MIT |
| Waveform rendering, seeking and region selection for audio editors or podcast players | `wavesurfer` | Audio waveform visualization and playback with regions, timeline and spectrogram plugins. | BSD-3-Clause |
| FFmpeg commands for basic audio edits in Python scripts | `pydub` | Simple Python API for slicing, concatenating, applying gain and exporting audio via FFmpeg. | MIT |
| STFT, MFCC, tempo/beat tracking or audio feature extraction | `librosa` | Python library for music and audio analysis: spectrograms, onset/beat detection, pitch and features. | ISC |
| Or paying for transcription of local audio when an offline model is acceptable | `openai-whisper` | Open-source multilingual speech recognition and translation models with a Python CLI. | MIT |
| Running Python Whisper when you need on-device or embedded transcription | `whisper-cpp` | Dependency-free C/C++ port of Whisper for fast local transcription on CPU, GPU and mobile. | MIT |
| The reference Whisper package for production Python transcription with VAD and word… | `faster-whisper` | Whisper reimplementation on CTranslate2 that is several times faster with lower memory use. | MIT |
| Paid TTS APIs for offline voice prompts and narration | `piper-tts` | Fast local neural text-to-speech that runs on CPU, including Raspberry Pi. | GPL-3.0-or-later |
| Assembling TTS model training/inference code when Piper voices are not enough | `coqui-tts` | Maintained fork of Coqui TTS: deep-learning text-to-speech and voice cloning toolkit. | MPL-2.0 |
| Manual audio recording, cleanup and editing instead of paid editors | `audacity` | Free multi-track audio editor and recorder. | GPL-3.0-only |

## 3D, creative coding and animation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| WebGL shaders, scene graphs, cameras and glTF loading | `threejs` | The most widely used JavaScript 3D library for WebGL/WebGPU scenes, loaders and materials. | MIT |
| Wiring three | `react-three-fiber` | React renderer for three.js that expresses scenes as declarative components. | MIT |
| Orbit controls, glTF loading hooks, HTML overlays and environment lighting in R3F | `drei` | Collection of ready-made helpers for React Three Fiber: controls, loaders, text, environments and staging. | MIT |
| Building a three | `model-viewer` | Web component for displaying interactive glTF/GLB 3D models with AR support. | Apache-2.0 |
| Paid 3D tools for asset creation | `blender` | Free 3D creation suite for modeling, animation, rendering, compositing and video editing, with Python scripting. | GPL-2.0-or-later |
| GlTF parsing, Draco/meshopt compression, texture resizing and model optimization scripts | `gltf-transform` | SDK and CLI for reading, editing, optimizing and compressing glTF 2.0 models. | MIT |
| Canvas drawing loops and input handling for sketches, generative art and teaching | `p5js` | Beginner-friendly creative coding library for drawing, animation and interaction on canvas. | LGPL-2.1 |
| Bezier path math, boolean path operations and hit testing for vector tools | `paperjs` | Vector graphics scripting framework on canvas with paths, boolean operations and SVG import/export. | MIT |
| Sketch-style rendering for diagrams, charts or playful UI | `roughjs` | Small library that draws hand-drawn, sketchy shapes on canvas or SVG. | MIT |
| Coding motion graphics or embedding heavy GIF/video for UI animations | `dotlottie-web` | WebAssembly-based player for Lottie and .lottie animations with React/Vue wrappers. | MIT |

## Design tools and assets

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| A proprietary design tool when you need self-hosting, open file formats or… | `penpot` | Open-source, self-hostable design and prototyping platform using SVG/CSS standards. | MPL-2.0 |
| Scraping or manually exporting Figma assets when syncing design tokens, icons or… | `figma-rest-api` | Official HTTP API for reading Figma files, components, styles, variables, comments and image exports. **Service.** | Custom/proprietary |
| Copying SVG icons from many sets or building icon sprites | `iconify` | Unified framework giving access to 200,000+ open-source icons from 150+ sets with on-demand loading. | MIT |
| Drawing common UI icons when the project already follows Font Awesome conventions | `font-awesome-free` | Free tier of the popular icon toolkit with SVG, web font and framework packages. | CC-BY-4.0 AND OFL-1.1 AND MIT |
| Licensing commercial fonts for most UI and marketing typography | `google-fonts` | Catalog of 1,500+ open-licensed font families with a CSS API and downloadable source files. | OFL-1.1 |
| Hotlinking font CDNs or hand-writing @font-face rules and subsetting | `fontsource` | Self-hostable open-source fonts (including all of Google Fonts) packaged as npm modules. | MIT AND OFL-1.1 |
| Commissioning generic spot illustrations for empty states, onboarding and landing pages | `undraw` | Library of open-use SVG illustrations with a customizable accent color. **License review.** | Custom/proprietary |
| Drawing character illustrations or avatars from scratch for friendly, cartoon-style UI | `open-peeps` | Hand-drawn mix-and-match people illustration library released into the public domain. | CC0-1.0 |

## Browser and computer automation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Edge detection, contour finding, perspective transforms, camera calibration or video… | `opencv` | Computer vision library for image/video analysis, feature detection, calibration and DNN inference. | Apache-2.0 |
| CDP clients for headless screenshots, PDF rendering, form automation or crawling | `puppeteer` | Node.js API to control Chrome/Firefox over CDP/WebDriver BiDi for automation, PDFs and screenshots. | Apache-2.0 |
| WebDriver protocol clients for cross-browser automation in non-JS stacks | `selenium` | W3C WebDriver browser automation with bindings for Java, Python, JavaScript, C#, Ruby and Grid for scale. | Apache-2.0 |
| WebDriver/Appium glue for web plus mobile automation from one JS codebase | `webdriverio` | Node.js automation framework for browsers and native mobile apps (via Appium) over WebDriver/BiDi. | MIT |
| Crawl queues, retry/backoff, session rotation and storage for scrapers | `crawlee` | Node.js and Python crawling library with request queues, retries, proxies and HTTP/browser crawlers. | Apache-2.0 |
| Python crawl loops, deduplication, throttling and export pipelines | `scrapy` | Python framework for fast, structured crawling with spiders, pipelines and auto-throttling. | BSD-3-Clause |
| Regex-based HTML extraction in Python | `beautifulsoup` | Python library for parsing and navigating HTML/XML documents, tolerant of broken markup. | MIT |
| Regex HTML parsing or launching a headless browser for static pages | `cheerio` | Fast jQuery-like HTML/XML parsing and manipulation for Node.js without a browser. | MIT |
| DOM shims for server-side HTML processing or DOM-based tests | `jsdom` | Pure-JavaScript implementation of DOM and HTML standards for Node.js. | MIT |
| Building your own browser pool, queueing and session management service | `browserless` | Headless Chrome/Firefox/WebKit as a Docker service or hosted API for Puppeteer/Playwright clients. **License review.** | SSPL-1.0 |
| LLM-to-DOM action loops for agentic browsing | `browser-use` | Python library that lets LLM agents control a real browser to complete web tasks. | MIT |
| Brittle hand-written selectors when pages change often, keeping deterministic code… | `stagehand` | TypeScript browser automation SDK mixing code with natural-language act/extract/observe steps. | MIT |
| Building vision-based form filling and multi-step browser workflows from scratch | `skyvern` | LLM and computer-vision driven browser workflow automation with an API and UI. **License review.** | AGPL-3.0 |
| Crawl + HTML-to-Markdown cleanup for RAG ingestion | `firecrawl` | Crawling/scraping API that turns websites into clean Markdown or structured data for LLMs. **License review.** | AGPL-3.0 |
| Deployment, storage and scheduling glue when running scrapers on the Apify platform | `apify-sdk` | SDK for building Apify Actors (packaged scrapers/automations) in JavaScript or Python. | Apache-2.0 |
| OS-specific input synthesis for simple desktop automation | `pyautogui` | Cross-platform Python library for controlling mouse and keyboard and taking screenshots. | BSD-3-Clause |
| Native input bindings for desktop automation in Node | `nutjs` | Node.js desktop automation: keyboard, mouse, screen and image-based element search. **License review.** | Apache-2.0 |

## Workflow automation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Integration glue and scheduled sync jobs for internal workflows | `n8n` | Node-based workflow automation platform with 400+ integrations, code nodes and AI agent nodes. **License review.** | LicenseRef-n8n-Sustainable-Use |
| Event-routing glue for IoT, MQTT and simple integration flows | `node-red` | Flow-based low-code programming tool for wiring APIs, devices and services, popular for IoT. | Apache-2.0 |
| Building a Zapier-style trigger/action automation layer for users | `activepieces` | Open-source no-code automation platform (Zapier alternative) with TypeScript "pieces" and MCP support. | MIT |
| Building internal job runners, script UIs and workflow orchestration from scratch | `windmill` | Developer platform that turns Python/TypeScript/Go/Bash scripts into workflows, UIs and scheduled jobs. **License review.** | AGPL-3.0 |
| Personal monitoring, scraping and notification bots | `huginn` | Self-hosted Ruby agents that watch the web, collect events and take automated actions. | MIT |
| Job queues, retries and long-running task orchestration in TypeScript apps | `trigger-dev` | TypeScript background jobs and long-running workflows with retries, queues and observability. | Apache-2.0 AND MIT |
