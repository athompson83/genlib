// SPDX-License-Identifier: Apache-2.0
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
enum CameraAccess { unknown, granted, denied, blocked }
abstract interface class CameraPermissions {
  Future<CameraAccess> request();
  Future<bool> openSettings();
}
class SystemCameraPermissions implements CameraPermissions {
  const SystemCameraPermissions();
  @override Future<CameraAccess> request() async {
    final status = await Permission.camera.request();
    if (status.isGranted) return CameraAccess.granted;
    return status.isPermanentlyDenied || status.isRestricted ? CameraAccess.blocked : CameraAccess.denied;
  }
  @override Future<bool> openSettings() => openAppSettings();
}
class InventoryItem {
  InventoryItem(this.id, this.title, {this.completed = false});
  final int id;
  final String title;
  bool completed;
  InventoryItem copy() => InventoryItem(id, title, completed: completed);
}
/// Public deterministic fixture identity and in-memory remote service.
/// Navigation/backgrounding preserves state; process-death persistence is not claimed.
class InventoryController extends ChangeNotifier {
  final List<InventoryItem> _items = [];
  List<InventoryItem> remoteItems = [];
  bool signedIn = false, signingIn = false, online = true, syncing = false, failNextSync = false;
  bool _disposed = false;
  @override void dispose() { _disposed = true; _session++; super.dispose(); }
  String? signInError, itemError, syncError;
  int _revision = 0, _acknowledged = 0, _nextId = 1, _session = 0;
  List<InventoryItem> get items => List.unmodifiable(_items);
  int get pendingChanges => _revision - _acknowledged;
  int get completedCount => _items.where((item) => item.completed).length;
  Future<void> signIn(String email, String password) async {
    if (signingIn) return;
    signingIn = true; signInError = null; final session = _session; notifyListeners();
    await Future<void>.delayed(Duration.zero);
    if (_disposed || session != _session) return;
    signedIn = email.trim() == 'fixture@example.invalid' && password == 'fixture-only';
    signingIn = false;
    if (!signedIn) signInError = 'Fixture sign-in failed';
    notifyListeners();
  }
  void signOut() {
    _session++; signedIn = false; signInError = null; _items.clear(); remoteItems = [];
    _revision = 0; _acknowledged = 0; _nextId = 1; syncing = false;
    online = true; failNextSync = false; syncError = null; itemError = null;
    notifyListeners();
  }
  Future<void> add(String value) async {
    if (!signedIn) throw StateError('Sign in first');
    final title = value.trim();
    if (title.isEmpty || title.runes.length > 200) {
      itemError = 'Enter a title of 1 to 200 characters'; notifyListeners(); return;
    }
    _items.add(InventoryItem(_nextId++, title)); _revision++; itemError = null;
    notifyListeners(); await sync();
  }
  Future<void> complete(int id) async {
    if (!signedIn) throw StateError('Sign in first');
    final item = _items.singleWhere((item) => item.id == id);
    item.completed = !item.completed; _revision++; notifyListeners(); await sync();
  }
  Future<void> setOnline(bool value) async {
    online = value; notifyListeners(); if (online) await sync();
  }
  void failNextRequest() { failNextSync = true; notifyListeners(); }
  Future<void> sync() async {
    if (_disposed || !signedIn || !online || syncing || pendingChanges == 0) return;
    syncing = true; syncError = null; notifyListeners();
    final session = _session;
    try {
      // Edits made during an in-flight request are a later revision. Drain them
      // before releasing the sync flag, without retrying a failed request forever.
      while (!_disposed && _session == session && signedIn && online && pendingChanges > 0) {
        final revision = _revision;
        final submitted = _items.map((item) => item.copy()).toList();
        await Future<void>.delayed(Duration.zero);
        if (_disposed || _session != session || !signedIn || !online) return;
        if (failNextSync) { failNextSync = false; throw StateError('Fixture connection failure'); }
        remoteItems = submitted; _acknowledged = revision;
      }
    } catch (_) { if (!_disposed && _session == session) syncError = 'Unable to sync. Changes are still on this device.'; }
    finally { if (!_disposed && _session == session) { syncing = false; notifyListeners(); } }
  }
}
