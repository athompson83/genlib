// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: deterministic topological sort (Kahn's algorithm) and parallel levels. Original source; copy and adapt.
// Edges are [before, after] pairs naming known nodes (duplicates allowed). Among ready nodes the one earliest in
// `nodes` goes first, so the order is stable across runs. A cycle throws CycleError("cycle: a -> b -> a"), found by
// dropping nodes only downstream of a cycle, then walking from the first remaining node along its first remaining
// outgoing edge until a node repeats. Use for build steps, migrations, task dependencies and plugin load order.
// Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart topo-sort modules (shared vectors).

/** Thrown when the graph has a cycle; the message names one cycle, e.g. "cycle: a -> b -> a". */
export class CycleError extends RangeError {
  override name = "CycleError";
}

interface Graph { idx: Map<string, number>; out: Map<string, string[]>; indeg: Map<string, number> }

function graph(nodes: readonly string[], edges: readonly (readonly [string, string])[]): Graph {
  const idx = new Map(nodes.map((n, i) => [n, i]));
  if (idx.size !== nodes.length) throw new RangeError("duplicate node");
  const out = new Map(nodes.map((n): [string, string[]] => [n, []]));
  const indeg = new Map(nodes.map((n) => [n, 0]));
  for (const [a, b] of edges) {
    if (!idx.has(a) || !idx.has(b)) throw new RangeError(`unknown node in edge ${a} -> ${b}`);
    out.get(a)!.push(b);
    indeg.set(b, indeg.get(b)! + 1);
  }
  return { idx, out, indeg };
}

function cycle(nodes: readonly string[], out: Map<string, string[]>, remaining: Set<string>): string {
  const left = new Set(remaining);
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes) {
      if (left.has(n) && !out.get(n)!.some((b) => left.has(b))) { left.delete(n); changed = true; }
    }
  }
  const start = nodes.find((n) => left.has(n))!;
  const path = [start];
  const seen = new Map([[start, 0]]);
  for (let cur = start; ;) {
    const next = out.get(cur)!.find((b) => left.has(b))!;
    const at = seen.get(next);
    if (at !== undefined) return "cycle: " + [...path.slice(at), next].join(" -> ");
    seen.set(next, path.length);
    path.push(next);
    cur = next;
  }
}

/** All nodes, each after its prerequisites; ties go to the node earliest in nodes. Throws CycleError on a cycle. */
export function topoSort(nodes: readonly string[], edges: readonly (readonly [string, string])[]): string[] {
  const { idx, out, indeg } = graph(nodes, edges);
  const ready = nodes.filter((n) => indeg.get(n) === 0).map((n) => idx.get(n)!); // sorted node indexes
  const order: string[] = [];
  while (ready.length > 0) {
    const n = nodes[ready.shift()!]!;
    order.push(n);
    for (const b of out.get(n)!) {
      const left = indeg.get(b)! - 1;
      indeg.set(b, left);
      if (left === 0) {
        const i = idx.get(b)!;
        let lo = 0;
        let hi = ready.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (ready[mid]! < i) lo = mid + 1; else hi = mid; }
        ready.splice(lo, 0, i);
      }
    }
  }
  if (order.length < nodes.length) {
    const done = new Set(order);
    throw new CycleError(cycle(nodes, out, new Set(nodes.filter((n) => !done.has(n)))));
  }
  return order;
}

/** Groups that can run in parallel: level 0 has no prerequisites; each group is in nodes order. */
export function topoLevels(nodes: readonly string[], edges: readonly (readonly [string, string])[]): string[][] {
  const { idx, out, indeg } = graph(nodes, edges);
  let level = nodes.filter((n) => indeg.get(n) === 0);
  const levels: string[][] = [];
  let done = 0;
  while (level.length > 0) {
    levels.push(level);
    done += level.length;
    const next = new Set<string>();
    for (const n of level) {
      for (const b of out.get(n)!) {
        const left = indeg.get(b)! - 1;
        indeg.set(b, left);
        if (left === 0) next.add(b);
      }
    }
    level = [...next].sort((a, b) => idx.get(a)! - idx.get(b)!);
  }
  if (done < nodes.length) throw new CycleError(cycle(nodes, out, new Set(nodes.filter((n) => indeg.get(n)! > 0))));
  return levels;
}
