// SPDX-License-Identifier: Apache-2.0
// Genlib cookbook: create, patch and read DOCX files with `docx` (MIT) and `mammoth` (BSD-2-Clause).
// Thin wrapper only: the libraries own the OOXML format. Run on the server (Node 22+).
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  PatchType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  patchDocument,
} from "docx";
import mammoth from "mammoth";

export interface ReportInput {
  title: string;
  body: string; // may contain {{placeholders}} to be patched later
  rows: string[][]; // first row is the header
}

/** Create a DOCX with a heading, a paragraph and a table. Returns the file bytes. */
export async function createReport(input: ReportInput): Promise<Buffer> {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: input.rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: cells.map(
            (text) =>
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: rowIndex === 0 })] })] }),
          ),
        }),
    ),
  });
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: input.title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun(input.body)] }),
          table,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/**
 * Replace `{{key}}` placeholders in an existing DOCX. Values are inserted as text runs, so
 * user input cannot inject XML. Placeholders split across differently formatted runs may not
 * match; keep each placeholder in one run (type it in one go in Word).
 */
export async function replacePlaceholders(docx: Buffer | Uint8Array, values: Record<string, string>): Promise<Buffer> {
  const patches = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { type: PatchType.PARAGRAPH, children: [new TextRun(value)] }]),
  );
  const out = await patchDocument({ outputType: "nodebuffer", data: docx, patches, keepOriginalStyles: true });
  return Buffer.from(out);
}

/** Extract plain text (paragraphs separated by blank lines). */
export async function extractText(docx: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: docx });
  return result.value;
}
