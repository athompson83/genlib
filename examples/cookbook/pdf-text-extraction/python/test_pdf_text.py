# SPDX-License-Identifier: Apache-2.0
"""Generates a two-page PDF with reportlab at test time and checks extraction."""

import tempfile
import unittest
from pathlib import Path

from reportlab.pdfgen import canvas

from pdf_text import extract


def make_pdf(path: Path) -> None:
    c = canvas.Canvas(str(path))
    c.setTitle("Cookbook Fixture")
    c.setAuthor("Genlib")
    c.drawString(72, 750, "Hello from page one")
    c.showPage()
    c.drawString(72, 750, "Second page text")
    c.save()


class PdfTextTest(unittest.TestCase):
    def test_extracts_pages_and_metadata(self):
        path = Path(tempfile.mkdtemp()) / "fixture.pdf"
        make_pdf(path)
        result = extract(path)
        self.assertEqual(result.page_count, 2)
        self.assertIn("Hello from page one", result.pages[0])
        self.assertIn("Second page text", result.pages[1])
        self.assertNotIn("Second page text", result.pages[0])
        self.assertEqual(result.metadata["title"], "Cookbook Fixture")
        self.assertEqual(result.metadata["author"], "Genlib")


if __name__ == "__main__":
    unittest.main()
