import io
import unittest
from http_client import get_json, ApiError

class FakeResponse:
    status = 200
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, n): return b'{"ok":true}'[:n]

class FakeOpener:
    def open(self, request, timeout):
        assert request.full_url == "https://example.org/data"
        assert timeout == 2
        return FakeResponse()

class HttpClientTests(unittest.TestCase):
    def test_json(self):
        self.assertEqual(get_json("https://example.org/data", timeout=2, opener=FakeOpener()), {"ok": True})
    def test_rejects_insecure_and_embedded_credentials(self):
        for url in ("http://example.org", "https://user:pass@example.org", "file:///etc/passwd"):
            with self.assertRaises(ValueError): get_json(url, opener=FakeOpener())
    def test_rejects_oversized(self):
        with self.assertRaises(ApiError): get_json("https://example.org/data", timeout=2, max_bytes=2, opener=FakeOpener())
if __name__ == "__main__": unittest.main()
