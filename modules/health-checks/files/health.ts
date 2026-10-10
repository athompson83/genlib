// SPDX-License-Identifier: Apache-2.0
// Fetch-standard liveness/readiness handlers. No environment discovery or network access of its own.

export type CheckOutcome = void | { detail?: string };
export type CheckFunction = (signal: AbortSignal) => Promise<CheckOutcome> | CheckOutcome;

export interface CheckDefinition {
  check: CheckFunction;
  /** A failing critical check makes readiness 503. Default true. */
  critical?: boolean;
  /** Overrides the handler timeout for this check. 1-60000 ms. */
  timeoutMs?: number;
}

export interface HealthHandlerOptions {
  /** Named readiness checks. A bare function is a critical check. Names: [A-Za-z0-9_.:-]{1,64}, at most 50. */
  checks?: Record<string, CheckFunction | CheckDefinition>;
  /** Default per-check timeout. Default 2000; 1-60000 ms. */
  timeoutMs?: number;
  /** Epoch milliseconds, used for checkedAt and durations. Defaults to Date.now. */
  clock?: () => number;
  /** Optional build/version label included in bodies. Keep it non-sensitive. */
  version?: string;
  /** Include check error messages (truncated). Only for trusted internal networks. Default false. */
  exposeErrors?: boolean;
  /** Paths matched by `handle`. Defaults /healthz and /readyz. */
  livenessPath?: string;
  readinessPath?: string;
}

export type CheckStatus = "pass" | "fail" | "timeout";
export interface CheckReport {
  status: CheckStatus;
  critical: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
}
export interface ReadinessReport {
  status: "ok" | "degraded" | "fail";
  checkedAt: string;
  durationMs: number;
  version?: string;
  checks: Record<string, CheckReport>;
}

export interface HealthHandler {
  /** Always 200 while the process can serve requests. Runs no checks. */
  liveness(request: Request): Response;
  /** Runs all checks concurrently; 503 if any critical check fails or times out. */
  readiness(request: Request): Promise<Response>;
  /** Routes by pathname; returns null when the path is neither health path so callers can fall through. */
  handle(request: Request): Promise<Response | null>;
}

const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_CHECKS = 50;
const MAX_TEXT = 256;

function invalid(what: string): TypeError {
  return new TypeError(`Health handler configuration is invalid: ${what}.`);
}

function timeoutOf(value: number | undefined, fallback: number, what: string): number {
  const ms = value ?? fallback;
  if (!Number.isInteger(ms) || ms < 1 || ms > 60_000) throw invalid(`${what} must be an integer 1-60000`);
  return ms;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.length > MAX_TEXT ? clean.slice(0, MAX_TEXT) : clean;
}

interface NormalizedCheck { name: string; check: CheckFunction; critical: boolean; timeoutMs: number }

class CheckTimeout extends Error {}

export function createHealthHandler(options: HealthHandlerOptions = {}): HealthHandler {
  const defaultTimeout = timeoutOf(options.timeoutMs, 2000, "timeoutMs");
  const clock = options.clock ?? Date.now;
  if (typeof clock !== "function") throw invalid("clock");
  const version = options.version === undefined ? undefined : text(options.version);
  if (options.version !== undefined && version === undefined) throw invalid("version");
  const exposeErrors = options.exposeErrors === true;
  const livenessPath = options.livenessPath ?? "/healthz";
  const readinessPath = options.readinessPath ?? "/readyz";
  for (const path of [livenessPath, readinessPath]) {
    if (!/^\/[A-Za-z0-9_.\/-]*$/.test(path)) throw invalid("health paths");
  }
  if (livenessPath === readinessPath) throw invalid("health paths must differ");

  const entries = Object.entries(options.checks ?? {});
  if (entries.length > MAX_CHECKS) throw invalid(`at most ${MAX_CHECKS} checks`);
  const checks: NormalizedCheck[] = entries.map(([name, value]) => {
    if (!NAME.test(name)) throw invalid("check name");
    if (typeof value === "function") return { name, check: value, critical: true, timeoutMs: defaultTimeout };
    if (!value || typeof value.check !== "function") throw invalid(`check ${name}`);
    return {
      name, check: value.check, critical: value.critical !== false,
      timeoutMs: timeoutOf(value.timeoutMs, defaultTimeout, `check ${name} timeoutMs`),
    };
  });

  const now = (): number => {
    const value = clock();
    return Number.isFinite(value) ? value : Date.now();
  };

  async function runCheck(item: NormalizedCheck): Promise<CheckReport> {
    const controller = new AbortController();
    const started = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CheckTimeout());
      }, item.timeoutMs);
    });
    const report = (status: CheckStatus): CheckReport =>
      ({ status, critical: item.critical, durationMs: Math.max(0, Math.round(now() - started)) });
    try {
      const outcome = await Promise.race([Promise.resolve().then(() => item.check(controller.signal)), timeout]);
      const result = report("pass");
      const detail = outcome && typeof outcome === "object" ? text(outcome.detail) : undefined;
      if (detail !== undefined) result.detail = detail;
      return result;
    } catch (error) {
      if (error instanceof CheckTimeout) {
        const result = report("timeout");
        if (exposeErrors) result.error = "Check exceeded its time limit.";
        return result;
      }
      const result = report("fail");
      if (exposeErrors) {
        const message = text(error instanceof Error ? error.message : typeof error === "string" ? error : undefined);
        result.error = message ?? "Check failed.";
      }
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  function respond(request: Request, status: number, body: unknown): Response {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(request.method === "HEAD" ? null : JSON.stringify(body), { status, headers });
  }

  function methodNotAllowed(): Response {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  const allowed = (request: Request): boolean => request.method === "GET" || request.method === "HEAD";

  function liveness(request: Request): Response {
    if (!allowed(request)) return methodNotAllowed();
    const body: { status: "ok"; checkedAt: string; version?: string } = {
      status: "ok", checkedAt: new Date(now()).toISOString(),
    };
    if (version !== undefined) body.version = version;
    return respond(request, 200, body);
  }

  async function readiness(request: Request): Promise<Response> {
    if (!allowed(request)) return methodNotAllowed();
    const started = now();
    const results = await Promise.all(checks.map(runCheck));
    const report: ReadinessReport = {
      status: "ok",
      checkedAt: new Date(started).toISOString(),
      durationMs: 0,
      checks: Object.create(null) as Record<string, CheckReport>,
    };
    if (version !== undefined) report.version = version;
    checks.forEach((item, index) => {
      const result = results[index];
      if (!result) return;
      report.checks[item.name] = result;
      if (result.status !== "pass") report.status = item.critical ? "fail" : report.status === "fail" ? "fail" : "degraded";
    });
    report.durationMs = Math.max(0, Math.round(now() - started));
    return respond(request, report.status === "fail" ? 503 : 200, report);
  }

  async function handle(request: Request): Promise<Response | null> {
    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return null;
    }
    if (pathname === livenessPath) return liveness(request);
    if (pathname === readinessPath) return readiness(request);
    return null;
  }

  return { liveness, readiness, handle };
}
