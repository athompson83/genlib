# SPDX-License-Identifier: Apache-2.0
"""RFC 4180 CSV writing and parsing with spreadsheet formula-injection protection.

write_csv prefixes fields starting with = + - @ TAB or CR with a single quote (OWASP CSV
injection guidance) unless neutralize_formulas is False. parse_csv never adds or removes it.
"""
from collections.abc import Sequence

_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")
_QUOTE_CHARS = (",", '"', "\r", "\n")


def _field(value: str, neutralize: bool) -> str:
    if not isinstance(value, str):
        raise TypeError("CSV fields must be strings")
    if neutralize and value.startswith(_FORMULA_STARTS):
        value = "'" + value
    if any(c in value for c in _QUOTE_CHARS) or value.startswith(" ") or value.endswith(" "):
        return '"' + value.replace('"', '""') + '"'
    return value


def write_csv(rows: Sequence[Sequence[str]], neutralize_formulas: bool = True) -> str:
    """Rows of string fields to CSV text; every record ends with CRLF."""
    out = []
    for row in rows:
        if isinstance(row, str):
            raise TypeError("each row must be a sequence of strings")
        out.append(",".join(_field(v, neutralize_formulas) for v in row) + "\r\n")
    return "".join(out)


def parse_csv(text: str) -> list[list[str]]:
    """CSV text (CRLF or LF records, optional leading BOM) to rows of strings."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if text.startswith("\ufeff"):
        text = text[1:]
    rows: list[list[str]] = []
    row: list[str] = []
    i, n = 0, len(text)
    while i < n:
        if text[i] == '"':
            i += 1
            buf = []
            while True:
                j = text.find('"', i)
                if j < 0:
                    raise ValueError("unterminated quoted field")
                buf.append(text[i:j])
                if j + 1 < n and text[j + 1] == '"':
                    buf.append('"')
                    i = j + 2
                    continue
                i = j + 1
                break
            field = "".join(buf)
            if i < n and text[i] not in ",\r\n":
                raise ValueError(f"unexpected character after closing quote at offset {i}")
        else:
            j = i
            while j < n and text[j] not in ",\r\n":
                if text[j] == '"':
                    raise ValueError(f'unexpected " in unquoted field at offset {j}')
                j += 1
            field, i = text[i:j], j
        row.append(field)
        if i >= n:
            rows.append(row)
            break
        c = text[i]
        if c == ",":
            i += 1
            if i >= n:
                row.append("")
                rows.append(row)
            continue
        if c == "\r":
            if i + 1 < n and text[i + 1] == "\n":
                i += 2
            else:
                raise ValueError(f"bare CR at offset {i}")
        else:
            i += 1
        rows.append(row)
        row = []
    return rows
