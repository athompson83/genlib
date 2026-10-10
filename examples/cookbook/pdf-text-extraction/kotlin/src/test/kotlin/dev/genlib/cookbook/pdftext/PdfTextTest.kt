// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdftext

import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts

class PdfTextTest {
    private fun makePdf(): ByteArray = PDDocument().use { doc ->
        val font = PDType1Font(Standard14Fonts.FontName.HELVETICA)
        for (text in listOf("Hello from page one", "Second page text")) {
            val page = PDPage().also(doc::addPage)
            PDPageContentStream(doc, page).use { cs ->
                cs.beginText(); cs.setFont(font, 14f); cs.newLineAtOffset(72f, 700f); cs.showText(text); cs.endText()
            }
        }
        doc.documentInformation.title = "Cookbook Fixture"
        doc.documentInformation.author = "Genlib"
        ByteArrayOutputStream().also { doc.save(it) }.toByteArray()
    }

    @Test
    fun extractsPagesAndMetadata() {
        val r = PdfText.extract(makePdf())
        assertEquals(2, r.pages.size)
        assertTrue("Hello from page one" in r.pages[0])
        assertFalse("Second" in r.pages[0])
        assertTrue("Second page text" in r.pages[1])
        assertEquals("Cookbook Fixture", r.metadata["title"])
        assertEquals("Genlib", r.metadata["author"])
    }

    @Test
    fun rejectsGarbage() {
        assertFailsWith<IOException> { PdfText.extract("not a pdf".toByteArray()) }
    }
}
