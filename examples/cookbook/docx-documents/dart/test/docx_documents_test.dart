// SPDX-License-Identifier: Apache-2.0
import 'package:docx_creator/docx_creator.dart';
import 'package:genlib_docx_documents/docx_documents.dart';
import 'package:test/test.dart';

void main() {
  test('create, replace placeholder, extract text', () async {
    final created = await createReport('Quarterly report', 'Prepared for {{customer}}.', [
      ['Item', 'Qty'],
      ['Widgets', '3'],
    ]);
    expect(String.fromCharCodes(created.sublist(0, 2)), 'PK');
    expect(await extractText(created), contains('{{customer}}'));

    final patched = await replacePlaceholders(created, {'customer': 'Ada <Lovelace> & Co'});
    final text = await extractText(patched);
    expect(text, contains('Quarterly report'));
    expect(text, contains('Prepared for Ada <Lovelace> & Co.'));
    expect(text, isNot(contains('{{customer}}')));
    expect(text, contains('Widgets\t3'));
  });

  test('placeholder split across runs', () async {
    final doc = DocxBuiltDocument(elements: [
      DocxParagraph(children: [DocxText('Dear {{cus'), DocxText('tomer'), DocxText('}},')]),
    ]);
    final bytes = await DocxExporter().exportToBytes(doc);
    final patched = await replacePlaceholders(bytes, {'customer': 'Grace'});
    expect(await extractText(patched), contains('Dear Grace,'));
  });
}
