"""Bounded HTTPS JSON GET client. Server-side use only."""
import json
import ssl
import urllib.error
import urllib.parse
import urllib.request

class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)

def get_json(url: str, *, timeout: float = 10.0, max_bytes: int = 1_000_000, opener=None):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("HTTPS URL without embedded credentials or fragment required")
    if not 0 < timeout <= 60 or not 0 < max_bytes <= 5_000_000:
        raise ValueError("timeout or response size outside permitted bounds")
    request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    if opener is None:
        # Redirects may leave the approved origin. Disable them unless a caller
        # implements an explicit destination allowlist.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context()), NoRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            status = response.status
            if not 200 <= status < 300:
                raise ApiError(status, "upstream request failed")
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise ApiError(status, "response exceeds maximum size")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        raise ApiError(exc.code, "upstream request failed") from None
