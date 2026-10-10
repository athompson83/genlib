# SPDX-License-Identifier: Apache-2.0
"""Creates an AcroForm with reportlab at test time, fills it with pypdf, reads back."""

import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader
from reportlab.pdfgen import canvas

from pdf_forms import fill_form, list_fields


def make_form(path: Path) -> None:
    c = canvas.Canvas(str(path))
    form = c.acroForm
    c.drawString(72, 760, "Name:")
    form.textfield(name="name", x=130, y=750, width=200, height=20)
    c.drawString(72, 720, "Subscribe:")
    form.checkbox(name="subscribe", x=130, y=715, size=16, checked=False)
    c.drawString(72, 680, "Plan:")
    form.choice(name="plan", x=130, y=670, width=120, height=20,
                options=["free", "pro", "team"], value="free")
    c.save()


class PdfFormsTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.src = self.dir / "form.pdf"
        make_form(self.src)

    def test_lists_fields(self):
        fields = {f.name: f for f in list_fields(self.src)}
        self.assertEqual(fields["name"].kind, "text")
        self.assertEqual(fields["subscribe"].kind, "checkbox")
        self.assertEqual(fields["plan"].kind, "choice")
        self.assertEqual(fields["plan"].options, ("free", "pro", "team"))

    def test_fill_and_read_back(self):
        out = self.dir / "filled.pdf"
        fill_form(self.src, out, {"name": "Ada Lovelace", "subscribe": True, "plan": "pro"})
        fields = {f.name: f.value for f in list_fields(out)}
        self.assertEqual(fields["name"], "Ada Lovelace")
        self.assertNotIn(fields["subscribe"], (None, "/Off"))
        self.assertEqual(fields["plan"], "pro")

    def test_rejects_unknown_field_and_bad_option(self):
        with self.assertRaises(KeyError):
            fill_form(self.src, self.dir / "x.pdf", {"nmae": "typo"})
        with self.assertRaises(ValueError):
            fill_form(self.src, self.dir / "x.pdf", {"plan": "enterprise"})

    def test_flatten_removes_fields_and_keeps_text(self):
        out = self.dir / "flat.pdf"
        fill_form(self.src, out, {"name": "Grace Hopper"}, flatten=True)
        self.assertEqual(list_fields(out), [])
        self.assertIn("Grace Hopper", PdfReader(out).pages[0].extract_text())


if __name__ == "__main__":
    unittest.main()
