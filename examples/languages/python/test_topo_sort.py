# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from topo_sort import CycleError, topo_levels, topo_sort

SORT = [
    [['a', 'b', 'c', 'd'], [['c', 'a'], ['a', 'd']], ['b', 'c', 'a', 'd']],
    [['x'], [], ['x']],
    [['a', 'b', 'c'], [], ['a', 'b', 'c']],
    [['shirt', 'tie', 'jacket', 'belt', 'trousers', 'shoes', 'socks', 'watch'], [['shirt', 'tie'], ['tie', 'jacket'], ['shirt', 'belt'], ['belt', 'jacket'], ['trousers', 'belt'], ['trousers', 'shoes'], ['socks', 'shoes']], ['shirt', 'tie', 'trousers', 'belt', 'jacket', 'socks', 'shoes', 'watch']],
    [['a', 'b'], [['a', 'b'], ['a', 'b']], ['a', 'b']],
]
LEVELS = [
    [['a', 'b', 'c', 'd'], [['c', 'a'], ['a', 'd']], [['b', 'c'], ['a'], ['d']]],
    [['x'], [], [['x']]],
    [['a', 'b', 'c'], [], [['a', 'b', 'c']]],
    [['shirt', 'tie', 'jacket', 'belt', 'trousers', 'shoes', 'socks', 'watch'], [['shirt', 'tie'], ['tie', 'jacket'], ['shirt', 'belt'], ['belt', 'jacket'], ['trousers', 'belt'], ['trousers', 'shoes'], ['socks', 'shoes']], [['shirt', 'trousers', 'socks', 'watch'], ['tie', 'belt', 'shoes'], ['jacket']]],
    [['a', 'b'], [['a', 'b'], ['a', 'b']], [['a'], ['b']]],
]
CYCLE = [
    [['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'b']], 'cycle: b -> c -> b'],
    [['a'], [['a', 'a']], 'cycle: a -> a'],
    [['p', 'q', 'r', 's'], [['p', 'q'], ['q', 'r'], ['r', 'p'], ['r', 's']], 'cycle: p -> q -> r -> p'],
]
INVALID = [
    [['a'], [['a', 'b']]],
    [['a', 'a'], []],
]


class TopoSortTest(unittest.TestCase):
    def test_sort(self):
        for nodes, edges, expected in SORT:
            self.assertEqual(topo_sort(nodes, edges), expected, nodes)

    def test_levels(self):
        for nodes, edges, expected in LEVELS:
            self.assertEqual(topo_levels(nodes, edges), expected, nodes)

    def test_cycle(self):
        for nodes, edges, message in CYCLE:
            for fn in (topo_sort, topo_levels):
                with self.assertRaises(CycleError) as ctx:
                    fn(nodes, edges)
                self.assertEqual(str(ctx.exception), message)

    def test_cycle_after_dead_end(self):
        # nodes only downstream of a cycle are dropped before the walk
        cases = [
            (["z", "a", "b"], [["a", "z"], ["a", "b"], ["b", "a"]], "cycle: a -> b -> a"),
            (["s", "x", "y", "d"], [["x", "d"], ["x", "y"], ["y", "x"], ["d", "s"]], "cycle: x -> y -> x"),
        ]
        for nodes, edges, message in cases:
            for fn in (topo_sort, topo_levels):
                with self.assertRaises(CycleError) as ctx:
                    fn(nodes, edges)
                self.assertEqual(str(ctx.exception), message)

    def test_invalid(self):
        for nodes, edges in INVALID:
            for fn in (topo_sort, topo_levels):
                with self.assertRaises(ValueError, msg=(nodes, edges)):
                    fn(nodes, edges)


if __name__ == "__main__":
    unittest.main()
