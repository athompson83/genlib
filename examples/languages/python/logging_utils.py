"""Structured logs with explicit field allowlisting; no exception or secret dumping."""
import json
from datetime import datetime, timezone

ALLOWED = frozenset({"event", "status", "duration_ms", "request_id", "component"})

def log_event(event: str, *, fields=None, writer=None) -> str:
    if not isinstance(event, str) or not event or len(event) > 80:
        raise ValueError("event must be a short name")
    values = {} if fields is None else dict(fields)
    unknown = set(values) - ALLOWED
    if unknown:
        raise ValueError("unapproved log fields")
    if any(not isinstance(v, (str, int, float, bool, type(None))) for v in values.values()):
        raise ValueError("log fields must be scalar")
    record = {"timestamp": datetime.now(timezone.utc).isoformat(), "event": event, **values}
    result = json.dumps(record, separators=(",", ":"), allow_nan=False)
    if writer is not None:
        writer(result)
    return result
