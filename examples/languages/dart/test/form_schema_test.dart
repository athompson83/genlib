// SPDX-License-Identifier: Apache-2.0
import 'package:genlib_validation_example/form_schema.dart';

import 'src/checks.dart';

void runFormSchemaTests(Checks c) {
  const schema = [
    FormField('name', FieldType.string, required: true, minLength: 2, maxLength: 5),
    FormField('age', FieldType.integer, min: 18, max: 120),
    FormField('email', FieldType.email, required: true),
    FormField('plan', FieldType.string, allowed: ['free', 'pro']),
    FormField('code', FieldType.string, pattern: r'[A-Z]{3}-\d{2}'),
    FormField('start', FieldType.date),
  ];
  String show(Map<String, List<String>> errors) => errors.entries.map((e) => '${e.key}:[${e.value.join(',')}]').join('; ');
  c.eq('form valid', '',
      show(validateForm(schema, {'name': 'Al', 'age': 30, 'email': 'a@b.co', 'plan': 'pro', 'code': 'ABC-12', 'start': '2024-02-29'})));
  c.eq('form required/email', 'name:[required]; email:[email]', show(validateForm(schema, {'name': '', 'email': 'bad'})));
  c.eq('form many', 'name:[maxLength]; age:[type]; plan:[enum]; code:[pattern]; start:[date]',
      show(validateForm(schema, {'name': 'Abcdef', 'age': 17.5, 'email': 'a@b.co', 'plan': 'team', 'code': 'abc-12', 'start': '2023-02-29'})));
  c.eq('form numeric string', 'age:[type]', show(validateForm(schema, {'name': 'Al', 'email': 'a@b.co', 'age': '30'})));
  c.eq('form unknown', 'extra:[unknown]', show(validateForm(schema, {'name': 'Al', 'email': 'a@b.co', 'extra': 1})));
  c.eq('form allowUnknown', '', show(validateForm(schema, {'name': 'Al', 'email': 'a@b.co', 'extra': 1}, allowUnknown: true)));
  c.eq('form max', 'age:[max]', show(validateForm(schema, {'name': 'Al', 'email': 'a@b.co', 'age': 121})));
  c.eq('form code points', 'name:[minLength]', show(validateForm(schema, {'name': 'Ā', 'email': 'a@b.co'})));
  c.eq('form boolean not number', 'age:[type]', show(validateForm(schema, {'name': 'Al', 'email': 'a@b.co', 'age': true})));
}

void main() {
  final c = Checks('form-schema');
  runFormSchemaTests(c);
  c.finish();
}
