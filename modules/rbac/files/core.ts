// SPDX-License-Identifier: Apache-2.0
// Role-based access control for multi-tenant server apps. Roles are a static definition (permissions,
// inheritance, deny rules, protected roles); assignments are stored per (tenant, subject, role, resource?) with
// optional expiry. Checks are fail-closed: an unknown permission shape, a malformed context, an expired
// assignment or a role from another tenant never grants anything. Framework-neutral; the receiving application
// supplies persistence through RbacStore (memory-store.ts, or sql-store.ts with schema.sql on PostgreSQL).

export interface RoleDefinition {
  /** `resource:action` patterns with `*` wildcards (`invoice:*`, `*:read`, `*`); prefix `!` to deny. */
  readonly permissions: readonly string[];
  /** Roles whose permissions (allows and denies) this role also has. Cycles are rejected at creation. */
  readonly inherits?: readonly string[];
  /** Never remove the last active tenant-wide holder of this role (for example `owner`). */
  readonly protected?: boolean;
}

export type RoleDefinitions = Readonly<Record<string, RoleDefinition>>;

export interface AssignmentKey {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly role: string;
  /** null for a tenant-wide assignment; otherwise the one resource (project, document) it applies to. */
  readonly resourceId: string | null;
}

export interface Assignment extends AssignmentKey {
  /** Epoch milliseconds; null never expires. An assignment at or past expiresAt is ignored. */
  readonly expiresAt: number | null;
  readonly createdAt: number;
  readonly grantedBy: string;
}

/** Keyset position for listing: (subjectId, role, resourceId or "" for tenant-wide), in code-point order. */
export interface ListCursor { readonly subjectId: string; readonly role: string; readonly resourceId: string }

export type RemoveResult = "removed" | "not-found" | "last-holder";

export interface RbacStore {
  /** Every assignment of one subject in one tenant, any scope, including expired ones (core filters them). */
  forSubject(tenantId: string, subjectId: string): Promise<Assignment[]>;
  /**
   * Inserts the assignment, or, when one with the same key exists, sets its expiresAt and keeps createdAt and
   * grantedBy. Returns the stored row and whether it was created. Must be atomic per key.
   */
  upsert(assignment: Assignment): Promise<{ assignment: Assignment; created: boolean }>;
  /**
   * Deletes one assignment. With `protectedRole`, deletes a tenant-wide row only when it is already expired or
   * another active tenant-wide holder of the same role remains, as one atomic step (two concurrent removals of
   * the last two holders must not both succeed); otherwise returns "last-holder".
   */
  remove(key: AssignmentKey, guard: { readonly protectedRole: boolean; readonly now: number }): Promise<RemoveResult>;
  /** Assignments in one tenant ordered by (subjectId, role, resourceId ?? ""), strictly after `after`. */
  list(tenantId: string, query: { readonly subjectId: string | null; readonly after: ListCursor | null; readonly limit: number }): Promise<Assignment[]>;
}

export interface RbacContext {
  readonly tenantId: string;
  /** Include resource-scoped assignments for this resource as well as tenant-wide ones. */
  readonly resourceId?: string | null;
}

export type Reason = "allowed" | "denied-by-rule" | "no-matching-role" | "invalid-permission" | "invalid-context";

export interface Decision {
  readonly allowed: boolean;
  readonly reason: Reason;
  /** The role that granted the permission, or the role whose deny rule refused it. */
  readonly via?: string;
}

export interface EffectivePermissions {
  readonly roles: string[];
  readonly allow: string[];
  readonly deny: string[];
}

export interface GrantInput {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly role: string;
  readonly resourceId?: string | null;
  readonly expiresAt?: number | null;
}

export type RevokeInput = Omit<GrantInput, "expiresAt">;

export interface AssignmentPage { readonly assignments: Assignment[]; readonly nextCursor: string | null }

export type RbacErrorCode =
  | "forbidden" | "escalation" | "last-owner" | "invalid-role" | "invalid-tenant" | "invalid-subject"
  | "invalid-resource" | "invalid-expiry" | "invalid-cursor" | "invalid-limit" | "bad-request";

export class RbacError extends Error {
  constructor(readonly code: RbacErrorCode, message: string) {
    super(message);
    this.name = "RbacError";
  }
}

export interface RbacOptions {
  readonly store: RbacStore;
  readonly roles: RoleDefinitions;
  readonly now?: () => number;
}

/** The permission an actor needs in a tenant (or on a resource) to grant, revoke and list assignments. */
export const MANAGE_PERMISSION = "rbac:manage";

const SEGMENT = "[A-Za-z][A-Za-z0-9_.-]{0,63}";
const PATTERN = new RegExp(`^(?:\\*|(?:\\*|${SEGMENT}):(?:\\*|${SEGMENT}))$`);
const CONCRETE = new RegExp(`^${SEGMENT}:${SEGMENT}$`);
const ROLE = /^[a-z][a-z0-9_-]{0,63}$/;
const ID = /^[A-Za-z0-9_.:@|-]{1,200}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type Pattern = readonly [string, string];
interface Compiled { readonly allow: Pattern[]; readonly deny: Pattern[] }

const parse = (pattern: string): Pattern => {
  if (pattern === "*") return ["*", "*"];
  const index = pattern.indexOf(":");
  return [pattern.slice(0, index), pattern.slice(index + 1)];
};
const show = ([resource, action]: Pattern): string => (resource === "*" && action === "*" ? "*" : `${resource}:${action}`);
const matches = (pattern: Pattern, permission: Pattern): boolean =>
  (pattern[0] === "*" || pattern[0] === permission[0]) && (pattern[1] === "*" || pattern[1] === permission[1]);
/** Every permission `inner` matches is also matched by `outer`. */
const subsumes = (outer: Pattern, inner: Pattern): boolean =>
  (outer[0] === "*" || outer[0] === inner[0]) && (outer[1] === "*" || outer[1] === inner[1]);
const segmentMeet = (a: string, b: string): string | null => (a === "*" ? b : b === "*" || a === b ? a : null);
/** The set of permissions both patterns match, as a pattern, or null when they do not overlap. */
const intersect = (a: Pattern, b: Pattern): Pattern | null => {
  const resource = segmentMeet(a[0], b[0]);
  const action = segmentMeet(a[1], b[1]);
  return resource === null || action === null ? null : [resource, action];
};

/** True when `pattern` is a valid allow pattern (`resource:action`, either side `*`, or `*`). */
export function isPermissionPattern(pattern: unknown): pattern is string {
  return typeof pattern === "string" && PATTERN.test(pattern);
}

function compileRoles(roles: RoleDefinitions): Map<string, Compiled & { readonly protected: boolean }> {
  if (!roles || typeof roles !== "object") throw new RangeError("roles must be an object");
  const names = Object.keys(roles);
  if (names.length === 0) throw new RangeError("Define at least one role");
  for (const name of names) {
    if (!ROLE.test(name)) throw new RangeError(`Invalid role name: ${name}`);
    const definition = roles[name];
    if (!definition || !Array.isArray(definition.permissions)) throw new RangeError(`Role ${name} needs a permissions array`);
    for (const entry of definition.permissions) {
      const body = typeof entry === "string" && entry.startsWith("!") ? entry.slice(1) : entry;
      if (!isPermissionPattern(body)) throw new RangeError(`Role ${name} has an invalid permission: ${String(entry)}`);
    }
    for (const parent of definition.inherits ?? []) {
      if (typeof parent !== "string" || !Object.hasOwn(roles, parent)) throw new RangeError(`Role ${name} inherits unknown role: ${String(parent)}`);
    }
    if (definition.protected !== undefined && typeof definition.protected !== "boolean") throw new RangeError(`Role ${name}: protected must be a boolean`);
  }
  const compiled = new Map<string, Compiled & { readonly protected: boolean }>();
  const visiting = new Set<string>();
  const resolve = (name: string, path: string[]): Compiled => {
    const done = compiled.get(name);
    if (done) return done;
    if (visiting.has(name)) throw new RangeError(`Role inheritance cycle: ${[...path, name].join(" -> ")}`);
    visiting.add(name);
    const definition = roles[name]!;
    const allow = new Map<string, Pattern>();
    const deny = new Map<string, Pattern>();
    for (const entry of definition.permissions) {
      const target = entry.startsWith("!") ? deny : allow;
      const pattern = parse(entry.replace(/^!/, ""));
      target.set(show(pattern), pattern);
    }
    for (const parent of definition.inherits ?? []) {
      const inherited = resolve(parent, [...path, name]);
      for (const pattern of inherited.allow) allow.set(show(pattern), pattern);
      for (const pattern of inherited.deny) deny.set(show(pattern), pattern);
    }
    visiting.delete(name);
    const result = { allow: [...allow.values()], deny: [...deny.values()], protected: definition.protected === true };
    compiled.set(name, result);
    return result;
  };
  for (const name of names) resolve(name, []);
  return compiled;
}

const base64UrlEncode = (text: string): string => {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const base64UrlDecode = (text: string): string => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

export function encodeCursor(position: ListCursor): string {
  return base64UrlEncode(JSON.stringify([position.subjectId, position.role, position.resourceId]));
}

export function decodeCursor(cursor: string | null | undefined): ListCursor | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  try {
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const value: unknown = JSON.parse(base64UrlDecode(cursor));
    if (!Array.isArray(value) || value.length !== 3) throw new Error("shape");
    const [subjectId, role, resourceId] = value as unknown[];
    if (typeof subjectId !== "string" || !ID.test(subjectId) || typeof role !== "string" || !ROLE.test(role) ||
      typeof resourceId !== "string" || (resourceId !== "" && !ID.test(resourceId))) throw new Error("shape");
    return { subjectId, role, resourceId };
  } catch {
    throw new RbacError("invalid-cursor", "Invalid cursor");
  }
}

const validId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const optionalResource = (value: unknown): string | null | undefined =>
  value === undefined || value === null ? null : validId(value) ? value : undefined;

export function createRbac(options: RbacOptions) {
  const { store } = options;
  const now = options.now ?? Date.now;
  const roles = compileRoles(options.roles);

  const active = (assignment: Assignment, at: number) => assignment.expiresAt === null || assignment.expiresAt > at;

  /** Applicable role names, sorted, for one subject in one context: tenant-wide plus the matching resource. */
  async function applicableRoles(subjectId: string, tenantId: string, resourceId: string | null): Promise<string[]> {
    const at = now();
    const names = new Set<string>();
    for (const assignment of await store.forSubject(tenantId, subjectId)) {
      if (assignment.tenantId !== tenantId || assignment.subjectId !== subjectId || !active(assignment, at)) continue;
      if (assignment.resourceId !== null && assignment.resourceId !== resourceId) continue;
      if (roles.has(assignment.role)) names.add(assignment.role); // a role removed from the definition grants nothing
    }
    return [...names].sort();
  }

  function context(ctx: RbacContext | undefined): { tenantId: string; resourceId: string | null } | null {
    if (!ctx || !validId(ctx.tenantId)) return null;
    const resourceId = optionalResource(ctx.resourceId);
    return resourceId === undefined ? null : { tenantId: ctx.tenantId, resourceId };
  }

  async function effective(subjectId: string, tenantId: string, resourceId: string | null): Promise<Compiled & { roles: string[] }> {
    const names = await applicableRoles(subjectId, tenantId, resourceId);
    const allow = new Map<string, Pattern>();
    const deny = new Map<string, Pattern>();
    for (const name of names) {
      const role = roles.get(name)!;
      for (const pattern of role.allow) allow.set(show(pattern), pattern);
      for (const pattern of role.deny) deny.set(show(pattern), pattern);
    }
    return { roles: names, allow: [...allow.values()], deny: [...deny.values()] };
  }

  async function can(subjectId: string, permission: string, ctx: RbacContext): Promise<Decision> {
    if (typeof permission !== "string" || !CONCRETE.test(permission)) return { allowed: false, reason: "invalid-permission" };
    const scope = context(ctx);
    if (!scope || !validId(subjectId)) return { allowed: false, reason: "invalid-context" };
    const wanted = parse(permission);
    const names = await applicableRoles(subjectId, scope.tenantId, scope.resourceId);
    for (const name of names) {
      if (roles.get(name)!.deny.some((pattern) => matches(pattern, wanted))) return { allowed: false, reason: "denied-by-rule", via: name };
    }
    for (const name of names) {
      if (roles.get(name)!.allow.some((pattern) => matches(pattern, wanted))) return { allowed: true, reason: "allowed", via: name };
    }
    return { allowed: false, reason: "no-matching-role" };
  }

  /** Whether everything `role` grants is also granted to the actor (deny rules included). */
  function covers(actor: Compiled, role: Compiled): boolean {
    for (const pattern of role.allow) {
      if (role.deny.some((rule) => subsumes(rule, pattern))) continue; // the role itself grants nothing here
      if (!actor.allow.some((rule) => subsumes(rule, pattern))) return false;
      for (const rule of actor.deny) {
        const overlap = intersect(rule, pattern);
        if (overlap && !role.deny.some((own) => subsumes(own, overlap))) return false;
      }
    }
    return true;
  }

  function validateKey(input: RevokeInput): AssignmentKey {
    if (!input || typeof input !== "object") throw new RbacError("bad-request", "Expected an assignment");
    if (!validId(input.tenantId)) throw new RbacError("invalid-tenant", "Invalid tenantId");
    if (!validId(input.subjectId)) throw new RbacError("invalid-subject", "Invalid subjectId");
    if (typeof input.role !== "string" || !roles.has(input.role)) throw new RbacError("invalid-role", "Unknown role");
    const resourceId = optionalResource(input.resourceId);
    if (resourceId === undefined) throw new RbacError("invalid-resource", "Invalid resourceId");
    return { tenantId: input.tenantId, subjectId: input.subjectId, role: input.role, resourceId };
  }

  async function authorizeChange(actorId: string, key: AssignmentKey): Promise<void> {
    if (!validId(actorId)) throw new RbacError("forbidden", "Not allowed to manage roles");
    const manage = await can(actorId, MANAGE_PERMISSION, { tenantId: key.tenantId, resourceId: key.resourceId });
    if (!manage.allowed) throw new RbacError("forbidden", "Not allowed to manage roles here");
    const mine = await effective(actorId, key.tenantId, key.resourceId);
    if (!covers(mine, roles.get(key.role)!)) throw new RbacError("escalation", "Cannot grant or revoke a role with permissions you do not hold");
  }

  function validateExpiry(key: AssignmentKey, value: unknown, at: number): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= at) throw new RbacError("invalid-expiry", "expiresAt must be a future epoch-millisecond integer");
    if (roles.get(key.role)!.protected) throw new RbacError("invalid-expiry", "A protected role cannot expire");
    return value;
  }

  async function write(actorId: string, input: GrantInput) {
    const key = validateKey(input);
    const at = now();
    const expiresAt = validateExpiry(key, input.expiresAt, at);
    return store.upsert({ ...key, expiresAt, createdAt: at, grantedBy: actorId });
  }

  return {
    can,

    /** Throws RbacError("forbidden") unless `subjectId` holds `permission` in the context. */
    async assert(subjectId: string, permission: string, ctx: RbacContext): Promise<Decision> {
      const decision = await can(subjectId, permission, ctx);
      if (!decision.allowed) throw new RbacError("forbidden", `Missing permission ${typeof permission === "string" ? permission.slice(0, 130) : ""}`);
      return decision;
    },

    /** Effective roles and permission patterns; deny patterns override allow patterns. */
    async permissionsFor(subjectId: string, ctx: RbacContext): Promise<EffectivePermissions> {
      const scope = context(ctx);
      if (!scope || !validId(subjectId)) return { roles: [], allow: [], deny: [] };
      const result = await effective(subjectId, scope.tenantId, scope.resourceId);
      return { roles: result.roles, allow: result.allow.map(show).sort(), deny: result.deny.map(show).sort() };
    },

    /**
     * Grants a role. The actor needs rbac:manage in the tenant (or on the resource) and must already hold every
     * permission the role grants. Granting an existing assignment is idempotent (created: false); a different
     * expiresAt replaces the stored one.
     */
    async grant(actorId: string, input: GrantInput): Promise<{ assignment: Assignment; created: boolean }> {
      const key = validateKey(input);
      await authorizeChange(actorId, key);
      return write(actorId, input);
    },

    /** Removes an assignment under the same authorization as grant. Removing the last protected holder throws last-owner. */
    async revoke(actorId: string, input: RevokeInput): Promise<{ removed: boolean }> {
      const key = validateKey(input);
      await authorizeChange(actorId, key);
      const result = await store.remove(key, { protectedRole: roles.get(key.role)!.protected && key.resourceId === null, now: now() });
      if (result === "last-holder") throw new RbacError("last-owner", `Cannot remove the last ${key.role}`);
      return { removed: result === "removed" };
    },

    /** Assignments in one tenant (including expired ones) for actors with rbac:manage there. */
    async listAssignments(actorId: string, tenantId: string, query: { subjectId?: string | null; cursor?: string | null; limit?: number } = {}): Promise<AssignmentPage> {
      if (!validId(tenantId)) throw new RbacError("invalid-tenant", "Invalid tenantId");
      const subjectId = query.subjectId === undefined || query.subjectId === null || query.subjectId === "" ? null : query.subjectId;
      if (subjectId !== null && !validId(subjectId)) throw new RbacError("invalid-subject", "Invalid subjectId");
      const limit = query.limit ?? DEFAULT_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RbacError("invalid-limit", `limit must be 1 to ${MAX_LIMIT}`);
      const after = decodeCursor(query.cursor);
      if (!(await can(actorId, MANAGE_PERMISSION, { tenantId })).allowed) throw new RbacError("forbidden", "Not allowed to list roles here");
      const rows = await store.list(tenantId, { subjectId, after, limit: limit + 1 });
      const assignments = rows.slice(0, limit);
      const last = assignments[assignments.length - 1];
      const nextCursor = rows.length > limit && last ? encodeCursor({ subjectId: last.subjectId, role: last.role, resourceId: last.resourceId ?? "" }) : null;
      return { assignments, nextCursor };
    },

    /**
     * Trusted server code only (tenant creation, migrations): writes an assignment without actor checks,
     * for example the first owner of a new tenant. Never expose it through a request handler.
     */
    async grantAsSystem(input: GrantInput, grantedBy = "system"): Promise<{ assignment: Assignment; created: boolean }> {
      return write(grantedBy, input);
    },

    /** The compiled definition: effective allow and deny patterns of each role. */
    describeRoles(): Record<string, { allow: string[]; deny: string[]; protected: boolean }> {
      return Object.fromEntries([...roles].map(([name, role]) => [name, { allow: role.allow.map(show).sort(), deny: role.deny.map(show).sort(), protected: role.protected }]));
    },
  };
}

export type Rbac = ReturnType<typeof createRbac>;
