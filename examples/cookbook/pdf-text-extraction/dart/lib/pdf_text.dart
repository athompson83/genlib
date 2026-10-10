// SPDX-License-Identifier: Apache-2.0
/// Per-page text via pdfrx_engine (PDFium through FFI) and Info metadata via
/// the pure-Dart dart_pdf_reader. pdfrx_engine's build hook downloads a
/// prebuilt PDFium binary (or set PDFIUM_PATH to a vetted local copy).
library;

import 'dart:typed_data';

import 'package:dart_pdf_reader/dart_pdf_reader.dart' as reader;
import 'package:pdfrx_engine/pdfrx_engine.dart';

class PdfText {
  PdfText(this.pages, this.metadata);
  final List<String> pages;
  final Map<String, String> metadata;
}

/// Extracts text page by page. Image-only pages return '' (OCR is out of scope).
Future<PdfText> extract(Uint8List bytes) async {
  await pdfrxInitialize();
  final doc = await PdfDocument.openData(bytes);
  final pages = <String>[];
  try {
    for (final page in doc.pages) {
      pages.add((await page.loadText())?.fullText ?? '');
    }
  } finally {
    await doc.dispose();
  }
  return PdfText(pages, await _info(bytes));
}

Future<Map<String, String>> _info(Uint8List bytes) async {
  final doc = await reader.PDFParser(reader.ByteStream(bytes)).parse();
  final info = await doc.resolve<reader.PDFDictionary>(doc.mainTrailer[const reader.PDFName('Info')]);
  final out = <String, String>{};
  if (info == null) return out;
  for (final key in ['Title', 'Author', 'Subject', 'Creator', 'Producer']) {
    final v = await doc.resolve<reader.PDFObject>(info[reader.PDFName(key)]);
    if (v is reader.PDFStringLike && v.asString().isNotEmpty) out[key.toLowerCase()] = v.asString();
  }
  return out;
}
