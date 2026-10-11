# SPDX-License-Identifier: Apache-2.0
"""Deterministic topological sort (Kahn's algorithm) and parallel levels.

Edges are [before, after] pairs naming known nodes (duplicate edges are allowed). Among ready nodes the one
earliest in ``nodes`` goes first. A cycle raises CycleError with a message such as 'cycle: a -> b -> a',
found by first dropping nodes that are only downstream of a cycle, then walking from the first remaining
node along its first remaining outgoing edge until a node repeats.
"""
import heapq


class CycleError(ValueError):
    """Raised when the graph has a cycle; the message names one cycle."""


def _graph(nodes: list[str], edges: list) -> tuple[dict, dict, dict]:
    if len(set(nodes)) != len(nodes):
        raise ValueError("duplicate node")
    idx = {n: i for i, n in enumerate(nodes)}
    out: dict[str, list[str]] = {n: [] for n in nodes}
    indeg = {n: 0 for n in nodes}
    for a, b in edges:
        if a not in idx or b not in idx:
            raise ValueError(f"unknown node in edge {a} -> {b}")
        out[a].append(b)
        indeg[b] += 1
    return idx, out, indeg


def _cycle(nodes: list[str], out: dict, remaining: set) -> str:
    # Drop nodes that are only downstream of a cycle (no remaining outgoing edge) until nothing changes, then walk
    # from the first remaining node along its first remaining outgoing edge; the walk always closes a cycle.
    remaining = set(remaining)
    changed = True
    while changed:
        changed = False
        for n in nodes:
            if n in remaining and not any(b in remaining for b in out[n]):
                remaining.discard(n)
                changed = True
    start = next(n for n in nodes if n in remaining)
    path = [start]
    seen = {start: 0}
    cur = start
    while True:
        nxt = next(b for b in out[cur] if b in remaining)
        if nxt in seen:
            return "cycle: " + " -> ".join(path[seen[nxt]:] + [nxt])
        seen[nxt] = len(path)
        path.append(nxt)
        cur = nxt


def topo_sort(nodes: list[str], edges: list) -> list[str]:
    """All nodes, each after its prerequisites; ties go to the node earliest in nodes."""
    idx, out, indeg = _graph(nodes, edges)
    heap = [idx[n] for n in nodes if indeg[n] == 0]
    heapq.heapify(heap)
    order: list[str] = []
    while heap:
        n = nodes[heapq.heappop(heap)]
        order.append(n)
        for b in out[n]:
            indeg[b] -= 1
            if indeg[b] == 0:
                heapq.heappush(heap, idx[b])
    if len(order) < len(nodes):
        raise CycleError(_cycle(nodes, out, set(nodes) - set(order)))
    return order


def topo_levels(nodes: list[str], edges: list) -> list[list[str]]:
    """Groups that can run in parallel: level 0 has no prerequisites; each group is in nodes order."""
    idx, out, indeg = _graph(nodes, edges)
    level = [n for n in nodes if indeg[n] == 0]
    levels: list[list[str]] = []
    done = 0
    while level:
        levels.append(level)
        done += len(level)
        nxt = []
        for n in level:
            for b in out[n]:
                indeg[b] -= 1
                if indeg[b] == 0:
                    nxt.append(b)
        level = sorted(set(nxt), key=lambda n: idx[n])
    if done < len(nodes):
        raise CycleError(_cycle(nodes, out, {n for n in nodes if indeg[n] > 0}))
    return levels
