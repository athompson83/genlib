# SPDX-License-Identifier: Apache-2.0
"""Parse .env files into an ordered dict, with optional ${NAME} / ${NAME:-default} expansion.

Blank and '#' lines are skipped and an ``export `` prefix is allowed. Keys match
``[A-Za-z_][A-Za-z0-9_.]*``. Unquoted values are trimmed and `` #`` starts an inline comment;
single-quoted values are literal; double-quoted values may span lines and understand
``\\n \\r \\t \\" \\\\ \\$``. A later key overrides an earlier one but keeps its first position.
Expansion applies to unquoted and double-quoted values, looking up earlier keys first, then ``vars``;
an empty value counts as missing for ``:-`` and an escaped ``\\$`` is never expanded.
Errors raise DotenvError with the 1-based line number.
"""
import re


class DotenvError(ValueError):
    """Raised for malformed .env input; the message starts with 'line N:'."""


_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_.]*\Z")
_ESC = {"n": "\n", "r": "\r", "t": "\t", '"': '"', "\\": "\\", "$": "\x00$"}
_REF = re.compile(r"(?<!\x00)\$\{([A-Za-z_][A-Za-z0-9_.]*)(:-([^}]*))?\}")


def parse_dotenv(text: str, expand: bool = False, vars: dict[str, str] | None = None) -> dict[str, str]:
    """Parse .env text into an ordered {key: value}; expand=True resolves ${NAME} and ${NAME:-default}."""
    env = vars or {}
    lines = text.replace("\r\n", "\n").split("\n")
    out: dict[str, str] = {}
    kinds: dict[str, str] = {}
    i = 0
    while i < len(lines):
        no = i + 1
        s = lines[i].strip()
        i += 1
        if not s or s.startswith("#"):
            continue
        if s.startswith("export "):
            s = s[7:].lstrip()
        if "=" not in s:
            raise DotenvError(f"line {no}: expected KEY=VALUE")
        key, rest = s.split("=", 1)
        key = key.strip()
        if not _KEY.match(key):
            raise DotenvError(f"line {no}: invalid key {key!r}")
        rest = rest.lstrip()
        if rest.startswith("'"):
            end = rest.find("'", 1)
            if end < 0:
                raise DotenvError(f"line {no}: unterminated single quote")
            val, tail, kind = rest[1:end], rest[end + 1:], "single"
        elif rest.startswith('"'):
            buf, val, j = rest[1:], "", 0
            while True:
                closed = False
                while j < len(buf):
                    c = buf[j]
                    if c == "\\" and j + 1 < len(buf):
                        val += _ESC.get(buf[j + 1], "\\" + buf[j + 1])
                        j += 2
                        continue
                    if c == '"':
                        closed = True
                        break
                    val += c
                    j += 1
                if closed:
                    tail = buf[j + 1:]
                    break
                if i >= len(lines):
                    raise DotenvError(f"line {no}: unterminated double quote")
                val += "\n"
                buf, j = lines[i], 0
                i += 1
            kind = "double"
        else:
            m = re.search(r"\s#", rest)
            val, tail, kind = (rest[:m.start()] if m else rest).strip(), "", "plain"
        t = tail.strip()
        if t and not t.startswith("#"):
            raise DotenvError(f"line {no}: unexpected text after closing quote")
        out[key] = val
        kinds[key] = kind
    if expand:
        done: dict[str, str] = {}
        for k, v in out.items():
            if kinds[k] != "single":
                def rep(m: re.Match) -> str:
                    got = done.get(m.group(1), env.get(m.group(1)))
                    if got not in (None, ""):
                        return got
                    return m.group(3) if m.group(3) is not None else ""
                v = _REF.sub(rep, v)
            done[k] = v
        out = done
    return {k: v.replace("\x00$", "$") for k, v in out.items()}
