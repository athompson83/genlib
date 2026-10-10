# SPDX-License-Identifier: Apache-2.0
"""Thin AcroForm helpers over pypdf: list fields, fill them, optionally flatten."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Union

from pypdf import PdfReader, PdfWriter

FieldValue = Union[str, bool]


@dataclass(frozen=True)
class FormField:
    name: str
    kind: str  # "text", "checkbox", "choice", "radio", "signature" or "other"
    value: str | None
    options: tuple[str, ...] = ()


def _kind(field) -> str:
    ft = field.get("/FT")
    if ft == "/Tx":
        return "text"
    if ft == "/Ch":
        return "choice"
    if ft == "/Sig":
        return "signature"
    if ft == "/Btn":
        flags = int(field.get("/Ff", 0))
        return "radio" if flags & (1 << 15) else "checkbox"
    return "other"


def list_fields(pdf: Union[str, Path]) -> list[FormField]:
    """Return the AcroForm fields of a PDF (empty list when it has no form)."""
    fields = PdfReader(pdf).get_fields() or {}
    out: list[FormField] = []
    for name, field in fields.items():
        kind = _kind(field)
        value = field.get("/V")
        options: tuple[str, ...] = ()
        if kind == "choice" and "/Opt" in field:
            options = tuple(
                str(o[1] if isinstance(o, list) else o) for o in field["/Opt"]
            )
        elif kind in ("checkbox", "radio"):
            options = tuple(str(s) for s in field.get("/_States_", []) if s != "/Off")
        out.append(FormField(name, kind, None if value is None else str(value), options))
    return out


def fill_form(
    src: Union[str, Path],
    dst: Union[str, Path],
    values: Mapping[str, FieldValue],
    *,
    flatten: bool = False,
) -> None:
    """Fill fields by name and save to ``dst``.

    Text and choice fields take strings. Checkboxes take ``True``/``False``
    (mapped to the widget's own "on" state name) or an explicit state such as
    ``"/Yes"``. Unknown field names raise ``KeyError`` so typos are not silent.
    """
    reader = PdfReader(src)
    known = {f.name: f for f in list_fields(src)}
    resolved: dict[str, str] = {}
    for name, value in values.items():
        if name not in known:
            raise KeyError(f"unknown form field: {name}")
        field = known[name]
        if field.kind in ("checkbox", "radio") and isinstance(value, bool):
            on = field.options[0] if field.options else "/Yes"
            resolved[name] = on if value else "/Off"
        elif field.kind == "choice" and field.options and value not in field.options:
            raise ValueError(f"{value!r} is not an option of {name}: {field.options}")
        else:
            resolved[name] = str(value)

    writer = PdfWriter(clone_from=reader)
    # Ask viewers to rebuild appearances; pypdf also generates text appearances.
    writer.set_need_appearances_writer(True)
    writer.update_page_form_field_values(None, resolved, auto_regenerate=False, flatten=flatten)
    if flatten:
        # Appearances were merged into page content; drop the interactive layer.
        writer.remove_annotations(subtypes="/Widget")
        if "/AcroForm" in writer.root_object:
            del writer.root_object["/AcroForm"]
    with open(dst, "wb") as fh:
        writer.write(fh)


if __name__ == "__main__":  # usage: python pdf_forms.py form.pdf
    import sys

    for f in list_fields(sys.argv[1]):
        print(f)
