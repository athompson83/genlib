// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, segment, record, array, string, strings, number, nullableString, boolean, type PublicDataOptions, type ReadOptions } from "./http.js";
export type PackageSystem = "GO" | "RUBYGEMS" | "NPM" | "CARGO" | "MAVEN" | "PYPI" | "NUGET";
export interface PackageVersion { system: PackageSystem; name: string; version: string }
export interface PackageVersionMetadata { version: PackageVersion; licenses: string[]; licenseKnown: boolean; advisoryIds: string[]; publishedAt: string | null; isDeprecated: boolean | null; deprecatedReason: string | null; links: { label: string; url: string }[]; relatedProjects: { id: string; relation: string }[] }
export interface DependencyGraph { nodes: { version: PackageVersion; relation: string; bundled: boolean }[]; edges: { from: number; to: number; requirement: string }[]; error: string | null }
const systems = new Set<PackageSystem>(["GO", "RUBYGEMS", "NPM", "CARGO", "MAVEN", "PYPI", "NUGET"]);
function version(value: PackageVersion): PackageVersion {
  if (!systems.has(value.system)) throw new PublicDataError("INVALID_INPUT");
  return { system: value.system, name: inputText(value.name, 214), version: inputText(value.version, 200) };
}
function parsedVersion(value: unknown): PackageVersion {
  const v = record(value); return version({ system: string(v.system) as PackageSystem, name: string(v.name), version: string(v.version) });
}
function path(value: PackageVersion): string { const v = version(value); return `/v3/systems/${v.system}/packages/${segment(v.name)}/versions/${segment(v.version)}`; }
export function createDepsDevClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.deps.dev", provider: "deps-dev",
    source: "https://docs.deps.dev/api/v3/", attribution: "deps.dev generated data CC-BY-4.0; aggregated upstream data retain source terms. Google API Terms apply." });
  return Object.freeze({
    getVersion(selected: PackageVersion, read: ReadOptions = {}) {
      return http.request(path(selected), value => {
        const r = record(value), licenses = strings(r.licenses ?? [], 100);
        return { version: parsedVersion(r.versionKey), licenses, licenseKnown: licenses.length > 0,
          advisoryIds: array(r.advisoryKeys ?? [], 10000).map(v => string(record(v).id)), publishedAt: nullableString(r.publishedAt),
          isDeprecated: r.isDeprecated == null ? null : boolean(r.isDeprecated), deprecatedReason: nullableString(r.deprecatedReason),
          links: array(r.links ?? [], 1000).map(v => { const link = record(v); return { label: string(link.label), url: string(link.url) }; }),
          relatedProjects: array(r.relatedProjects ?? [], 1000).map(v => { const p = record(v); return { id: string(record(p.projectKey).id), relation: string(p.relation) }; }) } satisfies PackageVersionMetadata;
      }, read);
    },
    getDependencies(selected: PackageVersion, read: ReadOptions = {}) {
      return http.request(`${path(selected)}:dependencies`, value => {
        const r = record(value), nodes = array(r.nodes, 10000).map(v => { const n = record(v); return { version: parsedVersion(n.versionKey), relation: string(n.relation), bundled: n.bundled === undefined ? false : boolean(n.bundled) }; });
        const edges = array(r.edges ?? [], 50000).map(v => {
          // Protobuf JSON may omit zero-valued indexes.
          const e = record(v), from = number(e.fromNode ?? 0), to = number(e.toNode ?? 0);
          if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= nodes.length || to >= nodes.length) throw new PublicDataError("INVALID_RESPONSE");
          return { from, to, requirement: string(e.requirement) };
        });
        return { nodes, edges, error: nullableString(r.error) } satisfies DependencyGraph;
      }, read);
    },
  });
}
