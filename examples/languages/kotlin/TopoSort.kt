// SPDX-License-Identifier: Apache-2.0

import java.util.PriorityQueue
import java.util.TreeSet

/**
 * Deterministic topological sort (Kahn): among ready nodes the one earliest in the input list goes first. Edges are
 * (before, after) pairs. Unknown nodes and duplicates throw IllegalArgumentException; a cycle throws CycleException
 * whose message is "cycle: a -> b -> a".
 */
object TopoSort {
    /** Thrown when the graph has a cycle; the message names one cycle. */
    class CycleException(message: String) : IllegalArgumentException(message)

    private class Graph(val idx: Map<String, Int>, val out: Map<String, MutableList<String>>, val indeg: MutableMap<String, Int>)

    private fun graph(nodes: List<String>, edges: List<Pair<String, String>>): Graph {
        val idx = HashMap<String, Int>()
        val out = HashMap<String, MutableList<String>>()
        val indeg = HashMap<String, Int>()
        nodes.forEachIndexed { i, n ->
            require(idx.put(n, i) == null) { "duplicate node" }
            out[n] = mutableListOf()
            indeg[n] = 0
        }
        for ((a, b) in edges) {
            require(a in idx && b in idx) { "unknown node in edge $a -> $b" }
            out.getValue(a).add(b)
            indeg[b] = indeg.getValue(b) + 1
        }
        return Graph(idx, out, indeg)
    }

    private fun cycle(nodes: List<String>, out: Map<String, List<String>>, remainingIn: Set<String>): String {
        // Drop nodes that are only downstream of a cycle, so every remaining node has a remaining outgoing edge.
        val remaining = remainingIn.toMutableSet()
        var changed = true
        while (changed) {
            changed = false
            for (n in nodes) if (n in remaining && out.getValue(n).none { it in remaining }) { remaining.remove(n); changed = true }
        }
        val start = nodes.first { it in remaining }
        val path = mutableListOf(start)
        val seen = hashMapOf(start to 0)
        var cur = start
        while (true) {
            val nxt = out.getValue(cur).first { it in remaining }
            seen[nxt]?.let { return (path.subList(it, path.size) + nxt).joinToString(" -> ") }
            seen[nxt] = path.size
            path.add(nxt)
            cur = nxt
        }
    }

    /** Nodes in dependency order; ties go to the node earliest in nodes. */
    fun topoSort(nodes: List<String>, edges: List<Pair<String, String>>): List<String> {
        val g = graph(nodes, edges)
        val heap = PriorityQueue<Int>()
        for (n in nodes) if (g.indeg.getValue(n) == 0) heap.add(g.idx.getValue(n))
        val order = mutableListOf<String>()
        while (heap.isNotEmpty()) {
            val n = nodes[heap.poll()]
            order.add(n)
            for (b in g.out.getValue(n)) {
                g.indeg[b] = g.indeg.getValue(b) - 1
                if (g.indeg.getValue(b) == 0) heap.add(g.idx.getValue(b))
            }
        }
        if (order.size < nodes.size) throw CycleException("cycle: " + cycle(nodes, g.out, nodes.toSet() - order.toSet()))
        return order
    }

    /** Groups that can run in parallel: level 0 has no prerequisites; each level is in nodes order. */
    fun topoLevels(nodes: List<String>, edges: List<Pair<String, String>>): List<List<String>> {
        val g = graph(nodes, edges)
        var level = nodes.filter { g.indeg.getValue(it) == 0 }
        val levels = mutableListOf<List<String>>()
        var done = 0
        while (level.isNotEmpty()) {
            levels.add(level)
            done += level.size
            val nxt = TreeSet<Int>()
            for (n in level) for (b in g.out.getValue(n)) {
                g.indeg[b] = g.indeg.getValue(b) - 1
                if (g.indeg.getValue(b) == 0) nxt.add(g.idx.getValue(b))
            }
            level = nxt.map { nodes[it] }
        }
        if (done < nodes.size) throw CycleException("cycle: " + cycle(nodes, g.out, nodes.filter { g.indeg.getValue(it) > 0 }.toSet()))
        return levels
    }
}
