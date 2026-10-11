// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Deterministic topological sort (Kahn's algorithm): among ready nodes the one earliest in <c>nodes</c> goes first. Edges are
/// (before, after) pairs; duplicate edges are allowed. A cycle throws <see cref="InvalidOperationException"/> with the exact message
/// "cycle: a -> b -> a"; duplicate nodes or an edge naming an unknown node throw <see cref="ArgumentException"/>.
/// </summary>
public static class TopoSort {
    /// <summary>All nodes in dependency order, ties broken by position in <paramref name="nodes"/>.</summary>
    public static List<string> Sort(IReadOnlyList<string> nodes, IEnumerable<(string Before, string After)> edges) {
        var (_, outs, indeg) = Graph(nodes, edges);
        var heap = new PriorityQueue<int, int>();
        for (int i = 0; i < nodes.Count; i++) if (indeg[i] == 0) heap.Enqueue(i, i);
        var order = new List<string>(nodes.Count);
        var done = new bool[nodes.Count];
        while (heap.TryDequeue(out int n, out _)) {
            order.Add(nodes[n]);
            done[n] = true;
            foreach (int b in outs[n]) if (--indeg[b] == 0) heap.Enqueue(b, b);
        }
        if (order.Count < nodes.Count) throw new InvalidOperationException("cycle: " + Cycle(nodes, outs, i => !done[i]));
        return order;
    }

    /// <summary>Groups that can run in parallel: level 0 has no prerequisites, each level lists its nodes in <paramref name="nodes"/> order.</summary>
    public static List<List<string>> Levels(IReadOnlyList<string> nodes, IEnumerable<(string Before, string After)> edges) {
        var (_, outs, indeg) = Graph(nodes, edges);
        var level = new List<int>();
        for (int i = 0; i < nodes.Count; i++) if (indeg[i] == 0) level.Add(i);
        var levels = new List<List<string>>();
        int count = 0;
        while (level.Count > 0) {
            levels.Add(level.ConvertAll(i => nodes[i]));
            count += level.Count;
            var next = new List<int>();
            foreach (int n in level) foreach (int b in outs[n]) if (--indeg[b] == 0) next.Add(b);
            next.Sort();
            level = next;
        }
        if (count < nodes.Count) throw new InvalidOperationException("cycle: " + Cycle(nodes, outs, i => indeg[i] > 0));
        return levels;
    }

    private static (Dictionary<string, int> Idx, List<int>[] Outs, int[] Indeg) Graph(IReadOnlyList<string> nodes, IEnumerable<(string Before, string After)> edges) {
        ArgumentNullException.ThrowIfNull(nodes);
        ArgumentNullException.ThrowIfNull(edges);
        var idx = new Dictionary<string, int>();
        for (int i = 0; i < nodes.Count; i++) if (!idx.TryAdd(nodes[i], i)) throw new ArgumentException("duplicate node");
        var outs = new List<int>[nodes.Count];
        for (int i = 0; i < outs.Length; i++) outs[i] = new List<int>();
        var indeg = new int[nodes.Count];
        foreach (var (a, b) in edges) {
            if (!idx.TryGetValue(a, out int ia) || !idx.TryGetValue(b, out int ib)) throw new ArgumentException($"unknown node in edge {a} -> {b}");
            outs[ia].Add(ib);
            indeg[ib]++;
        }
        return (idx, outs, indeg);
    }

    // Repeatedly drops remaining nodes without a remaining outgoing edge (they lie downstream of a cycle), then walks from the
    // first remaining node in `nodes` order along its first remaining outgoing edge (edge order) until a node repeats.
    private static string Cycle(IReadOnlyList<string> nodes, List<int>[] outs, Func<int, bool> unprocessed) {
        var remaining = new bool[nodes.Count];
        for (int i = 0; i < nodes.Count; i++) remaining[i] = unprocessed(i);
        bool changed = true;
        while (changed) {
            changed = false;
            for (int i = 0; i < nodes.Count; i++) {
                if (remaining[i] && !outs[i].Exists(b => remaining[b])) { remaining[i] = false; changed = true; }
            }
        }
        int start = Array.IndexOf(remaining, true);
        var path = new List<int> { start };
        var seen = new Dictionary<int, int> { [start] = 0 };
        int cur = start;
        while (true) {
            int nxt = outs[cur].Find(b => remaining[b]);
            if (seen.TryGetValue(nxt, out int at)) {
                var cyc = path.GetRange(at, path.Count - at);
                cyc.Add(nxt);
                return string.Join(" -> ", cyc.ConvertAll(i => nodes[i]));
            }
            seen[nxt] = path.Count;
            path.Add(nxt);
            cur = nxt;
        }
    }
}
