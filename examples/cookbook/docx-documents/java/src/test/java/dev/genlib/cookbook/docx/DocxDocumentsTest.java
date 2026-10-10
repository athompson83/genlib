// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.docx;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.junit.jupiter.api.Test;

class DocxDocumentsTest {
  @Test
  void createReplaceExtract() throws Exception {
    byte[] created = DocxDocuments.createReport(
        "Quarterly report", "Prepared for {{customer}}.", List.of(List.of("Item", "Qty"), List.of("Widgets", "3")));
    assertEquals("PK", new String(created, 0, 2, "ISO-8859-1"));
    assertTrue(DocxDocuments.extractText(created).contains("{{customer}}"));

    byte[] patched = DocxDocuments.replacePlaceholders(created, Map.of("customer", "Ada <Lovelace> & Co"));
    String text = DocxDocuments.extractText(patched);
    assertTrue(text.contains("Quarterly report"), text);
    assertTrue(text.contains("Prepared for Ada <Lovelace> & Co."), text);
    assertFalse(text.contains("{{customer}}"), text);
    assertTrue(text.contains("Widgets\t3"), text);
  }

  @Test
  void placeholderSplitAcrossRuns() throws Exception {
    byte[] bytes;
    try (XWPFDocument doc = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      XWPFParagraph p = doc.createParagraph();
      for (String part : new String[] {"Dear {{cus", "tomer", "}},"}) {
        p.createRun().setText(part);
      }
      doc.write(out);
      bytes = out.toByteArray();
    }
    byte[] patched = DocxDocuments.replacePlaceholders(bytes, Map.of("customer", "Grace"));
    assertTrue(DocxDocuments.extractText(patched).contains("Dear Grace,"));
  }
}
