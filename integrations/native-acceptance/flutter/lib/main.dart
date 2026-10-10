// SPDX-License-Identifier: Apache-2.0
import 'package:flutter/material.dart';
import 'controller.dart';
export 'controller.dart';
void main() => runApp(const InventoryApp());
class InventoryApp extends StatefulWidget {
  const InventoryApp({super.key, this.controller, this.permissions = const SystemCameraPermissions()});
  final InventoryController? controller;
  final CameraPermissions permissions;
  @override State<InventoryApp> createState() => _InventoryAppState();
}
class _InventoryAppState extends State<InventoryApp> {
  late final InventoryController model = widget.controller ?? InventoryController();
  @override void dispose() { if (widget.controller == null) model.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => MaterialApp(
    title: 'Genlib Inventory',
    theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
    darkTheme: ThemeData(colorSchemeSeed: Colors.indigo, brightness: Brightness.dark, useMaterial3: true),
    home: AnimatedBuilder(animation: model, builder: (_, _) => model.signedIn
      ? InventoryScreen(model: model, permissions: widget.permissions) : SignInScreen(model: model)),
  );
}
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.model});
  final InventoryController model;
  @override State<SignInScreen> createState() => _SignInScreenState();
}
class _SignInScreenState extends State<SignInScreen> {
  final email = TextEditingController(), password = TextEditingController();
  @override void dispose() { email.dispose(); password.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Fixture sign-in')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      const Text('Local test account: fixture@example.invalid / fixture-only'),
      TextField(key: const Key('email'), controller: email, autocorrect: false,
        keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
      TextField(key: const Key('password'), controller: password, obscureText: true,
        decoration: const InputDecoration(labelText: 'Password')),
      if (widget.model.signInError != null) Text(widget.model.signInError!, key: const Key('signInError')),
      ElevatedButton(key: const Key('signIn'), onPressed: widget.model.signingIn ? null
        : () => widget.model.signIn(email.text, password.text),
        child: Text(widget.model.signingIn ? 'Signing in…' : 'Sign in')),
    ]),
  );
}
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key, required this.model, required this.permissions});
  final InventoryController model;
  final CameraPermissions permissions;
  @override State<InventoryScreen> createState() => _InventoryScreenState();
}
class _InventoryScreenState extends State<InventoryScreen> {
  final title = TextEditingController();
  int page = 0;
  CameraAccess camera = CameraAccess.unknown;
  bool requesting = false;
  String? permissionError;
  @override void dispose() { title.dispose(); super.dispose(); }
  Future<void> requestCamera() async {
    setState(() { requesting = true; permissionError = null; });
    try { final value = await widget.permissions.request(); if (mounted) setState(() => camera = value); }
    catch (_) { if (mounted) setState(() => permissionError = 'Camera permission is unavailable'); }
    finally { if (mounted) setState(() => requesting = false); }
  }
  @override Widget build(BuildContext context) {
    final model = widget.model;
    return Scaffold(
      appBar: AppBar(title: Text(page == 0 ? 'Genlib Inventory' : 'Fixture settings')),
      bottomNavigationBar: NavigationBar(selectedIndex: page,
        onDestinationSelected: (value) => setState(() => page = value), destinations: const [
          NavigationDestination(key: Key('inventoryTab'), icon: Icon(Icons.list), label: 'Inventory'),
          NavigationDestination(key: Key('settingsTab'), icon: Icon(Icons.settings), label: 'Settings'),
        ]),
      body: page == 1 ? ListView(padding: const EdgeInsets.all(16), children: [
        Text(model.online ? 'Online' : 'Offline', key: const Key('connectionState')),
        ElevatedButton(key: const Key('toggleConnection'), onPressed: () => model.setOnline(!model.online),
          child: Text(model.online ? 'Go offline' : 'Restore connection')),
        Text('${model.pendingChanges} pending changes', key: const Key('pendingSettings')),
        ElevatedButton(key: const Key('failSync'), onPressed: model.failNextRequest,
          child: Text(model.failNextSync ? 'Next sync will fail' : 'Make next sync fail')),
        Text('Camera ${camera.name}', key: const Key('cameraStatus')),
        const Text('Requests camera permission for a scanner access boundary; no images are captured.'),
        ElevatedButton(key: const Key('requestCamera'), onPressed: requesting ? null : requestCamera,
          child: const Text('Request camera permission')),
        if (camera == CameraAccess.blocked) ElevatedButton(key: const Key('openSettings'),
          onPressed: () async {
            try { final opened = await widget.permissions.openSettings();
              if (!opened && mounted) setState(() => permissionError = 'Open system settings manually');
            } catch (_) { if (mounted) setState(() => permissionError = 'Open system settings manually'); }
          }, child: const Text('Open system settings')),
        if (permissionError != null) Text(permissionError!),
        ElevatedButton(key: const Key('signOut'), onPressed: model.signOut, child: const Text('Sign out')),
      ]) : Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        Text(model.online ? 'Online' : 'Offline', key: const Key('connectionBanner')),
        Text('${model.pendingChanges} pending changes', key: const Key('pendingChanges')),
        if (model.syncError != null) Row(children: [
          Expanded(child: Text(model.syncError!, key: const Key('syncError'))),
          TextButton(key: const Key('retrySync'), onPressed: model.syncing ? null : model.sync, child: const Text('Retry sync')),
        ]),
        TextField(key: const Key('itemTitle'), controller: title, maxLength: 200,
          decoration: InputDecoration(labelText: 'Item title', errorText: model.itemError)),
        ElevatedButton(key: const Key('addItem'), onPressed: () async {
          await model.add(title.text); if (!mounted) return;
          if (model.itemError == null) title.clear(); FocusScope.of(context).unfocus();
        }, child: const Text('Add item')),
        Text('${model.completedCount} completed', key: const Key('completedCount')),
        Expanded(child: ListView(children: model.items.map((item) => ListTile(
          key: Key('item_${item.id}'), title: Text(item.title),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ItemDetail(model: model, id: item.id))),
          trailing: Semantics(label: 'Mark ${item.title} ${item.completed ? 'open' : 'complete'}', button: true,
            excludeSemantics: true, child: IconButton(key: Key('complete_${item.id}'),
              onPressed: () => model.complete(item.id), icon: Icon(item.completed ? Icons.check_box : Icons.check_box_outline_blank))),
        )).toList())),
      ])),
    );
  }
}
class ItemDetail extends StatelessWidget {
  const ItemDetail({super.key, required this.model, required this.id});
  final InventoryController model;
  final int id;
  @override Widget build(BuildContext context) => AnimatedBuilder(animation: model, builder: (_, _) {
    final item = model.items.singleWhere((item) => item.id == id);
    return Scaffold(appBar: AppBar(title: const Text('Item details')), body: ListView(padding: const EdgeInsets.all(24), children: [
      Text(item.title), Text(item.completed ? 'Completed' : 'Open'),
      ElevatedButton(key: const Key('detailComplete'), onPressed: () => model.complete(id), child: const Text('Toggle completion')),
      ElevatedButton(key: const Key('backToInventory'), onPressed: () => Navigator.of(context).pop(), child: const Text('Back to inventory')),
    ]));
  });
}
