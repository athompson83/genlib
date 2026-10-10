// SPDX-License-Identifier: Apache-2.0
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genlib_inventory/main.dart';
void main() {
  testWidgets('rejects empty input, adds an item and changes its completion', (tester) async {
    await tester.pumpWidget(const InventoryApp());
    await tester.tap(find.byKey(const Key('addItem'))); await tester.pump();
    expect(find.text('Enter a title of 1 to 200 characters'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('itemTitle')), 'Ship integration');
    await tester.tap(find.byKey(const Key('addItem'))); await tester.pumpAndSettle();
    expect(find.text('Ship integration'), findsOneWidget);
    expect(find.text('0 completed'), findsOneWidget);
    await tester.tap(find.byKey(const Key('complete_1'))); await tester.pump();
    expect(find.text('1 completed'), findsOneWidget);
    expect(find.text('Enter a title of 1 to 200 characters'), findsNothing);
  });
}
