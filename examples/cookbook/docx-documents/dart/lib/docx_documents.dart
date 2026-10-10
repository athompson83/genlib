// SPDX-License-Identifier: Apache-2.0
/// Genlib cookbook: create, patch and read DOCX files with `docx_creator` (MIT).
/// Thin wrapper only: docx_creator owns the OOXML reading/writing and escaping.
///
/// Editing works on docx_creator's typed AST: load -> transform nodes -> export. Parts
/// the reader does not model may not survive a round trip; test with your real templates.
library;

import 'dart:typed_data';

import 'package:docx_creator/docx_creator.dart';

/// Create a DOCX with a heading, a paragraph and a table (first row = header).
Future<Uint8List> createReport(String title, String body, List<List<String>> rows) {
  final doc = docx().h1(title).p(body).table(rows).build();
  return DocxExporter().exportToBytes(doc);
}

/// Replace `{{key}}` placeholders in top-level paragraphs. A placeholder inside one text
/// run keeps that run's formatting; one split across runs is merged into the first run.
/// Paragraphs inside tables, headers and footers are not visited by this wrapper.
Future<Uint8List> replacePlaceholders(Uint8List bytes, Map<String, String> values) async {
  final doc = await DocxReader.loadFromBytes(bytes);
  final elements = [
    for (final node in doc.elements) node is DocxParagraph ? _patch(node, values) : node,
  ];
  return DocxExporter().exportToBytes(_withElements(doc, elements));
}

String _apply(String text, Map<String, String> values) =>
    values.entries.fold(text, (acc, e) => acc.replaceAll('{{${e.key}}}', e.value));

bool _hasToken(String text, Map<String, String> values) =>
    values.keys.any((k) => text.contains('{{$k}}'));

DocxParagraph _patch(DocxParagraph p, Map<String, String> values) {
  var children = [
    for (final c in p.children)
      c is DocxText && _hasToken(c.content, values) ? c.copyWith(content: _apply(c.content, values)) : c,
  ];
  final texts = children.whereType<DocxText>().toList();
  final joined = texts.map((t) => t.content).join();
  if (texts.isNotEmpty && _hasToken(joined, values)) {
    final first = texts.first;
    children = [
      for (final c in children)
        if (identical(c, first)) first.copyWith(content: _apply(joined, values)) else if (c is! DocxText) c,
    ];
  }
  return p.copyWith(children: children);
}

DocxBuiltDocument _withElements(DocxBuiltDocument d, List<DocxNode> elements) => DocxBuiltDocument(
      elements: elements,
      section: d.section,
      stylesXml: d.stylesXml,
      numberingXml: d.numberingXml,
      settingsXml: d.settingsXml,
      fontTableXml: d.fontTableXml,
      fontTableRelsXml: d.fontTableRelsXml,
      themeXml: d.themeXml,
      contentTypesXml: d.contentTypesXml,
      rootRelsXml: d.rootRelsXml,
      headerBgXml: d.headerBgXml,
      headerBgRelsXml: d.headerBgRelsXml,
      footnotesXml: d.footnotesXml,
      endnotesXml: d.endnotesXml,
      numberingRelsXml: d.numberingRelsXml,
      numberingImages: d.numberingImages,
      fonts: d.fonts,
      footnotes: d.footnotes,
      endnotes: d.endnotes,
      theme: d.theme,
    );

String _paragraphText(DocxParagraph p) => p.children.whereType<DocxText>().map((t) => t.content).join();

/// Plain text: one line per top-level paragraph, table rows with tab-separated cells.
Future<String> extractText(Uint8List bytes) async {
  final doc = await DocxReader.loadFromBytes(bytes);
  final lines = <String>[];
  for (final node in doc.elements) {
    if (node is DocxParagraph) {
      lines.add(_paragraphText(node));
    } else if (node is DocxTable) {
      for (final row in node.rows) {
        lines.add(row.cells
            .map((cell) => cell.children.whereType<DocxParagraph>().map(_paragraphText).join(' '))
            .join('\t'));
      }
    }
  }
  return lines.join('\n');
}
