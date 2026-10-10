"""Fail-closed environment configuration with no implicit secrets or logging."""
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class AppConfig:
    service_url: str
    request_timeout: int

def load_config(env=None) -> AppConfig:
    values = os.environ if env is None else env
    url = values.get("SERVICE_URL", "")
    if not url.startswith("https://") or len(url) > 2048 or "@" in url.split("/")[2] or "#" in url:
        raise ValueError("SERVICE_URL must be an approved HTTPS URL")
    try:
        timeout = int(values.get("REQUEST_TIMEOUT", "10"))
    except (TypeError, ValueError):
        raise ValueError("REQUEST_TIMEOUT must be an integer") from None
    if not 1 <= timeout <= 60:
        raise ValueError("REQUEST_TIMEOUT outside supported range")
    return AppConfig(service_url=url, request_timeout=timeout)
