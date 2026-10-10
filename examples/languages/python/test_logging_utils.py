import unittest
from logging_utils import log_event
class LogTests(unittest.TestCase):
    def test_allowed(self):
        self.assertIn('"event":"started"',log_event("started",fields={"component":"api"}))
    def test_secrets_refused(self):
        for field in ("token","password","authorization"):
            with self.assertRaises(ValueError): log_event("started",fields={field:"secret"})
