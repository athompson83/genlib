# SPDX-License-Identifier: Apache-2.0
"""Minimal, logic-less templates (a Mustache subset): ``Hello {{ user.name }}!``.

``{{ path }}`` inserts the value at a dotted path (names and ``[n]``) HTML-escaped (& < > " ' become
&amp; &lt; &gt; &quot; &#39;) unless escape is false; ``{{{ path }}}`` inserts it raw. Whitespace inside
the braces is ignored and missing values render as ''. ``{{# path }}..{{/ path }}`` renders its body
once per item of a non-empty list ('.' is the item; names are looked up in the item first, then the
outer scopes), once for any other truthy value (a dict also becomes the innermost scope);
``{{^ path }}..{{/ path }}`` renders when the value is missing or falsy; ``{{! comment }}`` is dropped.
Values: None '', booleans 'true'/'false', integers in decimal, integral floats without '.0', other
floats via repr, strings as is; lists and dicts raise. Malformed tags, bad names, mismatched or
unclosed sections and a stray '{{' raise TemplateError. No partials, delimiters or lambdas.
"""

import re


class TemplateError(ValueError):
    """Raised for a malformed template or a value that cannot be rendered."""


_NAME = re.compile(r"\.|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9][0-9]*)\])*")
_TAG = re.compile(r"\{\{(\{)?\s*([#^/!]?)\s*(.*?)\s*(\})?\}\}", re.DOTALL)
_PART = re.compile(r"[A-Za-z_][A-Za-z0-9_-]*|\[\d+\]")


def _escape(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


def _format(v) -> str:
    if v is None:
        return ""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    if isinstance(v, str):
        return v
    raise TemplateError("cannot render a list or object")


def _lookup(stack: list, path: str):
    if path == ".":
        return stack[-1]
    parts = _PART.findall(path)
    first = parts[0]
    for scope in reversed(stack):
        if isinstance(scope, dict) and first in scope:
            cur = scope[first]
            for p in parts[1:]:
                if p.startswith("["):
                    i = int(p[1:-1])
                    cur = cur[i] if isinstance(cur, list) and i < len(cur) else None
                else:
                    cur = cur.get(p) if isinstance(cur, dict) else None
                if cur is None:
                    return None
            return cur
    return None


def _parse(t: str) -> list:
    pos = 0
    root: list = []
    stack: list = [("", root)]
    for m in _TAG.finditer(t):
        if m.start() > pos:
            stack[-1][1].append(("text", t[pos:m.start()]))
        triple, sig, name, close = m.group(1), m.group(2), m.group(3), m.group(4)
        if sig == "!":
            pos = m.end()
            continue
        if bool(triple) != bool(close) or (triple and sig):
            raise TemplateError("bad triple-brace tag")
        if not _NAME.fullmatch(name):
            raise TemplateError(f"bad tag name {name!r}")
        if sig in ("#", "^"):
            node = ("section" if sig == "#" else "inverted", name, [])
            stack[-1][1].append(node)
            stack.append((name, node[2]))
        elif sig == "/":
            if len(stack) == 1 or stack[-1][0] != name:
                raise TemplateError("mismatched close tag")
            stack.pop()
        else:
            stack[-1][1].append(("raw" if triple else "var", name))
        pos = m.end()
    rest = t[pos:]
    if "{{" in rest:
        raise TemplateError("unclosed tag")
    if rest:
        stack[-1][1].append(("text", rest))
    if len(stack) > 1:
        raise TemplateError("unclosed section")
    return root


def _truthy(v) -> bool:
    if v is None or v is False or v == "" or v == [] or v == {}:
        return False
    return not (isinstance(v, (int, float)) and not isinstance(v, bool) and v == 0)


def _run(nodes: list, stack: list, escape: bool, out: list) -> None:
    for node in nodes:
        kind = node[0]
        if kind == "text":
            out.append(node[1])
        elif kind in ("var", "raw"):
            s = _format(_lookup(stack, node[1]))
            out.append(_escape(s) if escape and kind == "var" else s)
        elif kind == "section":
            v = _lookup(stack, node[1])
            if isinstance(v, list):
                for item in v:
                    _run(node[2], stack + [item], escape, out)
            elif _truthy(v):
                _run(node[2], stack + ([v] if isinstance(v, dict) else []), escape, out)
        elif not _truthy(_lookup(stack, node[1])):
            _run(node[2], stack, escape, out)


def render_template(template: str, data, escape: bool = True) -> str:
    """Render the template against data; raises TemplateError for malformed templates or list/dict values."""
    out: list = []
    _run(_parse(template), [data], escape, out)
    return "".join(out)
