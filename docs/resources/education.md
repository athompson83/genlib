# Educator tools

Tools for teaching and learning: learning management systems (Moodle, Canvas LMS, Open edX with Tutor, Frappe LMS, ClassroomIO, Chamilo, ILIAS and more, tagged with the standards they support: SCORM, LTI, H5P, xAPI), whiteboards (Excalidraw, tldraw, OpenBoard, Xournal++), slide builders (reveal.js, Slidev, Marp, python-pptx, PptxGenJS), writing and citation tools (LanguageTool, Vale, Zotero, Pandoc, Quarto, Typst), assessment and flashcards (H5P, nbgrader, DOMjudge, Anki), classroom and school management (Gibbon, OpenEduCat, BigBlueButton), course authoring and e-learning standards libraries, interactive learning (Jupyter, Kolibri, Oppia, Scratch, MathJax, KaTeX), education platform SDKs and LTI 1.3 libraries, and accessibility tools (Piper, espeak-ng, captioning) in every common language.

Every record was checked on 2026-10-10: `git ls-remote` for repositories, the registry API for packages, and Docker Hub, ghcr.io or quay.io for images; licenses come from registry metadata or the LICENSE file. Records marked `license-review` are copyleft (Moodle and Chamilo are GPL; Canvas, Open edX, Frappe LMS and ClassroomIO are AGPL), need a production license key (tldraw), forbid commercial use (GeoGebra) or have unknown licenses; decide before embedding or hosting them for others. Student data is regulated (FERPA, COPPA, GDPR): self-host behind authentication, minimize what you collect and check each tool's privacy terms. Popularity is the registry's own number or GitHub stars and only comparable within one ecosystem.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find lms scorm self hosted --json
node "$GENLIB_ROOT/tools/resources.mjs" search lti 1.3 --language python --limit 5 --json
node "$GENLIB_ROOT/tools/resources.mjs" inspect moodle --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 114 |
| python | 87 |
| go | 6 |
| rust | 18 |
| java | 18 |
| kotlin | 9 |
| csharp | 15 |
| ruby | 18 |
| php | 37 |
| dart | 15 |
| swift | 13 |
| elixir | 5 |
| any | 25 |

Total: 380 records in `resources/catalog/education*.json`.

## Learning management systems

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `learnhouse` (review), `classroomio` (review), `courselit` (review), `moodle-app`, `open-edx-learning-mfe` (review) | AGPL-3.0, Apache-2.0 |
| python | `tutor` (review), `tutor-mfe` (review), `open-edx` (review), `frappe-lms` (review), `tutor-contrib-aspects` | AGPL-3.0, AGPL-3.0-only, Apache-2.0 |
| java | `sakai` (review), `opencast` (review), `openolat` | Apache-2.0, ECL-2.0 |
| kotlin | `canvas-student-teacher-parent-android-apps` (review), `open-edx-android-app` | Apache-2.0, GPL-3.0 |
| ruby | `pupilfirst-lms`, `just-the-class-course-site-template`, `coursemology` | MIT |
| php | `moodle-php-apache-dev-image` (review), `moodle` (review), `sensei-lms` (review), `ilias` (review), `claroline` (review) | AGPL-3.0, GPL-2.0, GPL-3.0, unknown |
| swift | `canvas-ios-apps` (review), `open-edx-ios-app` | Apache-2.0, unknown |
| elixir | `oli-torus` | MIT |
| any | `moodle-docker` (review) | GPL-3.0 |

## Whiteboards and diagramming

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `perfect-freehand`, `excalidraw-mermaid-to-excalidraw`, `tldraw-sync` (review), `maxgraph-core`, `draw-io-desktop` (review) | Apache-2.0, GPL-3.0, MIT, custom (tldraw license) |
| go | `excalidraw-complete` (review) | AGPL-3.0 |
| rust | `rnote` (review) | GPL-3.0 |
| dart | `saber` (review), `flutter-drawing-board`, `scribble`, `perfect-freehand-pub` | GPL-3.0, MIT |
| swift | `drawsana` | MIT |
| any | `xournal` (review), `lorien`, `openboard` (review), `drawpile` (review) | GPL-2.0, GPL-3.0, MIT |

## Slides and presentations

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `reveal-js`, `marp-team-marp-core`, `pptx-automizer`, `slidev-cli`, `marp-team-marp-cli` | MIT |
| python | `presenton`, `python-rise`, `manim-slides` | Apache-2.0, BSD-3-Clause, MIT |
| go | `slides` | MIT |
| rust | `presenterm` | BSD-2-Clause |
| java | `org-apache-poi-poi-ooxml` | Apache-2.0 |
| csharp | `documentformat-openxml`, `shapecrawler` | MIT |
| php | `phpoffice-phppresentation` | LGPL-3.0-only |
| dart | `flutter-deck` | MIT |
| any | `touying-typst-slides`, `beamer` (review), `polylux-typst-slides` | LPPL-1.3c OR GPL-2.0-or-later (code), MIT |

## Writing, citation and typesetting tools

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `cspell`, `textlint`, `citeproc` (review), `citation-js-core`, `write-good` | CPAL-1.0 OR AGPL-3.0, MIT |
| python | `codespell` (review), `pypandoc`, `bibtexparser`, `pybtex`, `jupyter-book` | BSD-3-Clause, GPL-2.0-only, MIT |
| rust | `mdbook`, `hayagriva`, `typos-cli`, `tectonic`, `harper-core` | Apache-2.0, MIT, MIT OR Apache-2.0, MPL-2.0 |
| java | `languagetool`, `org-languagetool-languagetool-core`, `jabref`, `de-undercouch-citeproc-java`, `org-jbibtex-jbibtex` | Apache-2.0, BSD-3-Clause, LGPL-2.1, MIT |
| kotlin | `ltex-language-server` | MPL-2.0 |
| ruby | `pandoc-ruby`, `bibtex-ruby` (review), `citeproc-ruby` | BSD-2-Clause, GPL-3.0-or-later, MIT |
| php | `phpoffice-phpword`, `pressbooks` (review) | GPL-3.0, LGPL-3.0-only |
| any | `csl-styles` (review), `texstudio` (review) | CC-BY-SA-3.0, GPL-3.0 |

## Assessment, quizzes, auto-grading and flashcards

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `ts-fsrs`, `h5p-standalone`, `lumieducation-h5p-server` (review), `lumieducation-h5p-react` (review), `hydro-oj` (review) | AGPL-3.0, GPL-3.0, GPL-3.0-or-later, MIT |
| python | `genanki`, `python-fsrs`, `gradescope-utils` (review), `otter-grader`, `nbgrader` | BSD-3-Clause, MIT |
| go | `go-judge`, `go-fsrs` | MIT |
| rust | `rust-fsrs`, `anki` (review) | AGPL-3.0-or-later (some portions BSD-3-Clause), BSD-3-Clause |
| java | `artemis` | MIT |
| kotlin | `ankidroid` (review), `ankidroid-backend` (review) | GPL-3.0 |
| csharp | `safe-exam-browser-windows` | MPL-2.0 |
| ruby | `ruby-fsrs`, `autolab` | Apache-2.0, MIT |
| php | `h5p-h5p-core` (review), `h5p-h5p-editor` (review), `qtism-qtism` (review), `domjudge` (review), `submitty` | BSD-3-Clause, GPL-2.0, GPL-2.0-only, GPL-3.0 |
| dart | `dart-fsrs` | MIT |
| swift | `swift-fsrs` | MIT |
| any | `webwork` (review), `safe-exam-browser-macos-ios` (review), `auto-multiple-choice` (review) | GPL-2.0, GPL-2.0-or-later OR Artistic-1.0, MPL-2.0 (proprietary binary modules excluded) |

## Classroom and school management, virtual classrooms

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `jitsi-react-sdk`, `edumeet` | Apache-2.0, MIT |
| python | `openeducat`, `erpnext-education-frappe-education` (review), `epoptes` (review) | GPL-3.0, LGPL-3.0 |
| java | `unitime` | Apache-2.0 |
| ruby | `bigbluebutton-api-ruby`, `greenlight-bigbluebutton-frontend`, `scalelite` (review) | AGPL-3.0, LGPL-3.0, MIT |
| php | `bigbluebutton-bigbluebutton-api-php`, `unifiedtransform` (review), `rosariosis` (review), `gibbon-github` (review), `opensis-classic` (review) | GPL (version per docs/License.txt), GPL-2.0, GPL-3.0, LGPL-3.0-or-later |
| dart | `jitsi-meet-flutter-sdk` | Apache-2.0 |
| swift | `jitsi-meet-ios-sdk-spm` | Apache-2.0 |
| any | `veyon` (review), `koha-ils` (review) | GPL-2.0, GPL-3.0 |

## Course authoring and e-learning standards (SCORM, xAPI, cmi5, LTI)

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `scorm-again`, `xapi-xapi`, `tincanjs`, `xapi-cmi5`, `rusticisoftware-scormcloud-api-v2-client-javascript` (review) | Apache-2.0, MIT |
| python | `rustici-software-cloud-v2` (review), `xblock`, `tincan-pypi`, `openedx-scorm-xblock` (review), `edx-event-routing-backends` (review) | AGPL-3.0, AGPL-3.0-or-later, Apache-2.0 |
| csharp | `tincan` | Apache-2.0 |
| php | `rusticisoftware-tincan`, `xerte-online-toolkits` | Apache-2.0 |
| any | `liascript`, `cmi5-specification-aicc`, `sql-lrs-yet-analytics` | Apache-2.0, BSD-3-Clause |

## Interactive learning, notebooks and math

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `katex`, `temml`, `mathlive`, `mathjax`, `freecodecamp` | Apache-2.0, BSD-3-Clause, MIT |
| python | `ipywidgets`, `latex2mathml`, `jupytext`, `pyodide`, `jupyterhub` | BSD-3-Clause, MIT, MPL-2.0 |
| go | `go-cli` | MIT |
| rust | `katex-crates`, `rustlings` | MIT, MIT OR Apache-2.0 |
| java | `geogebra` (review), `org-scilab-forge-jlatexmath` (review), `bluej-greenfoot` (review) | GPL-2.0, GPL-2.0-or-later WITH Classpath-exception-2.0, custom (GPL-3.0 code with GeoGebra non-commercial license terms) |
| kotlin | `kiwix-android` (review), `oppia-android`, `jetbrains-academy-plugin` | Apache-2.0, GPL-3.0 |
| csharp | `csharpmath`, `wpfmath` | MIT |
| ruby | `katex-gem`, `the-odin-project`, `exercism-website` (review) | AGPL-3.0, MIT |
| dart | `dartpad`, `flutter-tex`, `flutter-math-fork`, `math-keyboard` | Apache-2.0, BSD-3-Clause |
| swift | `kiwix-apple` (review), `swiftmath`, `latexswiftui`, `mathjaxswift` | GPL-3.0, MIT |
| elixir | `livebook-hex`, `elixir-school` | Apache-2.0 |
| any | `stellarium` (review), `internet-in-a-box` (review), `avogadro-2`, `gcompris` (review) | AGPL-3.0, BSD-3-Clause, GPL-2.0 |

## Education platform SDKs and LTI 1.3 libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `googleapis-classroom`, `ltijs`, `instructure-ui`, `kth-canvas-api` | Apache-2.0, MIT |
| python | `pylti1p3`, `edx-opaque-keys` (review), `edx-rest-api-client`, `canvasapi`, `lti-consumer-xblock` (review) | AGPL-3.0, AGPL-3.0-only, Apache-2.0, MIT |
| rust | `google-classroom1` | MIT |
| java | `com-google-apis-google-api-services-classroom`, `edu-ksu-canvas-canvas-api` | Apache-2.0, LGPL-3.0 |
| csharp | `google-apis-classroom-v1`, `ltiadvantage`, `ed-fi-ods-api` | Apache-2.0, MIT |
| ruby | `ims-lti`, `google-apis-classroom-v1-gem` | Apache-2.0, MIT |
| php | `celtic-lti`, `packbackbooks-lti-1p3-tool` | Apache-2.0, LGPL-3.0-or-later |
| elixir | `lti-1p3` | MIT |

## Accessibility, reading and speech

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `mozilla-readability`, `speech-rule-engine`, `sherpa-onnx-node`, `epubjs`, `typescript-say` | Apache-2.0, BSD-2-Clause, MIT |
| python | `wyoming-piper-docker`, `sherpa-onnx`, `python-vosk`, `pyttsx3`, `kokoro` | Apache-2.0, MIT, MPL-2.0 |
| go | `sherpa-onnx-go` | Apache-2.0 |
| rust | `whisper-rs`, `rust-tts`, `mathcat` | MIT, Unlicense |
| java | `com-alphacephei-vosk`, `daisy-pipeline` (review) | Apache-2.0, unknown |
| kotlin | `readium-kotlin-toolkit` | BSD-3-Clause |
| csharp | `system-speech`, `whisper-net`, `smartreader`, `org-k2fsa-sherpa-onnx`, `csharp-vosk` | Apache-2.0, MIT |
| ruby | `ruby-readability`, `espeak-ruby` | Apache-2.0, MIT |
| php | `davechild-textstatistics` | BSD-2-Clause |
| dart | `speech-to-text`, `flutter-tts`, `epub-view`, `sherpa-onnx-pub` | Apache-2.0, BSD-3-Clause, MIT |
| swift | `whisperkit`, `swiftwhisper`, `readium-swift-toolkit`, `spezispeech` | BSD-3-Clause, MIT |
| elixir | `bumblebee` | Apache-2.0 |
| any | `espeak-ng` (review), `rhvoice` (review), `liblouis` | GPL-2.0, GPL-3.0, LGPL-2.1 |

