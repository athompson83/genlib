// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdfforms;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDChoice;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;

/** Thin AcroForm helpers over Apache PDFBox 3: list, fill, optionally flatten. */
public final class PdfForms {
  private PdfForms() {}

  public enum Kind { TEXT, CHECKBOX, RADIO, CHOICE, OTHER }

  public record FormField(String name, Kind kind, String value, List<String> options) {}

  /** Lists terminal fields by fully qualified name (empty when there is no form). */
  public static List<FormField> listFields(byte[] pdf) throws IOException {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
      List<FormField> out = new ArrayList<>();
      if (form == null) return out;
      for (PDField f : form.getFieldTree()) {
        if (f instanceof PDNonTerminalField) continue;
        out.add(describe(f));
      }
      return out;
    }
  }

  private static FormField describe(PDField f) {
    String name = f.getFullyQualifiedName();
    if (f instanceof PDTextField t) return new FormField(name, Kind.TEXT, t.getValue(), List.of());
    if (f instanceof PDCheckBox c) {
      return new FormField(name, Kind.CHECKBOX, c.isChecked() ? c.getOnValue() : "Off", List.of(c.getOnValue()));
    }
    if (f instanceof PDRadioButton r) return new FormField(name, Kind.RADIO, r.getValue(), r.getExportValues());
    if (f instanceof PDChoice c) {
      List<String> v = c.getValue();
      return new FormField(name, Kind.CHOICE, v.isEmpty() ? null : v.get(0), c.getOptions());
    }
    return new FormField(name, Kind.OTHER, f.getValueAsString(), List.of());
  }

  /**
   * Fills fields by fully qualified name. Text, choice and radio take strings;
   * checkboxes take Boolean. Unknown names or invalid options throw
   * IllegalArgumentException. When {@code flatten} is true, appearances are
   * refreshed and the form is merged into page content.
   */
  public static byte[] fill(byte[] pdf, Map<String, Object> values, boolean flatten) throws IOException {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
      if (form == null) throw new IllegalArgumentException("document has no AcroForm");
      for (Map.Entry<String, Object> e : values.entrySet()) {
        PDField f = form.getField(e.getKey());
        if (f == null) throw new IllegalArgumentException("unknown form field: " + e.getKey());
        Object v = e.getValue();
        if (f instanceof PDCheckBox c) {
          if (!(v instanceof Boolean b)) throw new IllegalArgumentException(e.getKey() + " needs a Boolean");
          if (b) c.check(); else c.unCheck();
        } else if (f instanceof PDChoice c) {
          String s = String.valueOf(v);
          boolean editable = c instanceof PDComboBox cb && cb.isEdit();
          if (!editable && !c.getOptions().contains(s)) {
            throw new IllegalArgumentException(s + " is not an option of " + e.getKey());
          }
          c.setValue(s);
        } else {
          f.setValue(String.valueOf(v)); // PDFBox validates radio export values
        }
      }
      if (flatten) form.flatten(); // regenerates appearances, then removes fields
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      doc.save(out);
      return out.toByteArray();
    }
  }
}
