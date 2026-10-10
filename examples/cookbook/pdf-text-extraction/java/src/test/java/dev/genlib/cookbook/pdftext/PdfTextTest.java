// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdftext;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

class PdfTextTest {

  static byte[] makePdf() throws IOException {
    try (PDDocument doc = new PDDocument()) {
      PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
      for (String text : new String[] {"Hello from page one", "Second page text"}) {
        PDPage page = new PDPage();
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
          cs.beginText();
          cs.setFont(font, 14);
          cs.newLineAtOffset(72, 700);
          cs.showText(text);
          cs.endText();
        }
      }
      doc.getDocumentInformation().setTitle("Cookbook Fixture");
      doc.getDocumentInformation().setAuthor("Genlib");
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      doc.save(out);
      return out.toByteArray();
    }
  }

  @Test
  void extractsPagesAndMetadata() throws IOException {
    PdfText.Result r = PdfText.extract(makePdf());
    assertEquals(2, r.pages().size());
    assertTrue(r.pages().get(0).contains("Hello from page one"));
    assertFalse(r.pages().get(0).contains("Second"));
    assertTrue(r.pages().get(1).contains("Second page text"));
    assertEquals("Cookbook Fixture", r.metadata().get("title"));
    assertEquals("Genlib", r.metadata().get("author"));
  }

  @Test
  void rejectsGarbage() {
    assertThrows(IOException.class, () -> PdfText.extract("not a pdf".getBytes()));
  }
}
