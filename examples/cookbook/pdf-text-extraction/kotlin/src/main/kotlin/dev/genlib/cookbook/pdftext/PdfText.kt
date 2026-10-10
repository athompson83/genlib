// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.pdftext

import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper

/** Per-page text and Info metadata with Apache PDFBox 3. */
object PdfText {
    data class Result(val pages: List<String>, val metadata: Map<String, String>)

    /** Image-only pages return "" (OCR is out of scope); encrypted files need Loader.loadPDF(bytes, password). */
    fun extract(pdf: ByteArray): Result = Loader.loadPDF(pdf).use { doc ->
        val stripper = PDFTextStripper().apply { sortByPosition = true }
        val pages = (1..doc.numberOfPages).map { i ->
            stripper.startPage = i
            stripper.endPage = i
            stripper.getText(doc)
        }
        val info = doc.documentInformation
        val meta = listOf(
            "title" to info.title, "author" to info.author, "subject" to info.subject,
            "creator" to info.creator, "producer" to info.producer,
        ).filter { !it.second.isNullOrEmpty() }.associate { it.first to it.second!! }
        Result(pages, meta)
    }
}
