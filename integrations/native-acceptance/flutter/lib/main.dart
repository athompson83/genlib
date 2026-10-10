// SPDX-License-Identifier: Apache-2.0
import 'package:flutter/material.dart';
void main() => runApp(const InventoryApp());
class InventoryApp extends StatelessWidget {
  const InventoryApp({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: InventoryScreen());
}
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});
  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}
class _Item {
  _Item(this.id, this.title);
  final int id;
  final String title;
  bool completed = false;
}
class _InventoryScreenState extends State<InventoryScreen> {
  final _title = TextEditingController();
  final _items = <_Item>[];
  String? _error;
  @override
  void dispose() { _title.dispose(); super.dispose(); }
  void _add() {
    final title = _title.text.trim();
    if (title.isEmpty || title.length > 200) {
      setState(() => _error = 'Enter a title of 1 to 200 characters');
      return;
    }
    setState(() { _items.add(_Item(_items.length + 1, title)); _error = null; });
    _title.clear();
    FocusScope.of(context).unfocus();
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Genlib Inventory')),
    body: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
      TextField(key: const Key('itemTitle'), controller: _title, maxLength: 200,
        decoration: InputDecoration(labelText: 'Item title', errorText: _error),
        onSubmitted: (_) => _add()),
      ElevatedButton(key: const Key('addItem'), onPressed: _add, child: const Text('Add item')),
      Text('${_items.where((item) => item.completed).length} completed', key: const Key('completedCount')),
      Expanded(child: ListView(children: _items.map((item) => ListTile(
        title: Text(item.title),
        trailing: Semantics(label: 'Mark ${item.title} ${item.completed ? 'open' : 'complete'}',
          button: true, excludeSemantics: true,
          child: IconButton(key: Key('complete_${item.id}'),
            onPressed: () => setState(() => item.completed = !item.completed),
            icon: Icon(item.completed ? Icons.check_box : Icons.check_box_outline_blank))),
      )).toList())),
    ])),
  );
}
