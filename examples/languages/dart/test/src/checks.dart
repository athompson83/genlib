// SPDX-License-Identifier: Apache-2.0
/// Minimal dependency-free check harness; `finish` sets a non-zero exit code on failure.
library;

import 'dart:io';

class Checks {
  final String suite;
  int passed = 0, failed = 0;
  Checks(this.suite);

  void check(String name, bool condition) {
    if (condition) {
      passed++;
    } else {
      failed++;
      stderr.writeln('FAIL [$suite]: $name');
    }
  }

  void eq(String name, Object? expected, Object? actual) {
    final ok = expected == actual;
    if (!ok) stderr.writeln('  expected <$expected> got <$actual>');
    check(name, ok);
  }

  void throws<T extends Object>(String name, void Function() action, [bool Function(T)? predicate]) {
    try {
      action();
      check('$name (no exception)', false);
    } on T catch (e) {
      check(name, predicate?.call(e) ?? true);
    } catch (e) {
      stderr.writeln('  unexpected ${e.runtimeType}: $e');
      check(name, false);
    }
  }

  /// Prints a summary and sets [exitCode] to 1 when any check failed.
  void finish() {
    stdout.writeln('Dart $suite checks: $passed passed, $failed failed');
    if (failed > 0) exitCode = 1;
  }
}
