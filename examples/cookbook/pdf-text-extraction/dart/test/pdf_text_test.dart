// SPDX-License-Identifier: Apache-2.0
import 'package:genlib_pdf_text_extraction/pdf_text.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:test/test.dart';

void main() {
  test('extracts per-page text and metadata', () async {
    // Fixture generated at test time with package:pdf (Apache-2.0).
    final d = pw.Document(title: 'Cookbook Fixture', author: 'Genlib');
    d.addPage(pw.Page(build: (_) => pw.Text('Hello from page one')));
    d.addPage(pw.Page(build: (_) => pw.Text('Second page text')));
    final result = await extract(await d.save());

    expect(result.pages, hasLength(2));
    expect(result.pages[0], contains('Hello from page one'));
    expect(result.pages[0], isNot(contains('Second')));
    expect(result.pages[1], contains('Second page text'));
    expect(result.metadata['title'], 'Cookbook Fixture');
    expect(result.metadata['author'], 'Genlib');
  });
}
