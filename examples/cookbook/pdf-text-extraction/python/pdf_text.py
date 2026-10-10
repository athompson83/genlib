# SPDX-License-Identifier: Apache-2.0
"""Thin text/metadata extraction over pypdf."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Union

from pypdf import PdfReader

@dataclass(frozen=True)
class PdfText:
    page_count: int
    pages: list[str]
    metadata: dict[str, str] = field(default_factory=dict)

def extract(pdf: Union[str, Path], password: str | None = None) -> PdfText:
    """Extract text per page plus the document information dictionary.

    Text extraction reads the content stream; scanned (image-only) pages return
    "" and need OCR. Reading order follows the content stream, not visual layout.
    """
    reader = PdfReader(pdf)
    if reader.is_encrypted:
        if password is None or not reader.decrypt(password):
            raise PermissionError("PDF is encrypted; a valid password is required")
    pages = [page.extract_text() or "" for page in reader.pages]
    meta = {}
    info = reader.metadata
    if info is not None:
        for key in ("/Title", "/Author", "/Subject", "/Creator", "/Producer"):
            if info.get(key):
                meta[key.lstrip("/").lower()] = str(info[key])
    return PdfText(page_count=len(reader.pages), pages=pages, metadata=meta)

if __name__ == "__main__":  # usage: python pdf_text.py file.pdf
    import sys

    result = extract(sys.argv[1])
    print(result.metadata)
    for i, text in enumerate(result.pages, 1):
        print(f"--- page {i} ---\n{text}")
