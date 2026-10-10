// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdfforms

import java.io.ByteArrayOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.apache.pdfbox.Loader
import org.apache.pdfbox.cos.COSDictionary
import org.apache.pdfbox.cos.COSName
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.PDResources
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox
import org.apache.pdfbox.pdmodel.interactive.form.PDField
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField
import org.apache.pdfbox.text.PDFTextStripper

class PdfFormsTest {
    /** Builds a text field, checkbox and combo box with PDFBox at test time. */
    private fun makeForm(): ByteArray = PDDocument().use { doc ->
        val page = PDPage(PDRectangle(400f, 300f)).also(doc::addPage)
        val form = PDAcroForm(doc).also { doc.documentCatalog.acroForm = it }
        form.defaultResources = PDResources().apply {
            put(COSName.HELV, PDType1Font(Standard14Fonts.FontName.HELVETICA))
        }
        form.defaultAppearance = "/Helv 12 Tf 0 g"

        fun add(field: PDField, r: PDRectangle) = field.widgets[0].also { w ->
            w.rectangle = r
            w.page = page
            page.annotations.add(w)
            form.fields.add(field)
        }
        fun box(filled: Boolean) = PDAppearanceStream(doc).apply {
            bBox = PDRectangle(12f, 12f)
            resources = PDResources()
            PDPageContentStream(doc, this).use { cs ->
                cs.addRect(0f, 0f, 12f, 12f)
                if (filled) cs.fill() else cs.stroke()
            }
        }

        add(PDTextField(form).apply { partialName = "name" }, PDRectangle(50f, 220f, 200f, 20f))
        val plan = PDComboBox(form).apply { partialName = "plan"; setOptions(listOf("free", "pro", "team")) }
        add(plan, PDRectangle(50f, 140f, 120f, 20f))
        plan.setValue("free")
        val w = add(PDCheckBox(form).apply { partialName = "subscribe" }, PDRectangle(50f, 180f, 12f, 12f))
        val normal = COSDictionary().apply {
            setItem(COSName.getPDFName("Yes"), box(true))
            setItem(COSName.Off, box(false))
        }
        w.appearance = PDAppearanceDictionary().apply { normalAppearance = PDAppearanceEntry(normal) }
        w.setAppearanceState("Off")
        ByteArrayOutputStream().also { doc.save(it) }.toByteArray()
    }

    private fun byName(pdf: ByteArray) = PdfForms.listFields(pdf).associateBy { it.name }

    @Test
    fun listsFields() {
        val m = byName(makeForm())
        assertEquals(PdfForms.Kind.TEXT, m.getValue("name").kind)
        assertEquals(PdfForms.Kind.CHECKBOX, m.getValue("subscribe").kind)
        assertEquals(listOf("free", "pro", "team"), m.getValue("plan").options)
    }

    @Test
    fun fillsAndReadsBack() {
        val m = byName(PdfForms.fill(makeForm(), mapOf("name" to "Ada Lovelace", "subscribe" to true, "plan" to "pro")))
        assertEquals("Ada Lovelace", m.getValue("name").value)
        assertEquals("Yes", m.getValue("subscribe").value)
        assertEquals("pro", m.getValue("plan").value)
    }

    @Test
    fun rejectsUnknownAndInvalid() {
        val src = makeForm()
        assertFailsWith<IllegalArgumentException> { PdfForms.fill(src, mapOf("nmae" to "x")) }
        assertFailsWith<IllegalArgumentException> { PdfForms.fill(src, mapOf("plan" to "enterprise")) }
    }

    @Test
    fun flattenKeepsTextAndRemovesFields() {
        val out = PdfForms.fill(makeForm(), mapOf("name" to "Grace Hopper"), flatten = true)
        assertTrue(PdfForms.listFields(out).isEmpty())
        Loader.loadPDF(out).use { assertTrue("Grace Hopper" in PDFTextStripper().getText(it)) }
    }
}
