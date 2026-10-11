# SPDX-License-Identifier: Apache-2.0
import re
import libcst as cst
from libcst.helpers import get_full_name_for_node

class ImportMigration(cst.CSTTransformer):
    def __init__(self, before: str, after: str):
        if not all(re.fullmatch(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*", value) for value in (before, after)):
            raise ValueError("Expected absolute dotted Python module names")
        self.before, self.after = before, after

    def leave_ImportFrom(self, original_node, updated_node):
        # Relative imports depend on package location and are deliberately excluded.
        if not updated_node.relative and get_full_name_for_node(updated_node.module) == self.before:
            return updated_node.with_changes(module=cst.parse_expression(self.after))
        return updated_node

def migrate(source: str, before: str, after: str) -> str:
    return cst.parse_module(source).visit(ImportMigration(before, after)).code
