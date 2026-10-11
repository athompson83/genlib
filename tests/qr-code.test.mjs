// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  QrError, alignmentPositions, blockStructure, countIndicatorBits, encodeQr, formatBits, penaltyScore,
  reedSolomon, versionBits,
} from "../.build/modules/qr-code/files/encode.js";
import { toMatrixString, toSvg, toTerminal } from "../.build/modules/qr-code/files/render.js";

const vectors = JSON.parse(readFileSync(new URL("./fixtures/qr-code-vectors.json", import.meta.url), "utf8"));

test("fixture header records the independent oracle", () => {
  assert.equal(vectors.generator, "segno 1.6.6");
  assert.equal(vectors.license, "BSD-3-Clause");
  assert.equal(vectors.script, "described in CONTRACT.md");
  assert.ok(vectors.cases.length >= 40);
});

for (const vector of vectors.cases) {
  test(`matrix matches segno byte for byte: ${vector.id}`, () => {
    const qr = encodeQr(vector.text, vector.options);
    assert.equal(qr.version, vector.expected.version);
    assert.equal(qr.ecc, vector.expected.ecc);
    assert.equal(qr.mode, vector.expected.mode);
    assert.equal(qr.mask, vector.expected.mask, vector.expected.maskChosenBy === "segno" ? "auto mask choice" : "forced mask");
    assert.equal(qr.size, vector.matrix.length);
    assert.equal(toMatrixString(qr), vector.matrix.join("\n"));
    if (vector.autoModeMatches) {
      const { mode, ...rest } = vector.options;
      const auto = encodeQr(vector.text, rest);
      assert.equal(auto.mode, mode, "auto mode picks the same single mode");
      assert.equal(toMatrixString(auto), vector.matrix.join("\n"));
    }
  });
}

test("fixtures cover every mode, level, forced mask and the required versions", () => {
  const modes = new Set(vectors.cases.map(v => v.expected.mode));
  const levels = new Set(vectors.cases.map(v => v.expected.ecc));
  const masks = new Set(vectors.cases.filter(v => v.expected.maskChosenBy === "caller").map(v => v.expected.mask));
  const versions = new Set(vectors.cases.map(v => v.expected.version));
  assert.deepEqual([...modes].sort(), ["alphanumeric", "byte", "numeric"]);
  assert.deepEqual([...levels].sort(), ["H", "L", "M", "Q"]);
  assert.deepEqual([...masks].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const v of [1, 2, 6, 7, 10, 14, 22, 27, 40]) assert.ok(versions.has(v), `version ${v}`);
  assert.ok(vectors.cases.filter(v => v.expected.maskChosenBy === "segno").length >= 15);
});

test("block structure for all 40 versions and 4 levels matches segno's tables", () => {
  for (let v = 1; v <= 40; v += 1) {
    for (const ecc of ["L", "M", "Q", "H"]) {
      const mine = blockStructure(v, ecc);
      assert.deepEqual(mine.groups.map(g => [...g]), vectors.blockStructure[String(v)][ecc], `v${v}-${ecc}`);
      const total = mine.groups.reduce((sum, [n, t]) => sum + n * t, 0);
      assert.equal(total, mine.totalCodewords);
    }
  }
});

test("alignment pattern positions for all 40 versions match segno's table", () => {
  for (let v = 1; v <= 40; v += 1) assert.deepEqual(alignmentPositions(v), vectors.alignmentPositions[String(v)], `v${v}`);
});

test("Reed-Solomon codewords for Annex I: 01234567 at 1-M", () => {
  // Data codewords from ISO/IEC 18004 Annex I.2 and the 10 error correction codewords from I.3.
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual([...reedSolomon(data, 10)], [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

// Independent long-division BCH used only by the tests.
function bch(data, poly, dataBits, checkBits) {
  let value = data * 2 ** checkBits;
  for (let bit = dataBits + checkBits - 1; bit >= checkBits; bit -= 1) {
    if (Math.floor(value / 2 ** bit) % 2 === 1) value ^= poly * 2 ** (bit - checkBits);
  }
  return data * 2 ** checkBits + value;
}

test("format information for all 32 level/mask pairs", () => {
  // ISO/IEC 18004 Table C.1 lists these 32 values (level bits L=01, M=00, Q=11, H=10).
  const table = [
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0, 0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
    0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b, 0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed,
  ];
  const levelBits = { M: 0, L: 1, H: 2, Q: 3 };
  for (const [ecc, bits] of Object.entries(levelBits)) {
    for (let mask = 0; mask < 8; mask += 1) {
      const data = (bits << 3) | mask;
      const expected = bch(data, 0b10100110111, 5, 10) ^ 0b101010000010010;
      assert.equal(expected, table[data], `table ${ecc}${mask}`);
      assert.equal(formatBits(ecc, mask), expected, `${ecc}${mask}`);
    }
  }
});

test("version information is 0x07C94 for version 7 and matches BCH(18,6) through 40", () => {
  assert.equal(versionBits(7), 0x07c94);
  assert.equal(versionBits(40), 0x28c69);
  for (let v = 7; v <= 40; v += 1) assert.equal(versionBits(v), bch(v, 0b1111100100101, 6, 12));
});

test("character-count indicator lengths per version range", () => {
  assert.deepEqual([1, 9, 10, 26, 27, 40].map(v => countIndicatorBits("numeric", v)), [10, 10, 12, 12, 14, 14]);
  assert.deepEqual([1, 9, 10, 26, 27, 40].map(v => countIndicatorBits("alphanumeric", v)), [9, 9, 11, 11, 13, 13]);
  assert.deepEqual([1, 9, 10, 26, 27, 40].map(v => countIndicatorBits("byte", v)), [8, 8, 16, 16, 16, 16]);
});

test("too much data fails with too-long", () => {
  const err = code => e => e instanceof QrError && e.code === code;
  assert.throws(() => encodeQr("x".repeat(15), { ecc: "H", maxVersion: 1 }), err("too-long"));
  assert.throws(() => encodeQr("1".repeat(7090), { ecc: "L" }), err("too-long"));
  assert.throws(() => encodeQr(new Uint8Array(2954)), err("too-long"));
  assert.throws(() => encodeQr("a".repeat(2954), { ecc: "L" }), err("too-long"));
  // Exactly at capacity still fits: version 40-L holds 7089 digits and 2953 bytes.
  assert.equal(encodeQr("1".repeat(7089), { ecc: "L", mask: 0 }).version, 40);
  assert.equal(encodeQr(new Uint8Array(2953), { ecc: "L", mask: 0 }).version, 40);
  assert.equal(encodeQr("1".repeat(41), { ecc: "L" }).version, 1);
  assert.equal(encodeQr("1".repeat(42), { ecc: "L" }).version, 2);
});

test("options and inputs are validated", () => {
  const err = code => e => e instanceof QrError && e.code === code;
  assert.throws(() => encodeQr("x", { ecc: "X" }), err("invalid-option"));
  assert.throws(() => encodeQr("x", { minVersion: 0 }), err("invalid-option"));
  assert.throws(() => encodeQr("x", { maxVersion: 41 }), err("invalid-option"));
  assert.throws(() => encodeQr("x", { minVersion: 5, maxVersion: 4 }), err("invalid-option"));
  assert.throws(() => encodeQr("x", { mask: 8 }), err("invalid-option"));
  assert.throws(() => encodeQr("x", { mode: "kanji" }), err("invalid-option"));
  assert.throws(() => encodeQr("12a", { mode: "numeric" }), err("invalid-input"));
  assert.throws(() => encodeQr("abc", { mode: "alphanumeric" }), err("invalid-input"));
  assert.throws(() => encodeQr(new Uint8Array([1]), { mode: "numeric" }), err("invalid-input"));
  assert.throws(() => encodeQr(42), err("invalid-input"));
});

test("minVersion, boostEcc and binary input", () => {
  assert.equal(encodeQr("HI", { minVersion: 5 }).version, 5);
  const boosted = encodeQr("01234567", { ecc: "L", boostEcc: true });
  assert.equal(boosted.version, 1);
  assert.equal(boosted.ecc, "H");
  const bytes = new TextEncoder().encode("Hello, world!");
  const fromBytes = encodeQr(bytes, { ecc: "L" });
  const fixture = vectors.cases.find(v => v.id === "byte-hello-1l");
  assert.equal(toMatrixString(fromBytes), fixture.matrix.join("\n"));
});

// Format information, version information and the dark module are drawn after mask selection.
function withoutInformation(modules, version) {
  const size = modules.length;
  const copy = modules.map(row => [...row]);
  for (let i = 0; i < 9; i += 1) { copy[8][i] = false; copy[i][8] = false; }
  for (let i = 0; i < 8; i += 1) { copy[8][size - 1 - i] = false; copy[size - 1 - i][8] = false; }
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) for (let j = size - 11; j < size - 8; j += 1) { copy[i][j] = false; copy[j][i] = false; }
  }
  return copy;
}

test("auto mask is the lowest-penalty mask, evaluated before format information is drawn", () => {
  for (const [text, options] of [["HELLO WORLD", { ecc: "Q" }], ["01234567", {}], ["version seven carries version information", { ecc: "L", minVersion: 7 }]]) {
    const qr = encodeQr(text, options);
    const scores = [0, 1, 2, 3, 4, 5, 6, 7].map(mask => {
      const forced = encodeQr(text, { ...options, mask });
      return penaltyScore(withoutInformation(forced.modules, forced.version));
    });
    assert.equal(qr.mask, scores.indexOf(Math.min(...scores)), text);
  }
});

test("penalty rules on small hand-made matrices", () => {
  const rows = lines => lines.map(line => [...line].map(ch => ch === "1"));
  // 6x6 all light: rule 1 runs of 6 in 6 rows and 6 columns score 4 each; rule 2 has 25 blocks; 0% dark.
  assert.equal(penaltyScore(rows(Array(6).fill("000000"))), 12 * 4 + 25 * 3 + 100);
  // A finder-like 1011101 row in a 7-wide symbol with light outside counts as rule 3.
  const pattern = rows(["1011101", "0100010", "1011101", "0100010", "1011101", "0100010", "1011101"]);
  const shifted = rows(["0110110", "1001001", "0110110", "1001001", "0110110", "1001001", "0110110"]);
  assert.equal(penaltyScore(pattern), 4 * 40);
  assert.equal(penaltyScore(shifted), 0);
});

test("SVG has one merged path, viewBox and size from margin and scale", () => {
  const qr = encodeQr("01234567");
  const svg = toSvg(qr, { margin: 2, scale: 3 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 25 25" width="75" height="75" role="img"/);
  assert.equal(svg.match(/<path /g).length, 1);
  assert.match(svg, /<title>QR code<\/title>/);
  assert.match(svg, /<rect width="25" height="25" fill="#fff"\/>/);
  // The top row starts with the 7-module finder: one merged run at the margin offset.
  assert.ok(svg.includes('d="M2 2h7v1h-7z'));
  // Every dark module is covered exactly once by the runs.
  const runs = [...svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)];
  const dark = qr.modules.flat().filter(Boolean).length;
  assert.equal(runs.reduce((sum, m) => sum + Number(m[3]), 0), dark);
  const defaults = toSvg(qr);
  assert.match(defaults, /viewBox="0 0 29 29" width="29" height="29"/);
});

test("SVG rejects unsafe colors and escapes the title", () => {
  const qr = encodeQr("x");
  for (const bad of ['red" onload="alert(1)', "url(#x)", "#12", "#gggggg", "javascript:alert(1)", "rgb(0,0,0)", ""]) {
    assert.throws(() => toSvg(qr, { dark: bad }), e => e instanceof QrError && e.code === "invalid-option", bad);
    assert.throws(() => toSvg(qr, { light: bad }), e => e instanceof QrError && e.code === "invalid-option", bad);
  }
  assert.throws(() => toSvg(qr, { margin: -1 }), QrError);
  assert.throws(() => toSvg(qr, { scale: 0.5 }), QrError);
  const svg = toSvg(qr, { dark: "#1A2b3c", light: "transparent", title: `Pay <b>"Bob"</b> & 'Al'` });
  assert.ok(svg.includes("<title>Pay &lt;b&gt;&quot;Bob&quot;&lt;/b&gt; &amp; &#39;Al&#39;</title>"));
  assert.ok(svg.includes('fill="#1A2b3c"'));
  assert.ok(!svg.includes("<rect"));
  assert.ok(toSvg(qr, { dark: "navy", light: "White" }).includes('fill="navy"'));
});

test("terminal output uses half blocks, two rows per line", () => {
  const qr = encodeQr("01234567");
  const text = toTerminal(qr);
  const lines = text.split("\n");
  const dim = qr.size + 4;
  assert.equal(lines.length, Math.ceil(dim / 2));
  for (const line of lines) assert.equal([...line].length, dim);
  assert.match(text, /^[ ▀▄█\n]+$/);
  assert.equal(lines[0], " ".repeat(dim));
  // Line 1 holds image rows 2-3: the finder's solid top edge over its hollow second row.
  assert.equal(lines[1].slice(2, 9), "█" + "▀".repeat(5) + "█");
  const inverted = toTerminal(qr, { invert: true, margin: 0 }).split("\n");
  assert.equal(inverted.length, Math.ceil(qr.size / 2));
  assert.equal(inverted[0].slice(0, 7), " " + "\u2584".repeat(5) + " ");
});
