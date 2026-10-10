// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, createHttpClient, credential, pathSegment, requireRecord, requireString } from './http.js';
import type { TokenProvider, TransportOptions } from './http.js';

export type SteelOperation = 'create' | 'read' | 'release';
export interface SteelBrowserOptions extends TransportOptions {
  /** Defaults to Steel Cloud. A self-hosted service must be behind trusted HTTPS. */
  origin?: string;
  apiKey: TokenProvider;
  /** Recheck the current principal, project, session ownership and budget in a trusted service. */
  authorize: (request: { operation: SteelOperation; sessionId: string | null }, signal: AbortSignal) => boolean | Promise<boolean>;
}

export interface SteelSession {
  readonly id: string;
  readonly status: 'live' | 'released' | 'failed';
  /** Sensitive server-only connection URL. Validate against your CDP allowlist before connecting. */
  readonly websocketUrl: string;
}

export interface SteelSessionInput {
  /** Explicit provider-side lifetime ceiling; does not establish a currency budget. */
  timeoutMs: number;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}

export class SteelCleanupError extends Error {
  readonly sessionId: string;
  readonly taskFailed: boolean;
  readonly phase: 'creation' | 'work';
  constructor(sessionId: string, taskFailed: boolean, phase: 'creation' | 'work' = 'work') {
    super('Browser session release was not confirmed. Reconcile the recorded session before retrying work.');
    this.name = 'SteelCleanupError';
    this.sessionId = sessionId;
    this.taskFailed = taskFailed;
    this.phase = phase;
  }
}

function responseSessionId(value: unknown): string | null {
  try {
    const id = boundedString(requireRecord(value).id, 'session ID', 256);
    pathSegment(id);
    return id;
  } catch { return null; }
}

function session(value: unknown): SteelSession {
  const result = requireRecord(value);
  const id = responseSessionId(result);
  const status = requireString(result, 'status');
  const websocketUrl = requireString(result, 'websocketUrl');
  if (!id || !['live', 'released', 'failed'].includes(status)) throw new ApiClientError('INVALID_RESPONSE');
  try {
    const parsed = new URL(websocketUrl);
    if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.hash) throw new Error();
  } catch { throw new ApiClientError('INVALID_RESPONSE'); }
  return Object.freeze({ id, status: status as SteelSession['status'], websocketUrl });
}

/** Creates and releases individual sessions; does not navigate, expose credentials to a UI, or release other sessions. */
export function createSteelBrowserClient(options: SteelBrowserOptions) {
  if (typeof options.apiKey !== 'function' || typeof options.authorize !== 'function') throw new ApiClientError('INVALID_CONFIG');
  const origin = options.origin ?? 'https://api.steel.dev';
  // Validate origin/options at configuration time before asking the application for credentials.
  createHttpClient({ ...options, origin });

  function http(operation: SteelOperation, sessionId: string | null) {
    return createHttpClient({
      ...options, origin,
      headers: async signal => {
        if (await options.authorize({ operation, sessionId }, signal) !== true) throw new ApiClientError('DENIED');
        if (signal.aborted) throw new ApiClientError('ABORTED');
        return { 'content-type': 'application/json', 'steel-api-key': credential(await options.apiKey(signal)) };
      },
    });
  }

  async function createSession(input: SteelSessionInput): Promise<SteelSession> {
    const timeout = boundedInteger(input.timeoutMs, 1000, 900000);
    const width = boundedInteger(input.width ?? 1280, 320, 3840);
    const height = boundedInteger(input.height ?? 800, 320, 2160);
    const raw = await http('create', null).request('/v1/sessions', {
      method: 'POST', signal: input.signal,
      body: JSON.stringify({ timeout, dimensions: { width, height } }),
    });
    try {
      const result = session(raw);
      if (result.status !== 'live') throw new ApiClientError('INVALID_RESPONSE');
      return result;
    } catch {
      // The service may have allocated a session even when other fields are invalid.
      // Release a known, safe ID with fresh authority and an independent deadline.
      const id = responseSessionId(raw);
      if (id !== null) {
        try { await releaseSession(id); }
        catch { throw new SteelCleanupError(id, false, 'creation'); }
      }
      throw new ApiClientError('INVALID_RESPONSE');
    }
  }

  async function getSession(id: string, signal?: AbortSignal): Promise<SteelSession> {
    boundedString(id, 'session ID', 256);
    const route = '/v1/sessions/' + pathSegment(id);
    const result = session(await http('read', id).request(route, { signal }));
    if (result.id !== id) throw new ApiClientError('INVALID_RESPONSE');
    return result;
  }

  async function releaseSession(id: string, signal?: AbortSignal): Promise<void> {
    boundedString(id, 'session ID', 256);
    const route = '/v1/sessions/' + pathSegment(id) + '/release';
    const result = requireRecord(await http('release', id).request(route, { method: 'POST', signal }));
    if (result.success !== true) throw new ApiClientError('INVALID_RESPONSE');
  }

  async function withSession<T>(input: SteelSessionInput, work: (value: SteelSession) => Promise<T>): Promise<T> {
    if (typeof work !== 'function') throw new ApiClientError('INVALID_INPUT');
    const created = await createSession(input);
    const createdId = created.id;
    let taskFailed = false;
    try { return await work(created); }
    catch (error) { taskFailed = true; throw error; }
    finally {
      // Cleanup has its own bounded request and must run even if the task's signal was cancelled.
      try { await releaseSession(createdId); }
      catch { throw new SteelCleanupError(createdId, taskFailed); }
    }
  }

  return Object.freeze({ createSession, getSession, releaseSession, withSession });
}
