// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.docx;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFHeader;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFStyle;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTStyle;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STStyleType;

/**
 * Genlib cookbook: create, patch and read DOCX files with Apache POI XWPF (Apache-2.0).
 * Thin wrapper only: POI owns the OOXML format and XML-escapes run text.
 */
public final class DocxDocuments {
  private DocxDocuments() {}

  /** Create a DOCX with a heading, a paragraph and a table (first row = header). */
  public static byte[] createReport(String title, String body, List<List<String>> rows) throws IOException {
    try (XWPFDocument doc = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      addHeadingStyle(doc);
      XWPFParagraph heading = doc.createParagraph();
      heading.setStyle("Heading1");
      heading.createRun().setText(title);
      doc.createParagraph().createRun().setText(body);

      int cols = rows.stream().mapToInt(List::size).max().orElse(1);
      XWPFTable table = doc.createTable(rows.size(), cols);
      for (int r = 0; r < rows.size(); r++) {
        for (int c = 0; c < rows.get(r).size(); c++) {
          XWPFParagraph p = table.getRow(r).getCell(c).getParagraphs().get(0);
          XWPFRun run = p.createRun();
          run.setText(rows.get(r).get(c));
          run.setBold(r == 0);
        }
      }
      doc.write(out);
      return out.toByteArray();
    }
  }

  private static void addHeadingStyle(XWPFDocument doc) {
    CTStyle ct = CTStyle.Factory.newInstance();
    ct.setStyleId("Heading1");
    ct.setType(STStyleType.PARAGRAPH);
    ct.addNewName().setVal("heading 1");
    ct.addNewPPr().addNewOutlineLvl().setVal(BigInteger.ZERO);
    ct.addNewRPr().addNewB();
    doc.createStyles().addStyle(new XWPFStyle(ct));
  }

  /**
   * Replace {@code {{key}}} placeholders in body, table cells (nested), headers and footers.
   * A placeholder inside one run keeps its formatting; one split across runs is merged into the
   * paragraph's first run.
   */
  public static byte[] replacePlaceholders(byte[] docx, Map<String, String> values) throws IOException {
    try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(docx));
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      List<XWPFParagraph> paragraphs = new ArrayList<>(doc.getParagraphs());
      doc.getTables().forEach(t -> collect(t, paragraphs));
      for (XWPFHeader h : doc.getHeaderList()) {
        paragraphs.addAll(h.getParagraphs());
        h.getTables().forEach(t -> collect(t, paragraphs));
      }
      for (XWPFFooter f : doc.getFooterList()) {
        paragraphs.addAll(f.getParagraphs());
        f.getTables().forEach(t -> collect(t, paragraphs));
      }
      for (XWPFParagraph p : paragraphs) {
        patch(p, values);
      }
      doc.write(out);
      return out.toByteArray();
    }
  }

  private static void collect(XWPFTable table, List<XWPFParagraph> into) {
    for (XWPFTableRow row : table.getRows()) {
      for (XWPFTableCell cell : row.getTableCells()) {
        into.addAll(cell.getParagraphs());
        cell.getTables().forEach(t -> collect(t, into));
      }
    }
  }

  private static String apply(String text, Map<String, String> values) {
    for (Map.Entry<String, String> e : values.entrySet()) {
      text = text.replace("{{" + e.getKey() + "}}", e.getValue());
    }
    return text;
  }

  private static boolean hasToken(String text, Map<String, String> values) {
    return text != null && values.keySet().stream().anyMatch(k -> text.contains("{{" + k + "}}"));
  }

  private static void patch(XWPFParagraph p, Map<String, String> values) {
    if (!hasToken(p.getText(), values)) {
      return;
    }
    for (XWPFRun run : p.getRuns()) {
      String t = run.getText(0);
      if (hasToken(t, values)) {
        run.setText(apply(t, values), 0);
      }
    }
    if (hasToken(p.getText(), values) && !p.getRuns().isEmpty()) {
      String merged = apply(p.getText(), values);
      p.getRuns().get(0).setText(merged, 0);
      for (int i = p.getRuns().size() - 1; i > 0; i--) {
        p.removeRun(i);
      }
    }
  }

  /** Plain text of the whole document (body, tables, headers and footers). */
  public static String extractText(byte[] docx) throws IOException {
    try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(docx));
        XWPFWordExtractor extractor = new XWPFWordExtractor(doc)) {
      return extractor.getText();
    }
  }
}
