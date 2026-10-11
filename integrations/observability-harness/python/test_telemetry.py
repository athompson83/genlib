# SPDX-License-Identifier: Apache-2.0
import json
import unittest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.sampling import ALWAYS_ON
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from telemetry import operation, correlated_event
class TelemetryTests(unittest.TestCase):
    def test_redaction_and_correlation(self):
        exporter = InMemorySpanExporter(); provider = TracerProvider(sampler=ALWAYS_ON)
        provider.add_span_processor(SimpleSpanProcessor(exporter)); tracer = provider.get_tracer('genlib-fixture')
        try:
            with operation(tracer, 'inventory.list', {'request.id': 'one', 'authorization': 'private-token'}):
                event = correlated_event('inventory.loaded', {'password': 'private-password'})
            with self.assertRaises(ValueError):
                with operation(tracer, 'inventory.fail'):
                    raise ValueError('private-error-payload')
            spans = exporter.get_finished_spans()
            self.assertEqual(event['trace_id'], format(spans[0].context.trace_id, '032x'))
            self.assertNotIn('authorization', spans[0].attributes)
            self.assertEqual(len(spans[1].events), 0)
            self.assertNotIn('private', json.dumps(event))
        finally: provider.shutdown()
if __name__ == '__main__': unittest.main()
