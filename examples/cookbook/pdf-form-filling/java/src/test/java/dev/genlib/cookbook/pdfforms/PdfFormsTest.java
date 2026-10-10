// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdfforms;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class PdfFormsTest {

  /** Builds a text field, checkbox and combo box with PDFBox at test time. */
  static byte[] makeForm() throws IOException {
    try (PDDocument doc = new PDDocument()) {
      PDPage page = new PDPage(new PDRectangle(400, 300));
      doc.addPage(page);
      PDAcroForm form = new PDAcroForm(doc);
      doc.getDocumentCatalog().setAcroForm(form);
      PDResources dr = new PDResources();
      dr.put(COSName.HELV, new PDType1Font(Standard14Fonts.FontName.HELVETICA));
      form.setDefaultResources(dr);
      form.setDefaultAppearance("/Helv 12 Tf 0 g");

      PDTextField name = new PDTextField(form);
      name.setPartialName("name");
      add(page, form, name, new PDRectangle(50, 220, 200, 20));

      PDComboBox plan = new PDComboBox(form);
      plan.setPartialName("plan");
      plan.setOptions(List.of("free", "pro", "team"));
      add(page, form, plan, new PDRectangle(50, 140, 120, 20));
      plan.setValue("free");

      PDCheckBox subscribe = new PDCheckBox(form);
      subscribe.setPartialName("subscribe");
      PDAnnotationWidget w = add(page, form, subscribe, new PDRectangle(50, 180, 12, 12));
      COSDictionary normal = new COSDictionary();
      normal.setItem(COSName.getPDFName("Yes"), box(doc, true));
      normal.setItem(COSName.Off, box(doc, false));
      PDAppearanceDictionary ap = new PDAppearanceDictionary();
      ap.setNormalAppearance(new PDAppearanceEntry(normal));
      w.setAppearance(ap);
      w.setAppearanceState("Off");

      ByteArrayOutputStream out = new ByteArrayOutputStream();
      doc.save(out);
      return out.toByteArray();
    }
  }

  private static PDAnnotationWidget add(PDPage page, PDAcroForm form, PDField field, PDRectangle r)
      throws IOException {
    PDAnnotationWidget w = field.getWidgets().get(0);
    w.setRectangle(r);
    w.setPage(page);
    page.getAnnotations().add(w);
    form.getFields().add(field);
    return w;
  }

  private static PDAppearanceStream box(PDDocument doc, boolean filled) throws IOException {
    PDAppearanceStream s = new PDAppearanceStream(doc);
    s.setBBox(new PDRectangle(12, 12));
    s.setResources(new PDResources());
    try (PDPageContentStream cs = new PDPageContentStream(doc, s)) {
      cs.addRect(0, 0, 12, 12);
      if (filled) cs.fill(); else cs.stroke();
    }
    return s;
  }

  static Map<String, PdfForms.FormField> byName(byte[] pdf) throws IOException {
    return PdfForms.listFields(pdf).stream()
        .collect(Collectors.toMap(PdfForms.FormField::name, Function.identity()));
  }

  @Test
  void listsFields() throws IOException {
    var m = byName(makeForm());
    assertEquals(PdfForms.Kind.TEXT, m.get("name").kind());
    assertEquals(PdfForms.Kind.CHECKBOX, m.get("subscribe").kind());
    assertEquals(List.of("free", "pro", "team"), m.get("plan").options());
  }

  @Test
  void fillsAndReadsBack() throws IOException {
    byte[] out = PdfForms.fill(makeForm(), Map.of("name", "Ada Lovelace", "subscribe", true, "plan", "pro"), false);
    var m = byName(out);
    assertEquals("Ada Lovelace", m.get("name").value());
    assertEquals("Yes", m.get("subscribe").value());
    assertEquals("pro", m.get("plan").value());
  }

  @Test
  void rejectsUnknownAndInvalid() throws IOException {
    byte[] src = makeForm();
    assertThrows(IllegalArgumentException.class, () -> PdfForms.fill(src, Map.of("nmae", "x"), false));
    assertThrows(IllegalArgumentException.class, () -> PdfForms.fill(src, Map.of("plan", "enterprise"), false));
  }

  @Test
  void flattenKeepsTextAndRemovesFields() throws IOException {
    byte[] out = PdfForms.fill(makeForm(), Map.of("name", "Grace Hopper"), true);
    assertTrue(PdfForms.listFields(out).isEmpty());
    try (PDDocument doc = Loader.loadPDF(out)) {
      assertTrue(new PDFTextStripper().getText(doc).contains("Grace Hopper"));
    }
  }
}
