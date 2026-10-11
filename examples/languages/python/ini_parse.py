# SPDX-License-Identifier: Apache-2.0
"""INI files: the common subset used by git config, PHP and Python configparser defaults.

parse_ini returns an ordered dict of sections, each an ordered dict of str values; keys before any
section go in section '' (always present, first). Lines are trimmed; blank lines and lines starting
with ';' or '#' are skipped. '[name]' starts a section (trimmed, non-empty, no ']'); a repeated
section continues the earlier one. 'key = value' or 'key: value' splits at the first '=' or ':'. A
value wrapped in double quotes is unquoted with escapes \\\\ \\" \\n \\t; otherwise an inline comment
starts at whitespace followed by ';' or '#'. A bare 'key' has the value ''. Duplicate keys: the last
value wins and keeps the first position. Case is preserved. CRLF is accepted. Errors name the
1-based line. stringify_ini writes section '' first and quotes values that need it.
"""


class IniError(ValueError):
    """Raised for a malformed INI line (the message starts with 'line N:')."""


def _unquote(val: str, no: int) -> str:
    buf = []
    j = 1
    while j < len(val):
        c = val[j]
        if c == "\\" and j + 1 < len(val):
            buf.append({"n": "\n", "t": "\t"}.get(val[j + 1], val[j + 1]))
            j += 2
            continue
        if c == '"':
            return "".join(buf)
        buf.append(c)
        j += 1
    raise IniError(f"line {no}: unterminated quote")


def parse_ini(text: str) -> dict[str, dict[str, str]]:
    """Parse INI text into {section: {key: value}} with section '' first."""
    out: dict[str, dict[str, str]] = {"": {}}
    cur = out[""]
    for no, line in enumerate(text.replace("\r\n", "\n").split("\n"), 1):
        s = line.strip()
        if not s or s[0] in ";#":
            continue
        if s[0] == "[":
            if not s.endswith("]"):
                raise IniError(f"line {no}: unterminated section header")
            name = s[1:-1].strip()
            if not name or "]" in name:
                raise IniError(f"line {no}: bad section name")
            cur = out.setdefault(name, {})
            continue
        idx = [i for i in (s.find("="), s.find(":")) if i >= 0]
        if idx:
            i = min(idx)
            key, val = s[:i].strip(), s[i + 1:].strip()
        else:
            key, val = s, ""
        if not key:
            raise IniError(f"line {no}: empty key")
        if val.startswith('"'):
            val = _unquote(val, no)
        else:
            cut = [k for k in (val.find(" ;"), val.find(" #"), val.find("\t;"), val.find("\t#")) if k >= 0]
            if cut:
                val = val[:min(cut)].rstrip()
        cur[key] = val
    return out


def _quote(v: str) -> str:
    if v == "" or v != v.strip() or any(c in v for c in ';#"\\\n\t'):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t") + '"'
    return v


def stringify_ini(data: dict[str, dict[str, str]]) -> str:
    """Write {section: {key: value}} as INI text: section '' first, blocks separated by one blank line."""
    blocks = []
    top = data.get("", {})
    if top:
        blocks.append("\n".join(f"{k} = {_quote(v)}" for k, v in top.items()))
    for name, kv in data.items():
        if name == "":
            continue
        blocks.append("\n".join([f"[{name}]"] + [f"{k} = {_quote(v)}" for k, v in kv.items()]))
    return "\n\n".join(blocks) + ("\n" if blocks else "")
