// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdftext;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.text.PDFTextStripper;

/** Per-page text and Info metadata with Apache PDFBox 3. */
public final class PdfText {
  private PdfText() {}

  public record Result(List<String> pages, Map<String, String> metadata) {}

  /**
   * Extracts text page by page. Image-only pages return "" (OCR is out of
   * scope). Encrypted files need {@link Loader#loadPDF(byte[], String)}.
   */
  public static Result extract(byte[] pdf) throws IOException {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      PDFTextStripper stripper = new PDFTextStripper();
      stripper.setSortByPosition(true); // visual order rather than stream order
      List<String> pages = new ArrayList<>();
      for (int i = 1; i <= doc.getNumberOfPages(); i++) {
        stripper.setStartPage(i);
        stripper.setEndPage(i);
        pages.add(stripper.getText(doc));
      }
      PDDocumentInformation info = doc.getDocumentInformation();
      Map<String, String> meta = new LinkedHashMap<>();
      put(meta, "title", info.getTitle());
      put(meta, "author", info.getAuthor());
      put(meta, "subject", info.getSubject());
      put(meta, "creator", info.getCreator());
      put(meta, "producer", info.getProducer());
      return new Result(pages, meta);
    }
  }

  private static void put(Map<String, String> m, String k, String v) {
    if (v != null && !v.isEmpty()) m.put(k, v);
  }
}
