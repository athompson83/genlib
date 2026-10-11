# QR code generator · 0.1.0

## What installs

Two original Apache-2.0 files under `qr-code/`, with no runtime dependencies:

- `encode.ts`: `encodeQr`, `QrError` and the `QrCode`/`QrOptions` types. It also exports the building blocks the tests check: `reedSolomon`, `formatBits`, `versionBits`, `blockStructure`, `alignmentPositions`, `countIndicatorBits`, `maskApplies` and `penaltyScore`.
- `render.ts`: `toSvg`, `toTerminal` and `toMatrixString`.

Both files are pure functions. They need only `TextEncoder`, so they run in browsers, Node.js 22+, Bun, Deno and Workers. Nothing runs at import time.

## When to use it

Use it to show a link, a 2FA enrollment URI (`otpauth://…`), Wi-Fi credentials, a ticket code or other short text as a scannable QR Code without adding a package. Do not use it when you need to scan or decode codes, Micro QR, Kanji mode, an embedded logo, or raster images (convert the SVG yourself).

## Integration points

| Point | What the application supplies |
| --- | --- |
| Input | The text (encoded as UTF-8) or bytes. Validate and size-limit user-supplied text before encoding. |
| `ecc` | `L` (7%), `M` (15%, the default), `Q` (25%) or `H` (30%) recovery. Prefer `M` for screens and `Q`/`H` for print that may get damaged. |
| Placement | Insert the SVG string as trusted markup (it is built only from validated values) or use it as an `<img src="data:image/svg+xml,…">`. |
| `title` | A description of what the code does, for screen readers (for example "QR code to add Genlib to your authenticator app"). Also show the same content as text or a link next to the code. |

```ts
import { encodeQr } from "./genlib/qr-code/encode.js";
import { toSvg } from "./genlib/qr-code/render.js";

const qr = encodeQr(otpauthUri, { ecc: "M" });
const svg = toSvg(qr, { scale: 6, title: "QR code to add this account to your authenticator app" });
// Serve the enrollment page with cache-control: no-store; the URI contains the shared secret.
```

## Behavior

- **Modes.** `numeric` (digits), `alphanumeric` (`0-9 A-Z space $ % * + - . / :`) and `byte`. Strings are encoded as UTF-8 in byte mode with no ECI header; current phone readers detect UTF-8. `Uint8Array` input always uses byte mode. With `mode: "auto"` (the default), the encoder picks whichever single mode gives the shortest bit stream at each candidate version. It never mixes segments, so text such as `Order 12345678901234` uses byte mode for the whole string. Forcing a mode the text cannot use fails with `invalid-input`.
- **Version.** The smallest version from `minVersion` to `maxVersion` (default 1-40) that holds the data. Character-count indicators use the standard's lengths for versions 1-9, 10-26 and 27-40. Data that does not fit fails with `QrError` code `too-long`. Strings over 7,089 characters and byte arrays over 2,953 bytes fail at once.
- **Error correction.** Reed-Solomon over GF(256) with the 0x11D field polynomial. Block counts and interleaving follow the standard's table for all 40 versions × 4 levels. With `boostEcc: true`, the level is raised (M→Q→H) as far as the chosen version still holds the data.
- **Bit stream.** Mode indicator, count, data, up to 4 terminator bits, zero bits to the next byte boundary only when needed, then alternating `0xEC`/`0x11` pad codewords.
- **Function patterns.** Finder patterns with separators, timing patterns, alignment patterns by version, the dark module, format information (BCH(15,5), XOR mask `0x5412`, two copies), and version information (BCH(18,6)) for version 7 and above.
- **Masks.** All eight standard mask patterns. `mask` forces one. Otherwise each is scored with the four penalty rules (N1 = 3, N2 = 3, N3 = 40, N4 = 10), and the lowest score wins, with ties going to the lower number. Two points need interpretation, and both follow segno, the test oracle. Scoring happens before format and version information are drawn: the standard masks in 7.8 and adds format information in 7.9, so those areas count as light. For rule 3, the quiet zone counts as light. Occurrences of `1011101` that qualify are counted left to right, and a counted occurrence's modules are not reused. Other encoders that read these points differently may choose another mask. Every mask produces a valid, decodable symbol.
- **Errors.** `QrError` carries `code`: `too-long`, `invalid-input` (unencodable text or a non-string/non-bytes input) or `invalid-option` (bad level, version range, mask, mode or render option).

## Rendering

| Function | Output |
| --- | --- |
| `toSvg(qr, { margin = 4, scale = 1, dark = "#000", light = "#fff", title = "QR code" })` | One `<svg>` with `viewBox="0 0 N N"` (N = size + 2 × margin), `width`/`height` = N × scale, `role="img"`, an escaped `<title>`, a background `<rect>` (omitted when `light` is `none` or `transparent`) and one `<path>` with merged horizontal runs (`M x y h n v1 h-n z`). |
| `toTerminal(qr, { margin = 2, invert = false })` | Lines of `█ ▀ ▄` and spaces, each holding two module rows. `invert: true` draws light modules as blocks for dark-background terminals. |
| `toMatrixString(qr)` | Rows of `1` (dark) and `0` (light) joined by `\n`, with no quiet zone. |

Colors must be `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, or one of a short list of names (`black`, `white`, `transparent`, `none`, `currentColor`, `navy` and similar). Anything else, including `rgb()`, `url()`, CSS variables and quotes, fails with `invalid-option`, so callers cannot inject markup through a color. `margin` must be 0-64 and `scale` 1-100 (integers). Keep `margin` at 4 or more and dark-on-light contrast for reliable scanning.

## Verify

`npm run build && node --test tests/qr-code.test.mjs` covers these cases:

- 41 symbols that must equal `tests/fixtures/qr-code-vectors.json` module for module. They cover all three modes, all four levels, versions 1, 2, 3, 4, 6, 7, 10, 14, 22, 27, 36 and 40, forced masks 0-7, UTF-8 text, emoji, the empty string, and 26 cases where segno chose the mask, including one where overlapping rule-3 patterns decide the choice. Auto mode must pick the same single mode.
- Block structure for all 160 version/level pairs and alignment positions for all 40 versions against segno's tables.
- The Annex I example (`01234567`, 1-M) Reed-Solomon codewords `A5 24 D4 C1 ED 36 C7 87 2C 55`.
- Format information for all 32 level/mask pairs against an independent BCH function in the test and the standard's table; version 7 information `0x07C94` and BCH(18,6) through version 40.
- Too-long, exact-capacity and option/input validation errors.
- SVG dimensions, run coverage, color rejection and title escaping; terminal shape, margin and invert.

**Fixture generation (reproducible).** The fixtures come from [segno](https://github.com/heuer/segno) 1.6.6 (BSD-3-Clause, pure Python), an independent implementation. The generator script and virtual environment are not committed. To regenerate:

1. `python3 -m venv qrvenv && qrvenv/bin/pip install segno==1.6.6`.
2. For each case, call `segno.make(content, error=ecc, version=v_or_None, mode=mode, mask=mask_or_None, micro=False, boost_error=False)`. `content` is the UTF-8 bytes for byte mode and the text otherwise. Record `{id, text, options, expected: {version, ecc, mask, mode, maskChosenBy}, matrix}`, where `matrix` is `qr.matrix` as rows of `0`/`1` strings. `options` holds `{ecc, mode}`, plus `minVersion = maxVersion = v` when the version is fixed and `mask` when it is forced.
3. Also call `segno.make` with `mode=None` (text if ASCII, otherwise bytes) and store `autoModeMatches` when segno picks the same mode and version.
4. Copy `segno.consts.ECC` (as `[num_blocks, num_total, num_data]` groups) and `segno.consts.ALIGNMENT_POS` into `blockStructure` and `alignmentPositions`.
5. **Padding fix.** segno 1.6.6's `encoder.write_padding_bits` appends `8 - length % 8` zero bits. When the bit stream already ends on a byte boundary, that adds a whole `0x00` codeword where ISO/IEC 18004 7.4.10 requires none. This always happens in byte mode when the terminator fits. The generator replaces that function with `(8 - length % 8) % 8` zero bits and records `unpatchedSegnoDiffers` for the 22 affected cases. Nothing else in segno is changed.

The fixture header records `{generator: "segno 1.6.6", license: "BSD-3-Clause", script: "described in CONTRACT.md", patch}`.

## If something fails

- A fixture matrix differs only in the data area → check block interleaving, pad codewords or the placement order. Compare `blockStructure` first.
- Only the mask differs → the penalty rules changed. Run the auto-mask test and compare each rule against the Behavior section.
- `too-long` for text that looks short → non-ASCII or lowercase text uses byte mode at about 8 bits per byte. Raise `maxVersion`, lower `ecc` or shorten the content (for example, use a short link).
- Phones fail to scan → keep a 4-module quiet zone, dark modules on a light background, at least about 2 px per module on screen, and level `Q`/`H` for print.
- `invalid-option` from `toSvg` → pass a hex color. CSS variables are rejected; set `color` on a parent and use `currentColor` instead.

## Limits

No mixed-mode segmentation, Kanji, ECI, Structured Append, Micro QR, rMQR, decoding, raster output or logo overlay. Conformance evidence is matrix equality with segno 1.6.6 (with the documented padding fix) in the committed fixtures. During development, 5,449 random symbols (all modes and levels, versions up to 40) also matched segno exactly, but that check is not part of the test suite. No physical scanner was tested. Treat any QR payload as visible to anyone who can see the screen. Sensitive URIs such as TOTP secrets belong only on authenticated, non-cached pages.
