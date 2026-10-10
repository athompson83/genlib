// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdfforms

import java.io.ByteArrayOutputStream
import org.apache.pdfbox.Loader
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox
import org.apache.pdfbox.pdmodel.interactive.form.PDChoice
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox
import org.apache.pdfbox.pdmodel.interactive.form.PDField
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField

/** Thin AcroForm helpers over Apache PDFBox 3: list, fill, optionally flatten. */
object PdfForms {
    enum class Kind { TEXT, CHECKBOX, RADIO, CHOICE, OTHER }

    data class FormField(val name: String, val kind: Kind, val value: String?, val options: List<String>)

    /** Terminal fields by fully qualified name; empty when the PDF has no form. */
    fun listFields(pdf: ByteArray): List<FormField> =
        Loader.loadPDF(pdf).use { doc ->
            val form = doc.documentCatalog.acroForm ?: return emptyList()
            form.fieldTree.filterNot { it is PDNonTerminalField }.map(::describe)
        }

    private fun describe(f: PDField): FormField {
        val name = f.fullyQualifiedName
        return when (f) {
            is PDTextField -> FormField(name, Kind.TEXT, f.value, emptyList())
            is PDCheckBox -> FormField(name, Kind.CHECKBOX, if (f.isChecked) f.onValue else "Off", listOf(f.onValue))
            is PDRadioButton -> FormField(name, Kind.RADIO, f.value, f.exportValues)
            is PDChoice -> FormField(name, Kind.CHOICE, f.value.firstOrNull(), f.options)
            else -> FormField(name, Kind.OTHER, f.valueAsString, emptyList())
        }
    }

    /**
     * Fills fields by name: strings for text/choice/radio, Boolean for checkboxes.
     * Unknown names or invalid options throw [IllegalArgumentException].
     * [flatten] regenerates appearances and merges the form into page content.
     */
    fun fill(pdf: ByteArray, values: Map<String, Any>, flatten: Boolean = false): ByteArray =
        Loader.loadPDF(pdf).use { doc ->
            val form = requireNotNull(doc.documentCatalog.acroForm) { "document has no AcroForm" }
            for ((name, v) in values) {
                val f = requireNotNull(form.getField(name)) { "unknown form field: $name" }
                when (f) {
                    is PDCheckBox -> {
                        require(v is Boolean) { "$name needs a Boolean" }
                        if (v) f.check() else f.unCheck()
                    }
                    is PDChoice -> {
                        val s = v.toString()
                        val editable = f is PDComboBox && f.isEdit
                        require(editable || s in f.options) { "$s is not an option of $name" }
                        f.setValue(s)
                    }
                    else -> f.setValue(v.toString())
                }
            }
            if (flatten) form.flatten()
            ByteArrayOutputStream().also { doc.save(it) }.toByteArray()
        }
}
