import unittest
from config import load_config

class ConfigTests(unittest.TestCase):
    def test_valid(self):
        config=load_config({"SERVICE_URL":"https://example.org/api","REQUEST_TIMEOUT":"5"})
        self.assertEqual(config.request_timeout,5)
    def test_rejects_invalid(self):
        for env in ({}, {"SERVICE_URL":"http://example.org"}, {"SERVICE_URL":"https://a@b.com"}, {"SERVICE_URL":"https://example.org","REQUEST_TIMEOUT":"0"}, {"SERVICE_URL":"https://example.org","REQUEST_TIMEOUT":"x"}):
            with self.assertRaises(ValueError): load_config(env)
