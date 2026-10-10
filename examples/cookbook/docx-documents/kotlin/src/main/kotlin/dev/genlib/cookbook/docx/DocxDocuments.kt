// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.docx

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import org.apache.poi.xwpf.extractor.XWPFWordExtractor
import org.apache.poi.xwpf.usermodel.XWPFDocument
import org.apache.poi.xwpf.usermodel.XWPFParagraph
import org.apache.poi.xwpf.usermodel.XWPFStyle
import org.apache.poi.xwpf.usermodel.XWPFTable
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTStyle
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STStyleType

/**
 * Genlib cookbook: create, patch and read DOCX files with Apache POI XWPF (Apache-2.0).
 * Thin wrapper only: POI owns the OOXML format and XML-escapes run text.
 */
object DocxDocuments {
    /** Create a DOCX with a heading, a paragraph and a table (first row = header). */
    fun createReport(title: String, body: String, rows: List<List<String>>): ByteArray =
        XWPFDocument().use { doc ->
            val style = CTStyle.Factory.newInstance().apply {
                styleId = "Heading1"
                type = STStyleType.PARAGRAPH
                addNewName().`val` = "heading 1"
                addNewPPr().addNewOutlineLvl().`val` = BigInteger.ZERO
                addNewRPr().addNewB()
            }
            doc.createStyles().addStyle(XWPFStyle(style))
            doc.createParagraph().apply { this.style = "Heading1" }.createRun().setText(title)
            doc.createParagraph().createRun().setText(body)
            val table = doc.createTable(rows.size, rows.maxOf { it.size })
            rows.forEachIndexed { r, cells ->
                cells.forEachIndexed { c, text ->
                    table.getRow(r).getCell(c).paragraphs[0].createRun().apply {
                        setText(text)
                        isBold = r == 0
                    }
                }
            }
            ByteArrayOutputStream().also { doc.write(it) }.toByteArray()
        }

    /**
     * Replace `{{key}}` placeholders in body, (nested) table cells, headers and footers.
     * A placeholder split across runs is merged into the paragraph's first run.
     */
    fun replacePlaceholders(docx: ByteArray, values: Map<String, String>): ByteArray =
        XWPFDocument(ByteArrayInputStream(docx)).use { doc ->
            val paragraphs = mutableListOf<XWPFParagraph>()
            paragraphs += doc.paragraphs
            doc.tables.forEach { collect(it, paragraphs) }
            (doc.headerList.map { it.paragraphs to it.tables } + doc.footerList.map { it.paragraphs to it.tables })
                .forEach { (ps, ts) ->
                    paragraphs += ps
                    ts.forEach { collect(it, paragraphs) }
                }
            paragraphs.forEach { patch(it, values) }
            ByteArrayOutputStream().also { doc.write(it) }.toByteArray()
        }

    private fun collect(table: XWPFTable, into: MutableList<XWPFParagraph>) {
        for (row in table.rows) for (cell in row.tableCells) {
            into += cell.paragraphs
            cell.tables.forEach { collect(it, into) }
        }
    }

    private fun apply(text: String, values: Map<String, String>) =
        values.entries.fold(text) { acc, (k, v) -> acc.replace("{{$k}}", v) }

    private fun hasToken(text: String?, values: Map<String, String>) =
        text != null && values.keys.any { text.contains("{{$it}}") }

    private fun patch(p: XWPFParagraph, values: Map<String, String>) {
        if (!hasToken(p.text, values)) return
        for (run in p.runs) {
            val t = run.getText(0)
            if (hasToken(t, values)) run.setText(apply(t, values), 0)
        }
        if (hasToken(p.text, values) && p.runs.isNotEmpty()) {
            val merged = apply(p.text, values)
            p.runs[0].setText(merged, 0)
            for (i in p.runs.size - 1 downTo 1) p.removeRun(i)
        }
    }

    /** Plain text of the whole document (body, tables, headers and footers). */
    fun extractText(docx: ByteArray): String =
        XWPFDocument(ByteArrayInputStream(docx)).use { doc -> XWPFWordExtractor(doc).use { it.text } }
}
