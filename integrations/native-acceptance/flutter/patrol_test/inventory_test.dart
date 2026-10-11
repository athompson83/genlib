// SPDX-License-Identifier: Apache-2.0
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';
import 'package:genlib_inventory/main.dart';
void main() {
  patrolTest('sign-in, native permission, offline recovery, navigation and lifecycle', ($) async {
    await $.pumpWidgetAndSettle(const InventoryApp());
    await $(#signIn).tap(); expect($('Fixture sign-in failed'), findsOneWidget);
    await $(#email).enterText('fixture@example.invalid');
    await $(#password).enterText('fixture-only'); await $(#signIn).tap();
    await $(#settingsTab).tap();
    await $(#requestCamera).tap();
    // Reset this fixture app's camera permission before running this gate.
    expect(await $.platform.mobile.isPermissionDialogVisible(timeout: const Duration(seconds: 5)), isTrue,
      reason: 'A fresh native permission prompt is required; reset fixture camera permission');
    await $.platform.mobile.grantPermissionWhenInUse();
    await $.pumpAndSettle(); expect($('Camera granted'), findsOneWidget);
    await $(#toggleConnection).tap(); await $(#inventoryTab).tap();
    await $(#itemTitle).enterText('Offline item'); await $(#addItem).tap();
    expect($('1 pending changes'), findsOneWidget);
    await $(#item_1).tap(); expect($('Item details'), findsOneWidget);
    await $(#detailComplete).tap(); await $(#backToInventory).tap();
    expect($('1 completed'), findsOneWidget);
    await $.platform.mobile.pressHome(); await $.platform.mobile.openApp();
    expect($('Offline item'), findsOneWidget); expect($('2 pending changes'), findsOneWidget);
    await $(#settingsTab).tap(); await $(#failSync).tap(); await $(#toggleConnection).tap();
    await $(#inventoryTab).tap();
    expect($('Unable to sync. Changes are still on this device.'), findsOneWidget);
    await $(#retrySync).tap(); expect($('0 pending changes'), findsOneWidget);
    expect($('1 completed'), findsOneWidget);
    await $(#settingsTab).tap(); await $(#signOut).scrollTo(); await $(#signOut).tap();
    expect($('Fixture sign-in'), findsOneWidget);
  });
}
