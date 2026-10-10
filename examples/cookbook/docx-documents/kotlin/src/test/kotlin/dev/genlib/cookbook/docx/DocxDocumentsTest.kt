// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.docx

import java.io.ByteArrayOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.apache.poi.xwpf.usermodel.XWPFDocument

class DocxDocumentsTest {
    @Test
    fun createReplaceExtract() {
        val created = DocxDocuments.createReport(
            "Quarterly report", "Prepared for {{customer}}.", listOf(listOf("Item", "Qty"), listOf("Widgets", "3")),
        )
        assertEquals("PK", String(created, 0, 2, Charsets.ISO_8859_1))
        assertTrue("{{customer}}" in DocxDocuments.extractText(created))

        val text = DocxDocuments.extractText(
            DocxDocuments.replacePlaceholders(created, mapOf("customer" to "Ada <Lovelace> & Co")),
        )
        assertTrue("Quarterly report" in text, text)
        assertTrue("Prepared for Ada <Lovelace> & Co." in text, text)
        assertFalse("{{customer}}" in text, text)
        assertTrue("Widgets\t3" in text, text)
    }

    @Test
    fun placeholderSplitAcrossRuns() {
        val bytes = XWPFDocument().use { doc ->
            val p = doc.createParagraph()
            listOf("Dear {{cus", "tomer", "}},").forEach { p.createRun().setText(it) }
            ByteArrayOutputStream().also { doc.write(it) }.toByteArray()
        }
        val patched = DocxDocuments.replacePlaceholders(bytes, mapOf("customer" to "Grace"))
        assertTrue("Dear Grace," in DocxDocuments.extractText(patched))
    }
}
