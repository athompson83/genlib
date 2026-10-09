import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export class GenlibError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GenlibError';
    this.code = code;
  }
}

export function invariant(condition, code, message) {
  if (!condition) throw new GenlibError(code, message);
}

export function relativePath(value, label = 'Path') {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= 240,
    'UNSAFE_PATH', label + ' must be a nonempty relative path.');
  const parts = value.split('/');
  invariant(!path.isAbsolute(value) && !value.includes('\\') &&
    parts.every(part => /^[a-zA-Z0-9_.@-]+$/.test(part) && part !== '.' && part !== '..' &&
      part.toLowerCase() !== '.git' && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) &&
      !/[. ]$/.test(part)),
  'UNSAFE_PATH', label + ' contains an unsafe path segment: ' + value);
  return value;
}

export function outputPath(value) {
  relativePath(value, 'Output directory');
  invariant(!value.split('/').some(part => part.startsWith('.') ||
    ['node_modules', 'vendor'].includes(part.toLowerCase())),
  'UNSAFE_PATH', 'Output must be an ordinary source directory, not a hidden or dependency directory.');
  return value;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function rootDirectory(value) {
  const absolute = path.resolve(value);
  const info = await fs.lstat(absolute).catch(error => {
    if (error.code === 'ENOENT') throw new GenlibError('TARGET_MISSING', 'Directory does not exist: ' + absolute);
    throw error;
  });
  invariant(info.isDirectory() && !info.isSymbolicLink(), 'UNSAFE_PATH', 'Root must be a real directory: ' + absolute);
  return fs.realpath(absolute);
}

export async function checkedPath(root, relative, allowMissing = false) {
  relativePath(relative);
  let current = root;
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) return path.join(root, ...segments);
      throw error;
    }
    invariant(!stat.isSymbolicLink(), 'UNSAFE_PATH', 'Symbolic links are not allowed: ' + relative);
    if (index < segments.length - 1) {
      invariant(stat.isDirectory(), 'PATH_CONFLICT', 'A parent path is not a directory: ' + relative);
    }
  }
  return current;
}

export async function readRegular(root, relative, maxBytes = 1024 * 1024) {
  const file = await checkedPath(root, relative);
  const before = await fs.lstat(file);
  invariant(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= maxBytes,
    'INVALID_FILE', 'File must be regular, not linked, and within the size limit: ' + relative);
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    invariant(stat.isFile() && stat.nlink === 1 && stat.size <= maxBytes, 'INVALID_FILE', 'File must be regular, not hard-linked, and within the size limit: ' + relative);
    const bytes = await handle.readFile();
    invariant(bytes.length <= maxBytes, 'INVALID_FILE', 'File exceeds the size limit: ' + relative);
    return bytes;
  } finally { await handle.close(); }
}

export async function optionalRegular(root, relative, maxBytes = 1024 * 1024) {
  try { return await readRegular(root, relative, maxBytes); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new GenlibError('INVALID_JSON', 'Invalid JSON in ' + label); }
}

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function ensureDirectory(root, relative, created = []) {
  if (!relative) return;
  relativePath(relative);
  let current = '';
  for (const segment of relative.split('/')) {
    current = current ? current + '/' + segment : segment;
    const destination = await checkedPath(root, current, true);
    try {
      await fs.mkdir(destination);
      created.push(destination);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.lstat(destination);
      invariant(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_PATH', 'Unsafe directory: ' + current);
    }
  }
}

export function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + '\n');
}
