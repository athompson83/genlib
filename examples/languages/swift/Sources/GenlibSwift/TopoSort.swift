// SPDX-License-Identifier: Apache-2.0
// Deterministic topological sort (Kahn): among ready nodes, the one earliest in `nodes` goes first. levels groups nodes
// whose prerequisites are all in earlier levels. Edges are (before, after) pairs. A cycle throws TopoSortError.cycle with
// the message "cycle: a -> b -> a"; an unknown node in an edge or a duplicate node throws TopoSortError.invalidGraph.

public enum TopoSortError: Error, Equatable {
    /// Full message, e.g. "cycle: a -> b -> a".
    case cycle(String)
    case invalidGraph(String)
}

public enum TopoSort {
    private struct Graph { var idx: [String: Int]; var out: [[Int]]; var indeg: [Int] }

    private static func graph(_ nodes: [String], _ edges: [(String, String)]) throws -> Graph {
        var idx: [String: Int] = [:]
        for (i, n) in nodes.enumerated() {
            if idx[n] != nil { throw TopoSortError.invalidGraph("duplicate node") }
            idx[n] = i
        }
        var out = Array(repeating: [Int](), count: nodes.count), indeg = Array(repeating: 0, count: nodes.count)
        for (a, b) in edges {
            guard let ia = idx[a], let ib = idx[b] else { throw TopoSortError.invalidGraph("unknown node in edge \(a) -> \(b)") }
            out[ia].append(ib); indeg[ib] += 1
        }
        return Graph(idx: idx, out: out, indeg: indeg)
    }

    private static func cycle(_ nodes: [String], _ out: [[Int]], _ remaining0: Set<Int>) -> TopoSortError {
        // Nodes without a remaining successor cannot be on a cycle; dropping them keeps the walk from dead-ending.
        var remaining = remaining0, changed = true
        while changed {
            changed = false
            for n in remaining where !out[n].contains(where: remaining.contains) { remaining.remove(n); changed = true }
        }
        let start = (0..<nodes.count).first(where: remaining.contains)!
        var path = [start], seen = [start: 0], cur = start
        while true {
            let next = out[cur].first(where: remaining.contains)!
            if let at = seen[next] { return .cycle("cycle: " + (path[at...] + [next]).map { nodes[$0] }.joined(separator: " -> ")) }
            seen[next] = path.count; path.append(next); cur = next
        }
    }

    /// Nodes in dependency order; ties broken by position in nodes.
    public static func sort(_ nodes: [String], _ edges: [(String, String)]) throws -> [String] {
        var g = try graph(nodes, edges)
        var ready = (0..<nodes.count).filter { g.indeg[$0] == 0 }, order: [Int] = []
        while !ready.isEmpty {
            let n = ready.removeFirst()
            order.append(n)
            for b in g.out[n] {
                g.indeg[b] -= 1
                if g.indeg[b] == 0 { ready.insert(b, at: ready.firstIndex(where: { $0 > b }) ?? ready.count) }
            }
        }
        if order.count < nodes.count { throw cycle(nodes, g.out, Set(0..<nodes.count).subtracting(order)) }
        return order.map { nodes[$0] }
    }

    /// Parallel groups: level 0 has no prerequisites; each level is in nodes order.
    public static func levels(_ nodes: [String], _ edges: [(String, String)]) throws -> [[String]] {
        var g = try graph(nodes, edges)
        var level = (0..<nodes.count).filter { g.indeg[$0] == 0 }, levels: [[String]] = [], done = 0
        while !level.isEmpty {
            levels.append(level.map { nodes[$0] }); done += level.count
            var next = Set<Int>()
            for n in level { for b in g.out[n] { g.indeg[b] -= 1; if g.indeg[b] == 0 { next.insert(b) } } }
            level = next.sorted()
        }
        if done < nodes.count { throw cycle(nodes, g.out, Set((0..<nodes.count).filter { g.indeg[$0] > 0 })) }
        return levels
    }
}
