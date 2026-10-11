# SPDX-License-Identifier: Apache-2.0
"""Runs the same conformance fixture through the generated foreign-function boundary."""
from pathlib import Path
import json
import sys
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'generated/python'))
from genlib_inventory_core import apply_change, Change, InventoryError, normalize_title
fixture = json.loads((root / 'fixtures/conformance.json').read_text())
items = []
for change in fixture['changes']:
    kind = change['kind']
    if kind == 'add': operation = Change.ADD(id=change['id'], title=change['title'])
    elif kind == 'complete': operation = Change.COMPLETE(id=change['id'], completed=change['completed'])
    else: operation = Change.REMOVE(id=change['id'])
    items = apply_change(items, operation)
assert [dict(id=x.id, title=x.title, completed=x.completed) for x in items] == fixture['expected']
try: normalize_title(' ')
except InventoryError: pass
else: raise AssertionError('FFI must preserve validation errors')
print('Python FFI conformance and typed error checks passed')
