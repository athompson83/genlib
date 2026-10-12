import { spawn } from 'node:child_process';
import { isUtf8 } from 'node:buffer';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenlibError, object, readRegular } from './safety.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENTRIES = Object.freeze({ sdk: 'packages/genlib-mcp/server.mjs', discovery: 'bin/genlib-mcp.mjs' });
const PROTOCOL = '2025-06-18';
const LIMITS = Object.freeze({ stdout: 1024 * 1024, line: 256 * 1024, stderr: 64 * 1024, tools: 128, pages: 8 });
const QUERY = 'webhook verification';
const EXPECTED_MATCH = 'module:webhook-verification';

class DoctorError extends GenlibError {
  constructor(code, message, details = {}) {
    super(code, message);
    this.details = details;
  }
  toJSON() { return { code: this.code, error: this.message, details: this.details }; }
}

function requireValue(condition, code, message, details) {
  if (!condition) throw new DoctorError(code, message, details);
}

// Inspect every ancestor: checking only the last component would accept /link/app.
async function realDirectory(value, label) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
    path.isAbsolute(value) && !/[\x00-\x1f\x7f]/.test(value) && !/^[\\/]{2}/.test(value),
  'UNSAFE_PATH', `${label} must be an existing absolute local directory.`);
  const parsed = path.parse(value);
  const segments = value.slice(parsed.root.length).split(process.platform === 'win32' ? /[\\/]/ : '/').filter(Boolean);
  requireValue(segments.every(segment => segment !== '.' && segment !== '..'),
    'UNSAFE_PATH', `${label} cannot contain dot or parent path segments.`);
  let current = parsed.root;
  for (const segment of [null, ...segments]) {
    if (segment !== null) current = path.join(current, segment);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) {
      throw new DoctorError(error.code === 'ENOENT' ? 'TARGET_MISSING' : 'PATH_UNAVAILABLE',
        `${label} must be an existing readable directory.`);
    }
    requireValue(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_PATH',
      `${label} and all its ancestors must be directories without symbolic links.`);
  }
  let canonical;
  try { canonical = await fs.realpath(value); }
  catch { throw new DoctorError('PATH_UNAVAILABLE', `${label} could not be resolved safely.`); }
  const expected = path.resolve(value);
  requireValue(process.platform === 'win32' ? canonical.toLowerCase() === expected.toLowerCase() : canonical === expected,
    'UNSAFE_PATH', `${label} changed while its path was being checked.`);
  return canonical;
}

function childEnvironment() {
  const env = { ...process.env };
  // A doctor checks the fixed entry point, not ambient Node preloads or lookup overrides.
  for (const key of Object.keys(env)) if (['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())) delete env[key];
  return env;
}

function session(entry, args, cwd, mode, timeoutMs) {
  let child;
  try { child = spawn(process.execPath, [entry, ...args], { cwd, env: childEnvironment(), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { throw new DoctorError('MCP_STARTUP_FAILED', 'Could not start the local Genlib MCP process.', { mode }); }
  let stage = 'initialize', sequence = 0, failure, closed = false, initialized = false;
  let stdoutBytes = 0, stderrBytes = 0, buffer = Buffer.alloc(0), stderrTail = '', missingDependency = false;
  let resolveClosed;
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  const pending = new Map();
  const details = () => ({ mode, stage, stdoutBytes, stderrBytes });
  const fail = (code, message, extra = {}) => {
    failure ??= new DoctorError(code, message, { ...details(), ...extra });
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    return failure;
  };
  const timer = setTimeout(() => fail('MCP_TIMEOUT', 'The local Genlib MCP check exceeded its time limit.', { timeoutMs }), timeoutMs);
  child.once('error', () => fail('MCP_STARTUP_FAILED', 'Could not start the local Genlib MCP process.'));
  child.once('close', (exitCode, signal) => {
    closed = true;
    if (pending.size) {
      const dependency = mode === 'sdk' && !initialized && missingDependency;
      fail(dependency ? 'MCP_DEPENDENCIES_MISSING' : initialized ? 'MCP_PROCESS_EXITED' : 'MCP_STARTUP_FAILED',
        dependency ? 'The optional MCP dependencies are unavailable. Install the pinned dependencies in packages/genlib-mcp, then retry. Doctor never installs packages.' :
          'The local Genlib MCP process closed before completing the check. Inspect the trusted checkout locally.', { exitCode, signal });
    }
    resolveClosed();
  });
  child.stdin.on('error', () => fail('MCP_IO_ERROR', 'Could not write to the local Genlib MCP process.'));
  child.stdout.on('error', () => fail('MCP_IO_ERROR', 'Could not read the local Genlib MCP response.'));
  child.stderr.on('error', () => fail('MCP_IO_ERROR', 'Could not read local Genlib MCP diagnostics.'));
  child.stderr.on('data', chunk => {
    stderrBytes += chunk.length;
    if (stderrBytes > LIMITS.stderr) { fail('MCP_OUTPUT_LIMIT', 'The local Genlib MCP diagnostics exceeded the size limit.'); return; }
    // Retain only enough text to recognize Node's dependency error codes; never return it.
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-1024);
    missingDependency ||= /\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)\b/.test(stderrTail);
  });
  const receive = line => {
    if (!line.toString('utf8').trim()) return;
    let response;
    try {
      if (!isUtf8(line)) throw new Error();
      response = JSON.parse(line.toString('utf8'));
    } catch { fail('MCP_PROTOCOL_ERROR', 'The local MCP process returned invalid newline-delimited JSON.'); return; }
    if (!object(response) || response.jsonrpc !== '2.0') { fail('MCP_PROTOCOL_ERROR', 'The local MCP process returned an invalid JSON-RPC response.'); return; }
    if (!Object.hasOwn(response, 'id') && typeof response.method === 'string') return;
    const request = pending.get(response.id);
    if (!request || Object.hasOwn(response, 'method') || Object.hasOwn(response, 'result') === Object.hasOwn(response, 'error')) {
      fail('MCP_PROTOCOL_ERROR', 'The local MCP process returned an unexpected response.'); return;
    }
    if (Object.hasOwn(response, 'error')) {
      fail('MCP_RPC_ERROR', 'The local MCP process rejected a doctor request.',
        Number.isInteger(response.error?.code) ? { rpcCode: response.error.code } : {});
      return;
    }
    pending.delete(response.id);
    request.resolve(response.result);
  };
  child.stdout.on('data', chunk => {
    stdoutBytes += chunk.length;
    if (failure) return;
    if (stdoutBytes > LIMITS.stdout) { fail('MCP_OUTPUT_LIMIT', 'The local Genlib MCP output exceeded the size limit.'); return; }
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(10)) !== -1) {
      if (end > LIMITS.line) { fail('MCP_OUTPUT_LIMIT', 'A local Genlib MCP response exceeded the line size limit.'); return; }
      const line = buffer.subarray(0, end);
      buffer = buffer.subarray(end + 1);
      receive(line);
      if (failure) return;
    }
    if (buffer.length > LIMITS.line) fail('MCP_OUTPUT_LIMIT', 'A local Genlib MCP response exceeded the line size limit.');
  });
  const write = value => {
    if (failure) throw failure;
    if (closed) throw fail('MCP_PROCESS_EXITED', 'The local Genlib MCP process has already closed.');
    try { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n'); }
    catch { throw fail('MCP_IO_ERROR', 'Could not write to the local Genlib MCP process.'); }
  };
  const waitForClose = milliseconds => new Promise(resolve => {
    if (closed) { resolve(true); return; }
    const deadline = setTimeout(() => resolve(false), milliseconds);
    closedPromise.then(() => { clearTimeout(deadline); resolve(true); });
  });
  return {
    request(method, params = {}) {
      stage = method === 'tools/call' ? params.name : method;
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        try { write({ id, method, params }); }
        catch (error) { pending.delete(id); reject(error); }
      });
    },
    initialized() { initialized = true; write({ method: 'notifications/initialized' }); },
    assertHealthy() { if (failure) throw failure; },
    async close() {
      clearTimeout(timer);
      // EOF normally closes stdio servers. Kill a stuck server, then await process closure.
      child.stdin.end();
      if (!(await waitForClose(200))) {
        child.kill('SIGTERM');
        if (!(await waitForClose(300))) {
          child.kill('SIGKILL');
          if (!(await waitForClose(1000))) {
            child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
            throw new DoctorError('MCP_CLEANUP_FAILED', 'Could not confirm closure of the local Genlib MCP process.', { mode });
          }
        }
      }
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    },
  };
}

function payload(result, tool, mode) {
  requireValue(object(result) && result.isError !== true, 'MCP_TOOL_FAILED', `${tool} did not complete successfully. Inspect the trusted checkout locally.`, { mode, tool });
  let value = result.structuredContent;
  if (!object(value)) {
    try { value = JSON.parse(result.content?.find(item => item.type === 'text')?.text); }
    catch { /* Report a redacted protocol error below. */ }
  }
  requireValue(object(value), 'MCP_PROTOCOL_ERROR', `${tool} did not return structured evidence.`, { mode, tool });
  return value;
}

/** Check fixed local Genlib stdio entry points without installing packages or enabling writes. */
export async function doctorHarness({ root = ROOT, target, mode = 'sdk', timeoutMs = 20000 } = {}) {
  requireValue(typeof mode === 'string' && Object.hasOwn(ENTRIES, mode), 'INVALID_OPTION', 'Doctor mode must be sdk or discovery.');
  requireValue(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60000, 'INVALID_OPTION', 'Doctor timeout must be an integer from 1 to 60000 milliseconds.');
  const started = Date.now();
  const checkout = await realDirectory(root, 'Genlib root');
  const projectRoot = target === undefined ? undefined : await realDirectory(target, 'Target');
  try { await readRegular(checkout, ENTRIES[mode], 512 * 1024); }
  catch (error) {
    throw new DoctorError(error.code === 'ENOENT' ? 'MCP_ENTRY_MISSING' : 'UNSAFE_PATH',
      'The selected local Genlib MCP entry point is missing or unsafe.', { mode, entry: ENTRIES[mode] });
  }
  const args = mode === 'sdk' && projectRoot ? ['--project-root', projectRoot] : [];
  const client = session(path.join(checkout, ENTRIES[mode]), args, checkout, mode, timeoutMs);
  let report;
  try {
    const initialized = await client.request('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'genlib-harness-doctor', version: '1.0.0' } });
    requireValue(object(initialized) && initialized.protocolVersion === PROTOCOL && initialized.serverInfo?.name === 'genlib' && object(initialized.capabilities?.tools),
      'MCP_PROTOCOL_ERROR', 'The local process did not negotiate the expected Genlib MCP tool protocol.', { mode });
    client.initialized();
    const names = new Set(), cursors = new Set();
    let cursor;
    do {
      const listed = await client.request('tools/list', cursor === undefined ? {} : { cursor });
      requireValue(object(listed) && Array.isArray(listed.tools), 'MCP_PROTOCOL_ERROR', 'The local MCP tool list is invalid.', { mode });
      for (const tool of listed.tools) {
        requireValue(object(tool) && typeof tool.name === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(tool.name) && !names.has(tool.name) && tool.inputSchema?.type === 'object',
          'MCP_PROTOCOL_ERROR', 'The local MCP tool list contains an invalid or duplicate tool.', { mode });
        names.add(tool.name);
        requireValue(tool.name !== 'genlib_install', 'MCP_WRITE_ENABLED', 'Doctor requires the read-only server; genlib_install must not be exposed.', { mode });
        requireValue(names.size <= LIMITS.tools, 'MCP_OUTPUT_LIMIT', 'The local MCP tool list exceeded the doctor limit.', { mode });
      }
      cursor = listed.nextCursor;
      if (cursor !== undefined) {
        requireValue(typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 1024 && !cursors.has(cursor) && cursors.size < LIMITS.pages - 1,
          'MCP_PROTOCOL_ERROR', 'The local MCP tool list did not finish within the pagination limit.', { mode });
        cursors.add(cursor);
      }
    } while (cursor !== undefined);
    for (const name of ['genlib_quick', 'genlib_catalog', ...(mode === 'sdk' && projectRoot ? ['genlib_detect_project'] : [])]) {
      requireValue(names.has(name), 'MCP_TOOLS_MISSING', `The local MCP server does not expose ${name}. Update the trusted checkout.`, { mode });
    }
    const call = async (name, arguments_ = {}) => payload(await client.request('tools/call', { name, arguments: arguments_ }), name, mode);
    const quick = await call('genlib_quick', { query: QUERY, type: 'module' });
    requireValue(quick.best === EXPECTED_MATCH && Array.isArray(quick.next) && quick.next.length > 0,
      'MCP_EVIDENCE_INVALID', 'The quick lookup did not resolve the expected reusable module with next steps.', { mode });
    const catalog = await call('genlib_catalog');
    requireValue(object(catalog.counts) && Object.entries(catalog.counts).every(([key, count]) => /^[a-z][a-z-]{0,31}$/.test(key) && Number.isSafeInteger(count) && count >= 0) && catalog.counts.module > 0,
      'MCP_EVIDENCE_INVALID', 'The catalog did not return valid nonempty source counts.', { mode });
    if (mode === 'sdk') requireValue(catalog.access?.installEnabled === false && catalog.access?.projectOperations === Boolean(projectRoot),
      'MCP_ACCESS_MISMATCH', 'The local MCP server did not confirm the requested read-only project scope.', { mode });
    const projectOperations = { supported: mode === 'sdk', configured: mode === 'sdk' && Boolean(projectRoot), status: mode === 'sdk' ? 'not-configured' : 'unsupported' };
    if (mode === 'sdk' && projectRoot) {
      const detected = await call('genlib_detect_project', { project: '.' });
      requireValue(detected.target === projectRoot && ['languages', 'frameworks', 'runtimes', 'evidence'].every(key => Array.isArray(detected[key]) && detected[key].every(value => typeof value === 'string')),
        'MCP_EVIDENCE_INVALID', 'Project detection did not confirm the configured project root.', { mode });
      Object.assign(projectOperations, { status: 'verified', languages: detected.languages.slice(0, 20), frameworks: detected.frameworks.slice(0, 20), manifestCount: detected.evidence.length });
    }
    client.assertHealthy();
    report = {
      schema: 'genlib.harness-doctor/v1', schemaVersion: 1, status: 'verified', mode, transport: 'stdio', protocolVersion: PROTOCOL,
      readOnly: true, toolCount: names.size, toolNames: [...names].sort(),
      sample: { query: QUERY, best: quick.best, nextStepCount: quick.next.length }, counts: catalog.counts, projectOperations,
      limitation: 'Checks the local Genlib MCP process and tool calls; no named harness client UI, remote HTTP connection, or model execution was exercised.',
      ...(mode === 'discovery' ? { projectNote: 'Discovery mode has no scoped project detection tool; its search tools can read local manifests through arbitrary absolute target arguments. A supplied target does not restrict that access. Use sdk mode for a configured project boundary.' } : {}),
    };
  } finally { await client.close(); }
  return { ...report, elapsedMs: Date.now() - started };
}
