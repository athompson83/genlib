import unittest
from pagination import bounded_limit, decode_cursor, paginate

class PaginationTests(unittest.TestCase):
    def test_pages(self):
        first = paginate([1, 2, 3], limit=2)
        self.assertEqual(first.items, (1, 2))
        self.assertEqual(first.next_cursor, "2")
        second = paginate([1, 2, 3], limit=2, cursor=first.next_cursor)
        self.assertEqual(second.items, (3,))
        self.assertIsNone(second.next_cursor)

    def test_bounds(self):
        for bad in (0, -1, 101, True):
            with self.assertRaises((TypeError, ValueError)):
                bounded_limit(bad)
        for bad in ("-1", " 2", "2.0", "abc", "999999999"):
            with self.assertRaises(ValueError):
                decode_cursor(bad)

if __name__ == "__main__":
    unittest.main()
