// SPDX-License-Identifier: Apache-2.0
// Thin per-page text and metadata extraction over unpdf (serverless PDF.js build).
import { extractText, getDocumentProxy, getMeta } from 'unpdf';

export interface PdfText {
  pageCount: number;
  pages: string[];
  metadata: { title?: string; author?: string; subject?: string; creator?: string; producer?: string };
}

/**
 * Extract text per page and the document information dictionary.
 * Image-only (scanned) pages yield "" and need OCR; order follows the content stream.
 * PDF.js takes ownership of (detaches) the buffer, so pass a copy if you reuse it.
 */
export async function extract(pdf: Uint8Array): Promise<PdfText> {
  const doc = await getDocumentProxy(pdf);
  try {
    const { totalPages, text } = await extractText(doc, { mergePages: false });
    const { info } = await getMeta(doc);
    const pick = (k: string) => (typeof info?.[k] === 'string' && info[k] ? (info[k] as string) : undefined);
    return {
      pageCount: totalPages,
      pages: text,
      metadata: {
        title: pick('Title'),
        author: pick('Author'),
        subject: pick('Subject'),
        creator: pick('Creator'),
        producer: pick('Producer'),
      },
    };
  } finally {
    await doc.loadingTask.destroy();
  }
}
