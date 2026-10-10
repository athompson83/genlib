// SPDX-License-Identifier: Apache-2.0
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';
import 'package:genlib_inventory/main.dart';
void main() {
  patrolTest('item state survives a mobile foreground/background transition', ($) async {
    await $.pumpWidgetAndSettle(const InventoryApp());
    await $(#itemTitle).enterText('Ship integration');
    await $(#addItem).tap();
    expect($('Ship integration'), findsOneWidget);
    await $(#complete_1).tap();
    expect($('1 completed'), findsOneWidget);
    await $.platform.mobile.pressHome();
    await $.platform.mobile.openApp();
    expect($('Ship integration'), findsOneWidget);
    expect($('1 completed'), findsOneWidget);
  });
}
