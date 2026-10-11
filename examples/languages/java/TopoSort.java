// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.TreeSet;

/**
 * Deterministic topological sort (Kahn): among ready nodes the one earliest in the input list goes first. Edges are
 * [before, after] pairs. Unknown nodes and duplicates throw IllegalArgumentException; a cycle throws CycleException
 * whose message is "cycle: a -> b -> a".
 */
public final class TopoSort {
    private TopoSort() {}

    /** Thrown when the graph has a cycle; the message names one cycle. */
    public static final class CycleException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;

        /** Creates the exception with its "cycle: ..." message. */
        public CycleException(String message) { super(message); }
    }

    private record Graph(Map<String, Integer> idx, Map<String, List<String>> out, Map<String, Integer> indeg) {}

    private static Graph graph(List<String> nodes, List<List<String>> edges) {
        Map<String, Integer> idx = new HashMap<>();
        Map<String, List<String>> out = new HashMap<>();
        Map<String, Integer> indeg = new HashMap<>();
        for (int i = 0; i < nodes.size(); i++) {
            if (idx.put(nodes.get(i), i) != null) throw new IllegalArgumentException("duplicate node");
            out.put(nodes.get(i), new ArrayList<>());
            indeg.put(nodes.get(i), 0);
        }
        for (List<String> e : edges) {
            if (e.size() != 2) throw new IllegalArgumentException("edge must be [before, after]");
            String a = e.get(0);
            String b = e.get(1);
            if (!idx.containsKey(a) || !idx.containsKey(b)) throw new IllegalArgumentException("unknown node in edge " + a + " -> " + b);
            out.get(a).add(b);
            indeg.merge(b, 1, Integer::sum);
        }
        return new Graph(idx, out, indeg);
    }

    private static String cycle(List<String> nodes, Map<String, List<String>> out, Set<String> remainingIn) {
        // Drop nodes that are only downstream of a cycle, so every remaining node has a remaining outgoing edge.
        Set<String> remaining = new HashSet<>(remainingIn);
        boolean changed = true;
        while (changed) {
            changed = false;
            for (String n : nodes) {
                if (remaining.contains(n) && out.get(n).stream().noneMatch(remaining::contains)) { remaining.remove(n); changed = true; }
            }
        }
        String start = null;
        for (String n : nodes) if (remaining.contains(n)) { start = n; break; }
        List<String> path = new ArrayList<>();
        Map<String, Integer> seen = new HashMap<>();
        path.add(start);
        seen.put(start, 0);
        String cur = start;
        while (true) {
            String nxt = null;
            for (String b : out.get(cur)) if (remaining.contains(b)) { nxt = b; break; }
            if (seen.containsKey(nxt)) {
                List<String> cyc = new ArrayList<>(path.subList(seen.get(nxt), path.size()));
                cyc.add(nxt);
                return String.join(" -> ", cyc);
            }
            seen.put(nxt, path.size());
            path.add(nxt);
            cur = nxt;
        }
    }

    /** Nodes in dependency order; ties go to the node earliest in nodes. */
    public static List<String> topoSort(List<String> nodes, List<List<String>> edges) {
        Graph g = graph(nodes, edges);
        PriorityQueue<Integer> heap = new PriorityQueue<>();
        for (String n : nodes) if (g.indeg().get(n) == 0) heap.add(g.idx().get(n));
        List<String> order = new ArrayList<>();
        while (!heap.isEmpty()) {
            String n = nodes.get(heap.poll());
            order.add(n);
            for (String b : g.out().get(n)) {
                if (g.indeg().merge(b, -1, Integer::sum) == 0) heap.add(g.idx().get(b));
            }
        }
        if (order.size() < nodes.size()) {
            Set<String> remaining = new HashSet<>(nodes);
            order.forEach(remaining::remove);
            throw new CycleException("cycle: " + cycle(nodes, g.out(), remaining));
        }
        return order;
    }

    /** Groups that can run in parallel: level 0 has no prerequisites; each level is in nodes order. */
    public static List<List<String>> topoLevels(List<String> nodes, List<List<String>> edges) {
        Graph g = graph(nodes, edges);
        List<String> level = new ArrayList<>();
        for (String n : nodes) if (g.indeg().get(n) == 0) level.add(n);
        List<List<String>> levels = new ArrayList<>();
        int done = 0;
        while (!level.isEmpty()) {
            levels.add(level);
            done += level.size();
            TreeSet<Integer> nxt = new TreeSet<>();
            for (String n : level) {
                for (String b : g.out().get(n)) if (g.indeg().merge(b, -1, Integer::sum) == 0) nxt.add(g.idx().get(b));
            }
            level = new ArrayList<>();
            for (int i : nxt) level.add(nodes.get(i));
        }
        if (done < nodes.size()) {
            Set<String> remaining = new HashSet<>();
            for (String n : nodes) if (g.indeg().get(n) > 0) remaining.add(n);
            throw new CycleException("cycle: " + cycle(nodes, g.out(), remaining));
        }
        return levels;
    }
}
