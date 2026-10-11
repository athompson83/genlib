# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from pagination_window import PaginationError, page_count, page_offset, page_window

PAGE_COUNT = [
    [0, 10, 1],
    [1, 10, 1],
    [10, 10, 1],
    [11, 10, 2],
    [999, 25, 40],
    [5, 1, 5],
]

OFFSET = [
    [1, 20, 0],
    [3, 20, 40],
]

WINDOW = [
    [1, 1, 1, 1, [1]],
    [1, 2, 1, 1, [1, 2]],
    [2, 2, 1, 1, [1, 2]],
    [1, 3, 1, 1, [1, 2, 3]],
    [2, 3, 1, 1, [1, 2, 3]],
    [3, 3, 1, 1, [1, 2, 3]],
    [1, 5, 1, 1, [1, 2, 3, 4, 5]],
    [2, 5, 1, 1, [1, 2, 3, 4, 5]],
    [3, 5, 1, 1, [1, 2, 3, 4, 5]],
    [4, 5, 1, 1, [1, 2, 3, 4, 5]],
    [5, 5, 1, 1, [1, 2, 3, 4, 5]],
    [1, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [2, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [3, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [4, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [5, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [6, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [7, 7, 1, 1, [1, 2, 3, 4, 5, 6, 7]],
    [1, 8, 1, 1, [1, 2, 3, 4, 5, 'gap', 8]],
    [2, 8, 1, 1, [1, 2, 3, 4, 5, 'gap', 8]],
    [3, 8, 1, 1, [1, 2, 3, 4, 5, 'gap', 8]],
    [4, 8, 1, 1, [1, 2, 3, 4, 5, 'gap', 8]],
    [6, 8, 1, 1, [1, 'gap', 4, 5, 6, 7, 8]],
    [7, 8, 1, 1, [1, 'gap', 4, 5, 6, 7, 8]],
    [8, 8, 1, 1, [1, 'gap', 4, 5, 6, 7, 8]],
    [1, 10, 1, 1, [1, 2, 3, 4, 5, 'gap', 10]],
    [2, 10, 1, 1, [1, 2, 3, 4, 5, 'gap', 10]],
    [3, 10, 1, 1, [1, 2, 3, 4, 5, 'gap', 10]],
    [4, 10, 1, 1, [1, 2, 3, 4, 5, 'gap', 10]],
    [5, 10, 1, 1, [1, 'gap', 4, 5, 6, 'gap', 10]],
    [8, 10, 1, 1, [1, 'gap', 6, 7, 8, 9, 10]],
    [9, 10, 1, 1, [1, 'gap', 6, 7, 8, 9, 10]],
    [10, 10, 1, 1, [1, 'gap', 6, 7, 8, 9, 10]],
    [1, 20, 1, 1, [1, 2, 3, 4, 5, 'gap', 20]],
    [2, 20, 1, 1, [1, 2, 3, 4, 5, 'gap', 20]],
    [3, 20, 1, 1, [1, 2, 3, 4, 5, 'gap', 20]],
    [4, 20, 1, 1, [1, 2, 3, 4, 5, 'gap', 20]],
    [10, 20, 1, 1, [1, 'gap', 9, 10, 11, 'gap', 20]],
    [18, 20, 1, 1, [1, 'gap', 16, 17, 18, 19, 20]],
    [19, 20, 1, 1, [1, 'gap', 16, 17, 18, 19, 20]],
    [20, 20, 1, 1, [1, 'gap', 16, 17, 18, 19, 20]],
    [1, 100, 1, 1, [1, 2, 3, 4, 5, 'gap', 100]],
    [2, 100, 1, 1, [1, 2, 3, 4, 5, 'gap', 100]],
    [3, 100, 1, 1, [1, 2, 3, 4, 5, 'gap', 100]],
    [4, 100, 1, 1, [1, 2, 3, 4, 5, 'gap', 100]],
    [50, 100, 1, 1, [1, 'gap', 49, 50, 51, 'gap', 100]],
    [98, 100, 1, 1, [1, 'gap', 96, 97, 98, 99, 100]],
    [99, 100, 1, 1, [1, 'gap', 96, 97, 98, 99, 100]],
    [100, 100, 1, 1, [1, 'gap', 96, 97, 98, 99, 100]],
    [10, 20, 2, 1, [1, 'gap', 8, 9, 10, 11, 12, 'gap', 20]],
    [10, 20, 0, 1, [1, 'gap', 10, 'gap', 20]],
    [10, 20, 1, 2, [1, 2, 'gap', 9, 10, 11, 'gap', 19, 20]],
    [1, 20, 2, 2, [1, 2, 3, 4, 5, 6, 7, 8, 'gap', 19, 20]],
    [20, 20, 2, 2, [1, 2, 'gap', 13, 14, 15, 16, 17, 18, 19, 20]],
    [50, 100, 3, 3, [1, 2, 3, 'gap', 47, 48, 49, 50, 51, 52, 53, 'gap', 98, 99, 100]],
]

INVALID_WINDOW = [
    [0, 10, 1, 1],
    [11, 10, 1, 1],
    [1, 0, 1, 1],
    [1, 10, 6, 1],
    [1, 10, 1, 0],
]

INVALID_PAGE_COUNT = [
    [-1, 10],
    [5, 0],
    [5, 1001],
]


def gaps_as_none(items):
    return [None if x == "gap" else x for x in items]


class PaginationWindowTest(unittest.TestCase):
    def test_counts_and_offsets(self):
        for total, per_page, expected in PAGE_COUNT:
            self.assertEqual(page_count(total, per_page), expected, (total, per_page))
        for page, per_page, expected in OFFSET:
            self.assertEqual(page_offset(page, per_page), expected, (page, per_page))

    def test_window(self):
        for current, total, siblings, boundaries, expected in WINDOW:
            self.assertEqual(page_window(current, total, siblings, boundaries), gaps_as_none(expected),
                             (current, total, siblings, boundaries))

    def test_invalid(self):
        for args in INVALID_WINDOW:
            with self.assertRaises(PaginationError, msg=args):
                page_window(*args)
        for args in INVALID_PAGE_COUNT:
            with self.assertRaises(PaginationError, msg=args):
                page_count(*args)
        with self.assertRaises(PaginationError):
            page_offset(0, 10)


if __name__ == "__main__":
    unittest.main()
