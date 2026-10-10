// SPDX-License-Identifier: Apache-2.0
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genlib_inventory/main.dart';
class FakePermissions implements CameraPermissions {
  final results = [CameraAccess.denied, CameraAccess.granted];
  @override Future<CameraAccess> request() async => results.removeAt(0);
  @override Future<bool> openSettings() async => false;
}
Future<void> signIn(WidgetTester tester) async {
  await tester.enterText(find.byKey(const Key('email')), 'fixture@example.invalid');
  await tester.enterText(find.byKey(const Key('password')), 'fixture-only');
  await tester.tap(find.byKey(const Key('signIn'))); await tester.pumpAndSettle();
}
void main() {
  test('overlapping online edits drain the latest revision without duplicates', () async {
    final model = InventoryController();
    await model.signIn('fixture@example.invalid', 'fixture-only');
    final first = model.add('One');
    final second = model.add('Two');
    final completion = model.complete(1);
    await Future.wait([first, second, completion]);
    expect(model.pendingChanges, 0); expect(model.syncing, isFalse);
    expect(model.remoteItems.map((item) => item.title).toList(), ['One', 'Two']);
    expect(model.remoteItems.first.completed, isTrue); model.dispose();
  });
  test('sign-out invalidates an in-flight upload', () async {
    final model = InventoryController();
    await model.signIn('fixture@example.invalid', 'fixture-only');
    final pending = model.add('Private fixture'); model.signOut(); await pending;
    expect(model.signedIn, isFalse); expect(model.items, isEmpty);
    expect(model.remoteItems, isEmpty); expect(model.pendingChanges, 0); model.dispose();
  });
  testWidgets('rejects bad identity then creates, navigates and completes', (tester) async {
    await tester.pumpWidget(InventoryApp(permissions: FakePermissions()));
    await tester.tap(find.byKey(const Key('signIn'))); await tester.pumpAndSettle();
    expect(find.text('Fixture sign-in failed'), findsOneWidget); await signIn(tester);
    await tester.tap(find.byKey(const Key('addItem'))); await tester.pumpAndSettle();
    expect(find.text('Enter a title of 1 to 200 characters'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('itemTitle')), 'Ship integration');
    await tester.tap(find.byKey(const Key('addItem'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item_1'))); await tester.pumpAndSettle();
    expect(find.text('Item details'), findsOneWidget);
    await tester.tap(find.byKey(const Key('detailComplete'))); await tester.pumpAndSettle();
    expect(find.text('Completed'), findsOneWidget);
    await tester.tap(find.byKey(const Key('backToInventory'))); await tester.pumpAndSettle();
    expect(find.text('1 completed'), findsOneWidget);
  });
  testWidgets('permission denial is recoverable and sign-out removes identity', (tester) async {
    await tester.pumpWidget(InventoryApp(permissions: FakePermissions())); await signIn(tester);
    await tester.tap(find.byKey(const Key('settingsTab'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('requestCamera'))); await tester.pumpAndSettle();
    expect(find.text('Camera denied'), findsOneWidget);
    await tester.tap(find.byKey(const Key('requestCamera'))); await tester.pumpAndSettle();
    expect(find.text('Camera granted'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('signOut')));
    await tester.tap(find.byKey(const Key('signOut'))); await tester.pumpAndSettle();
    expect(find.text('Fixture sign-in'), findsOneWidget);
  });
  testWidgets('offline changes survive navigation, failure and retry without duplicates', (tester) async {
    final model = InventoryController();
    await tester.pumpWidget(InventoryApp(controller: model, permissions: FakePermissions())); await signIn(tester);
    await tester.tap(find.byKey(const Key('settingsTab'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('toggleConnection'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('inventoryTab'))); await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('itemTitle')), 'Offline item');
    await tester.tap(find.byKey(const Key('addItem'))); await tester.pumpAndSettle();
    expect(find.text('1 pending changes'), findsOneWidget); expect(model.remoteItems, isEmpty);
    await tester.tap(find.byKey(const Key('settingsTab'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('failSync'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('toggleConnection'))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('inventoryTab'))); await tester.pumpAndSettle();
    expect(find.text('Unable to sync. Changes are still on this device.'), findsOneWidget);
    expect(model.pendingChanges, 1); expect(model.remoteItems, isEmpty);
    await tester.tap(find.byKey(const Key('retrySync'))); await tester.pumpAndSettle();
    expect(find.text('0 pending changes'), findsOneWidget);
    expect(model.remoteItems.single.title, 'Offline item');
    await model.sync(); expect(model.remoteItems.length, 1);
  });
}
