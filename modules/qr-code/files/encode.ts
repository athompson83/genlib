// SPDX-License-Identifier: Apache-2.0
// QR Code model 2 symbol generation (ISO/IEC 18004), versions 1-40, error correction L/M/Q/H.
// Original implementation with no dependencies: one segment in numeric, alphanumeric or byte mode,
// Reed-Solomon over GF(256) (polynomial 0x11D), block interleaving, function patterns,
// BCH-coded format and version information, and mask selection by the four penalty rules.
// Strings are encoded as UTF-8 bytes in byte mode without an ECI header; most readers detect UTF-8.

export type QrEcc = "L" | "M" | "Q" | "H";
export type QrMode = "numeric" | "alphanumeric" | "byte";

export interface QrOptions {
  /** Error correction level. Default "M". */
  readonly ecc?: QrEcc;
  /** Smallest version to use, 1-40. Default 1. */
  readonly minVersion?: number;
  /** Largest version to use, 1-40. Default 40. Data that does not fit fails with `too-long`. */
  readonly maxVersion?: number;
  /** Force one of the eight mask patterns. Default: the pattern with the lowest penalty. */
  readonly mask?: number;
  /** Raise the error correction level as far as the chosen version still holds the data. Default false. */
  readonly boostEcc?: boolean;
  /** Encoding mode. Default "auto": the most compact single mode for the input. */
  readonly mode?: "auto" | QrMode;
}

export interface QrCode {
  readonly version: number;
  readonly ecc: QrEcc;
  readonly mask: number;
  readonly mode: QrMode;
  /** Modules per side: 17 + 4 × version. */
  readonly size: number;
  /** modules[row][column]; true is a dark module. Excludes the quiet zone. */
  readonly modules: boolean[][];
}

export type QrErrorCode = "too-long" | "invalid-input" | "invalid-option";

export class QrError extends Error {
  readonly code: QrErrorCode;
  constructor(code: QrErrorCode, message: string) {
    super(message);
    this.name = "QrError";
    this.code = code;
  }
}

const ECC_ORDER: readonly QrEcc[] = ["L", "M", "Q", "H"];
/** Two-bit format-information indicator for each level (Table 12 of the standard). */
const ECC_FORMAT_BITS: Readonly<Record<QrEcc, number>> = { L: 1, M: 0, Q: 3, H: 2 };

// Error correction codewords per block, indexed [level][version] (index 0 unused).
const ECC_PER_BLOCK: Readonly<Record<QrEcc, readonly number[]>> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
// Number of error correction blocks, indexed [level][version].
const BLOCK_COUNT: Readonly<Record<QrEcc, readonly number[]>> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const MODE_INDICATOR: Readonly<Record<QrMode, number>> = { numeric: 1, alphanumeric: 2, byte: 4 };
const COUNT_BITS: Readonly<Record<QrMode, readonly [number, number, number]>> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
};

/** Character-count indicator length for a mode at a version (versions 1-9, 10-26, 27-40). */
export function countIndicatorBits(mode: QrMode, version: number): number {
  return COUNT_BITS[mode][version <= 9 ? 0 : version <= 26 ? 1 : 2];
}

// ---------------------------------------------------------------- GF(256) and Reed-Solomon

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255]!;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

const generatorCache = new Map<number, Uint8Array>();

/** Generator polynomial (x - α^0)(x - α^1)…(x - α^(degree-1)), highest-order coefficient first, leading 1 omitted. */
function rsGenerator(degree: number): Uint8Array {
  const cached = generatorCache.get(degree);
  if (cached) return cached;
  // poly[0] is the coefficient of x^degree (always 1), poly[degree] is the constant term.
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j += 1) {
      next[j]! ^= poly[j]!;
      next[j + 1]! ^= gfMul(poly[j]!, root);
    }
    poly = next;
  }
  const result = poly.slice(1);
  generatorCache.set(degree, result);
  return result;
}

/** Reed-Solomon error correction codewords for one block: the remainder of data·x^n divided by the generator. */
export function reedSolomon(data: ArrayLike<number>, eccLength: number): Uint8Array {
  if (!Number.isInteger(eccLength) || eccLength < 1 || eccLength > 68) {
    throw new QrError("invalid-option", "eccLength must be an integer from 1 to 68.");
  }
  const generator = rsGenerator(eccLength);
  const remainder = new Uint8Array(eccLength);
  for (let i = 0; i < data.length; i += 1) {
    const factor = (data[i]! & 0xff) ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[eccLength - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < eccLength; j += 1) remainder[j]! ^= gfMul(generator[j]!, factor);
    }
  }
  return remainder;
}

// ---------------------------------------------------------------- BCH format and version information

function bchRemainder(value: number, generator: number, generatorDegree: number): number {
  let rem = value << generatorDegree;
  for (let bit = 31 - Math.clz32(rem); bit >= generatorDegree; bit -= 1) {
    if ((rem >>> bit) & 1) rem ^= generator << (bit - generatorDegree);
  }
  return rem;
}

/** 15-bit format information: (level, mask) with BCH(15,5) check bits, XORed with 0x5412. */
export function formatBits(ecc: QrEcc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  return ((data << 10) | bchRemainder(data, 0x537, 10)) ^ 0x5412;
}

/** 18-bit version information with BCH(18,6) check bits, for versions 7-40. */
export function versionBits(version: number): number {
  return (version << 12) | bchRemainder(version, 0x1f25, 12);
}

// ---------------------------------------------------------------- Symbol layout

/** Center coordinates of alignment patterns along one axis (Annex E). Empty for version 1. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const last = version * 4 + 10;
  // The spacing is even and the same between every pattern except the first gap; version 32 is the
  // one version where the standard's table uses a smaller step than rounding up would give.
  const step = version === 32 ? 26 : Math.ceil((last - 6) / (count - 1) / 2) * 2;
  const positions = [6];
  for (let i = count - 2; i >= 0; i -= 1) positions.push(last - i * step);
  return positions;
}

interface Template {
  /** true marks a function-pattern module (not available for data). */
  readonly reserved: boolean[][];
  /** Data modules in placement order as [row, column]. */
  readonly dataOrder: Int16Array;
}

const templateCache = new Map<number, Template>();

function grid(size: number): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

/** Draws every function pattern except format and version bits into `dark`, marking reserved modules. */
function drawFunctionPatterns(version: number, dark: boolean[][], reserved: boolean[][]): void {
  const size = version * 4 + 17;
  const set = (row: number, col: number, value: boolean) => {
    dark[row]![col] = value;
    reserved[row]![col] = true;
  };
  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns with their separators.
  for (const [cr, cc] of [[3, 3], [3, size - 4], [size - 4, 3]] as const) {
    for (let dr = -4; dr <= 4; dr += 1) {
      for (let dc = -4; dc <= 4; dc += 1) {
        const r = cr + dr, c = cc + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const ring = Math.max(Math.abs(dr), Math.abs(dc));
        set(r, c, ring !== 2 && ring !== 4);
      }
    }
  }
  // Alignment patterns, skipping the three that would overlap finders.
  const align = alignmentPositions(version);
  const lastIndex = align.length - 1;
  for (let i = 0; i < align.length; i += 1) {
    for (let j = 0; j < align.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === lastIndex) || (i === lastIndex && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          set(align[i]! + dr, align[j]! + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
  // Format information areas and the dark module (filled after mask selection).
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      reserved[8]![i] = true;
      reserved[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8]![size - 1 - i] = true;
    reserved[size - 1 - i]![8] = true;
  }
  reserved[size - 8]![8] = true; // the dark module, drawn with the format information
  // Version information areas (filled later).
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      reserved[a]![b] = true;
      reserved[b]![a] = true;
    }
  }
}

function template(version: number): Template {
  const cached = templateCache.get(version);
  if (cached) return cached;
  const size = version * 4 + 17;
  const reserved = grid(size);
  drawFunctionPatterns(version, grid(size), reserved);
  // Two-module-wide columns from the right edge, alternating upward and downward, skipping the timing column.
  const order: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k += 1) {
      const row = upward ? size - 1 - k : k;
      for (const col of [right, right - 1]) {
        if (!reserved[row]![col]) order.push(row, col);
      }
    }
    upward = !upward;
  }
  const result: Template = { reserved, dataOrder: Int16Array.from(order) };
  templateCache.set(version, result);
  return result;
}

/** Codeword capacity and block structure for a version and level. */
export interface BlockStructure {
  readonly totalCodewords: number;
  readonly dataCodewords: number;
  readonly eccPerBlock: number;
  /** Groups of blocks: [count, total codewords per block, data codewords per block]. */
  readonly groups: ReadonlyArray<readonly [number, number, number]>;
}

export function blockStructure(version: number, ecc: QrEcc): BlockStructure {
  checkVersion(version, "version");
  const totalCodewords = Math.floor(template(version).dataOrder.length / 2 / 8);
  const blocks = BLOCK_COUNT[ecc][version]!;
  const eccPerBlock = ECC_PER_BLOCK[ecc][version]!;
  const shortLength = Math.floor(totalCodewords / blocks);
  const longBlocks = totalCodewords % blocks;
  const shortBlocks = blocks - longBlocks;
  const groups: Array<readonly [number, number, number]> = [[shortBlocks, shortLength, shortLength - eccPerBlock]];
  if (longBlocks > 0) groups.push([longBlocks, shortLength + 1, shortLength + 1 - eccPerBlock]);
  return { totalCodewords, dataCodewords: totalCodewords - blocks * eccPerBlock, eccPerBlock, groups };
}

// ---------------------------------------------------------------- Data encoding

class BitBuffer {
  readonly bits: number[] = [];
  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }
}

interface Payload {
  readonly mode: QrMode;
  /** Character count as defined for the mode (bytes for byte mode). */
  readonly count: number;
  readonly write: (buffer: BitBuffer) => void;
  readonly dataBits: number;
}

function numericPayload(text: string): Payload {
  const dataBits = Math.floor(text.length / 3) * 10 + [0, 4, 7][text.length % 3]!;
  return {
    mode: "numeric", count: text.length, dataBits,
    write(buffer) {
      for (let i = 0; i < text.length; i += 3) {
        const chunk = text.slice(i, i + 3);
        buffer.push(Number(chunk), chunk.length * 3 + 1);
      }
    },
  };
}

function alphanumericPayload(text: string): Payload {
  const dataBits = Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
  return {
    mode: "alphanumeric", count: text.length, dataBits,
    write(buffer) {
      let i = 0;
      for (; i + 1 < text.length; i += 2) {
        buffer.push(ALPHANUMERIC.indexOf(text[i]!) * 45 + ALPHANUMERIC.indexOf(text[i + 1]!), 11);
      }
      if (i < text.length) buffer.push(ALPHANUMERIC.indexOf(text[i]!), 6);
    },
  };
}

function bytePayload(bytes: Uint8Array): Payload {
  return {
    mode: "byte", count: bytes.length, dataBits: bytes.length * 8,
    write(buffer) {
      for (const byte of bytes) buffer.push(byte, 8);
    },
  };
}

const NUMERIC_RE = /^[0-9]*$/;
const ALPHANUMERIC_RE = /^[0-9A-Z $%*+\-./:]*$/;

function candidatePayloads(input: string | Uint8Array, mode: "auto" | QrMode): Payload[] {
  if (typeof input !== "string") {
    if (mode !== "auto" && mode !== "byte") {
      throw new QrError("invalid-input", "Binary input can only use byte mode.");
    }
    return [bytePayload(input)];
  }
  const candidates: Payload[] = [];
  if ((mode === "auto" || mode === "numeric") && NUMERIC_RE.test(input)) candidates.push(numericPayload(input));
  if ((mode === "auto" || mode === "alphanumeric") && ALPHANUMERIC_RE.test(input)) candidates.push(alphanumericPayload(input));
  if (mode === "auto" || mode === "byte") candidates.push(bytePayload(new TextEncoder().encode(input)));
  if (candidates.length === 0) {
    throw new QrError("invalid-input", `The text contains characters that ${mode} mode cannot encode.`);
  }
  return candidates;
}

function payloadBits(payload: Payload, version: number): number {
  const countBits = countIndicatorBits(payload.mode, version);
  if (payload.count >= 2 ** countBits) return Infinity;
  return 4 + countBits + payload.dataBits;
}

function dataCodewords(payload: Payload, version: number, capacityBytes: number): Uint8Array {
  const buffer = new BitBuffer();
  buffer.push(MODE_INDICATOR[payload.mode], 4);
  buffer.push(payload.count, countIndicatorBits(payload.mode, version));
  payload.write(buffer);
  const capacityBits = capacityBytes * 8;
  buffer.push(0, Math.min(4, capacityBits - buffer.bits.length));
  buffer.push(0, (8 - (buffer.bits.length % 8)) % 8);
  const out = new Uint8Array(capacityBytes);
  const used = buffer.bits.length / 8;
  for (let i = 0; i < used; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | buffer.bits[i * 8 + b]!;
    out[i] = byte;
  }
  for (let i = used; i < capacityBytes; i += 1) out[i] = (i - used) % 2 === 0 ? 0xec : 0x11;
  return out;
}

function interleave(data: Uint8Array, structure: BlockStructure): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, , dataLength] of structure.groups) {
    for (let i = 0; i < count; i += 1) {
      const block = data.subarray(offset, offset + dataLength);
      offset += dataLength;
      dataBlocks.push(block);
      eccBlocks.push(reedSolomon(block, structure.eccPerBlock));
    }
  }
  const out = new Uint8Array(structure.totalCodewords);
  let k = 0;
  const longest = Math.max(...dataBlocks.map(block => block.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) if (i < block.length) out[k++] = block[i]!;
  }
  for (let i = 0; i < structure.eccPerBlock; i += 1) {
    for (const block of eccBlocks) out[k++] = block[i]!;
  }
  return out;
}

// ---------------------------------------------------------------- Masking and penalties

/** Whether mask pattern `mask` inverts the module at (row, col) (Table 10 of the standard). */
export function maskApplies(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function linePenalty(line: ArrayLike<boolean>): number {
  let score = 0;
  // Rule 1: runs of five or more same-colored modules score 3 + (run - 5).
  let run = 1;
  for (let i = 1; i <= line.length; i += 1) {
    if (i < line.length && line[i] === line[i - 1]) {
      run += 1;
    } else {
      if (run >= 5) score += run - 2;
      run = 1;
    }
  }
  // Rule 3: dark-light-dark×3-light-dark (1:1:3:1:1) with four light modules on either side.
  // Modules outside the symbol count as light (the quiet zone). The standard does not say whether two
  // occurrences may share modules; here they are counted left to right and a counted occurrence's seven
  // modules are not reused (the reading segno, the test oracle, uses).
  const at = (i: number) => i >= 0 && i < line.length && line[i] === true;
  const lightRun = (from: number) => !at(from) && !at(from + 1) && !at(from + 2) && !at(from + 3);
  for (let i = 0; i + 7 <= line.length; i += 1) {
    if (at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6) &&
        (lightRun(i - 4) || lightRun(i + 7))) {
      score += 40;
      i += 6;
    }
  }
  return score;
}

/**
 * Penalty under the standard's four rules (N1=3, N2=3, N3=40, N4=10). encodeQr applies it to the masked
 * symbol before format and version information are drawn, so those areas count as light.
 */
export function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;
  let dark = 0;
  const column = new Array<boolean>(size);
  for (let i = 0; i < size; i += 1) {
    const row = modules[i]!;
    score += linePenalty(row);
    for (let j = 0; j < size; j += 1) column[j] = modules[j]![i]!;
    score += linePenalty(column);
    for (let j = 0; j < size; j += 1) {
      if (row[j]) dark += 1;
      // Rule 2: each 2×2 block of one color scores 3.
      if (i > 0 && j > 0) {
        const v = row[j];
        if (row[j - 1] === v && modules[i - 1]![j] === v && modules[i - 1]![j - 1] === v) score += 3;
      }
    }
  }
  // Rule 4: 10 points per full 5% step that the dark proportion deviates from 50%.
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

// ---------------------------------------------------------------- Symbol assembly

/**
 * Function patterns plus masked data. Format information, version information and the dark module are
 * left light: the standard evaluates masking results (7.8.3) before that information is added (7.9, 7.10).
 */
function maskedSymbol(version: number, mask: number, codewords: Uint8Array): boolean[][] {
  const size = version * 4 + 17;
  const modules = grid(size);
  drawFunctionPatterns(version, modules, grid(size));
  const { dataOrder } = template(version);
  const totalBits = codewords.length * 8;
  for (let k = 0; k < dataOrder.length / 2; k += 1) {
    const row = dataOrder[k * 2]!, col = dataOrder[k * 2 + 1]!;
    // Remainder bits past the last codeword are 0 before masking.
    const bit = k < totalBits ? ((codewords[k >>> 3]! >>> (7 - (k & 7))) & 1) === 1 : false;
    modules[row]![col] = bit !== maskApplies(mask, row, col);
  }
  return modules;
}

/** Draws format information, the dark module and (version 7+) version information. */
function drawInformation(modules: boolean[][], version: number, ecc: QrEcc, mask: number): void {
  const size = modules.length;
  // Format information: bit 14 is the most significant.
  const format = formatBits(ecc, mask);
  const fbit = (i: number) => ((format >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) modules[i]![8] = fbit(i);
  modules[7]![8] = fbit(6);
  modules[8]![8] = fbit(7);
  modules[8]![7] = fbit(8);
  for (let i = 9; i < 15; i += 1) modules[8]![14 - i] = fbit(i);
  for (let i = 0; i < 8; i += 1) modules[8]![size - 1 - i] = fbit(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i]![8] = fbit(i);
  modules[size - 8]![8] = true;
  if (version >= 7) {
    const info = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((info >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      modules[a]![b] = bit;
      modules[b]![a] = bit;
    }
  }
}

function checkVersion(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 40) {
    throw new QrError("invalid-option", `${name} must be an integer from 1 to 40.`);
  }
}

/** Longest input accepted before encoding: the largest capacity of any symbol (7089 digits, 2953 bytes). */
const MAX_TEXT_LENGTH = 7089;
const MAX_BYTES = 2953;

/** Encodes text (as UTF-8) or bytes into a QR Code symbol. Throws QrError. */
export function encodeQr(input: string | Uint8Array, options: QrOptions = {}): QrCode {
  const ecc = options.ecc ?? "M";
  const minVersion = options.minVersion ?? 1;
  const maxVersion = options.maxVersion ?? 40;
  const mode = options.mode ?? "auto";
  if (!ECC_ORDER.includes(ecc)) throw new QrError("invalid-option", "ecc must be L, M, Q or H.");
  checkVersion(minVersion, "minVersion");
  checkVersion(maxVersion, "maxVersion");
  if (minVersion > maxVersion) throw new QrError("invalid-option", "minVersion must not exceed maxVersion.");
  if (options.mask !== undefined && (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 7)) {
    throw new QrError("invalid-option", "mask must be an integer from 0 to 7.");
  }
  if (!["auto", "numeric", "alphanumeric", "byte"].includes(mode)) {
    throw new QrError("invalid-option", "mode must be auto, numeric, alphanumeric or byte.");
  }
  if (typeof input === "string") {
    if (input.length > MAX_TEXT_LENGTH) throw new QrError("too-long", "The text is longer than any QR Code can hold.");
  } else if (input instanceof Uint8Array) {
    if (input.length > MAX_BYTES) throw new QrError("too-long", "The data is longer than any QR Code can hold.");
  } else {
    throw new QrError("invalid-input", "Input must be a string or a Uint8Array.");
  }

  const candidates = candidatePayloads(input, mode);
  let chosen: { version: number; payload: Payload; bits: number } | undefined;
  for (let version = minVersion; version <= maxVersion && !chosen; version += 1) {
    const capacityBits = blockStructure(version, ecc).dataCodewords * 8;
    let best: { payload: Payload; bits: number } | undefined;
    for (const payload of candidates) {
      const bits = payloadBits(payload, version);
      if (bits <= capacityBits && (!best || bits < best.bits)) best = { payload, bits };
    }
    if (best) chosen = { version, ...best };
  }
  if (!chosen) {
    throw new QrError("too-long", `The data does not fit in version ${maxVersion} at error correction level ${ecc}.`);
  }
  const { version, payload, bits } = chosen;
  let level = ecc;
  if (options.boostEcc) {
    for (const higher of ECC_ORDER.slice(ECC_ORDER.indexOf(ecc) + 1)) {
      if (bits <= blockStructure(version, higher).dataCodewords * 8) level = higher;
    }
  }
  const structure = blockStructure(version, level);
  const codewords = interleave(dataCodewords(payload, version, structure.dataCodewords), structure);

  let mask = options.mask;
  let modules: boolean[][] | undefined;
  if (mask === undefined) {
    let bestScore = Infinity;
    for (let candidate = 0; candidate < 8; candidate += 1) {
      const symbol = maskedSymbol(version, candidate, codewords);
      const score = penaltyScore(symbol);
      if (score < bestScore) {
        bestScore = score;
        mask = candidate;
        modules = symbol;
      }
    }
  } else {
    modules = maskedSymbol(version, mask, codewords);
  }
  drawInformation(modules!, version, level, mask!);
  return { version, ecc: level, mask: mask!, mode: payload.mode, size: version * 4 + 17, modules: modules! };
}
