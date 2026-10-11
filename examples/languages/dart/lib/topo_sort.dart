// SPDX-License-Identifier: Apache-2.0
/// Deterministic topological sort (Kahn): among ready nodes, the one earliest in `nodes` goes first. [topoLevels] groups
/// nodes whose prerequisites are all in earlier levels. Edges are (before, after) pairs. A cycle throws [CycleException]
/// with a message like "cycle: a -> b -> a"; an unknown node in an edge or a duplicate node throws [ArgumentError].
library;

/// Thrown when the graph has a cycle; [message] is "cycle: a -> b -> a".
class CycleException implements Exception {
  /// "cycle: " followed by the cycle path.
  final String message;
  const CycleException(this.message);
  @override
  String toString() => message;
}

(Map<String, int>, Map<String, List<String>>, Map<String, int>) _graph(
    List<String> nodes, List<(String, String)> edges) {
  final idx = <String, int>{};
  for (var i = 0; i < nodes.length; i++) {
    if (idx.containsKey(nodes[i])) throw ArgumentError('duplicate node');
    idx[nodes[i]] = i;
  }
  final out = {for (final n in nodes) n: <String>[]};
  final indeg = {for (final n in nodes) n: 0};
  for (final (a, b) in edges) {
    if (!idx.containsKey(a) || !idx.containsKey(b)) throw ArgumentError('unknown node in edge $a -> $b');
    out[a]!.add(b);
    indeg[b] = indeg[b]! + 1;
  }
  return (idx, out, indeg);
}

String _cycle(List<String> nodes, Map<String, List<String>> out, Set<String> remaining) {
  // Nodes without a remaining successor cannot be on a cycle; dropping them keeps the walk from dead-ending.
  var changed = true;
  while (changed) {
    changed = false;
    for (final n in remaining.toList()) {
      if (!out[n]!.any(remaining.contains)) {
        remaining.remove(n);
        changed = true;
      }
    }
  }
  final start = nodes.firstWhere(remaining.contains);
  final path = [start];
  final seen = {start: 0};
  var cur = start;
  while (true) {
    final next = out[cur]!.firstWhere(remaining.contains);
    if (seen.containsKey(next)) return [...path.sublist(seen[next]!), next].join(' -> ');
    seen[next] = path.length;
    path.add(next);
    cur = next;
  }
}

/// Nodes in dependency order; ties broken by position in [nodes].
List<String> topoSort(List<String> nodes, List<(String, String)> edges) {
  final (idx, out, indeg) = _graph(nodes, edges);
  final ready = [
    for (var i = 0; i < nodes.length; i++)
      if (indeg[nodes[i]] == 0) i
  ];
  final order = <String>[];
  while (ready.isNotEmpty) {
    final n = nodes[ready.removeAt(0)];
    order.add(n);
    for (final b in out[n]!) {
      indeg[b] = indeg[b]! - 1;
      if (indeg[b] == 0) {
        final i = idx[b]!;
        var pos = 0;
        while (pos < ready.length && ready[pos] < i) {
          pos++;
        }
        ready.insert(pos, i);
      }
    }
  }
  if (order.length < nodes.length) {
    final done = order.toSet();
    throw CycleException('cycle: ${_cycle(nodes, out, {
          for (final n in nodes)
            if (!done.contains(n)) n
        })}');
  }
  return order;
}

/// Parallel groups: level 0 has no prerequisites; each level is in [nodes] order.
List<List<String>> topoLevels(List<String> nodes, List<(String, String)> edges) {
  final (idx, out, indeg) = _graph(nodes, edges);
  var level = [
    for (final n in nodes)
      if (indeg[n] == 0) n
  ];
  final levels = <List<String>>[];
  var done = 0;
  while (level.isNotEmpty) {
    levels.add(level);
    done += level.length;
    final next = <String>{};
    for (final n in level) {
      for (final b in out[n]!) {
        indeg[b] = indeg[b]! - 1;
        if (indeg[b] == 0) next.add(b);
      }
    }
    level = next.toList()..sort((a, b) => idx[a]!.compareTo(idx[b]!));
  }
  if (done < nodes.length) {
    throw CycleException('cycle: ${_cycle(nodes, out, {
          for (final n in nodes)
            if (indeg[n]! > 0) n
        })}');
  }
  return levels;
}
