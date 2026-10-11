# SPDX-License-Identifier: Apache-2.0
from contextlib import contextmanager
import re
import math
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
ALLOWED = {'operation', 'request.id', 'db.system.name', 'error.type', 'http.response.status_code'}
def safe_attributes(values):
    return {key: (value[:128] if isinstance(value, str) else value)
            for key, value in values.items()
            if key in ALLOWED and isinstance(value, (str, int, float)) and not isinstance(value, bool)
            and (not isinstance(value, float) or math.isfinite(value))}
@contextmanager
def operation(tracer, name, attributes=None):
    if not re.fullmatch(r'[a-z][a-z0-9._-]{0,79}', name):
        raise ValueError('Static operation code required')
    with tracer.start_as_current_span(name, attributes=safe_attributes(attributes or {}),
                                     record_exception=False, set_status_on_exception=False) as span:
        try:
            yield span
        except Exception as error:
            span.set_status(Status(StatusCode.ERROR))
            span.set_attribute('error.type', type(error).__name__[:64])
            raise
def correlated_event(event, attributes=None):
    if not re.fullmatch(r'[a-z][a-z0-9._-]{0,79}', event):
        raise ValueError('Static event code required')
    record = {'event': event, **safe_attributes(attributes or {})}
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        record.update(trace_id=format(context.trace_id, '032x'), span_id=format(context.span_id, '016x'))
    return record
