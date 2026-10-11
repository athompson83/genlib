// SPDX-License-Identifier: Apache-2.0
/// POSIX shell quoting and splitting without any expansion. [shellQuote] leaves `[A-Za-z0-9@%+=:,./_-]+` unchanged and
/// otherwise wraps in single quotes (each `'` becomes `'\''`). [shellSplit] splits on unquoted space, tab or newline;
/// single quotes are literal; inside double quotes a backslash escapes only `$`, backtick, `"`, `\` and newline;
/// outside quotes a backslash escapes the next character; backslash-newline is removed; `#` starts a comment only at
/// the start of a word; `$`, `*` and `~` stay literal. Unterminated quotes and a trailing backslash throw
/// [ShellQuoteException].
library;

/// An unterminated quote or a trailing backslash.
class ShellQuoteException implements Exception {
  final String message;
  const ShellQuoteException(this.message);
  @override
  String toString() => 'ShellQuoteException: $message';
}

final _safe = RegExp(r'^[A-Za-z0-9@%+=:,./_-]+$');

/// Quotes [arg] for a POSIX shell ('' for the empty string).
String shellQuote(String arg) {
  if (arg.isEmpty) return "''";
  if (_safe.hasMatch(arg)) return arg;
  return "'${arg.replaceAll("'", "'\\''")}'";
}

/// Quotes each argument and joins them with single spaces.
String shellJoin(List<String> args) => args.map(shellQuote).join(' ');

/// Splits a command line into words the way a POSIX shell would, without expansion.
List<String> shellSplit(String line) {
  final words = <String>[];
  String? cur;
  var i = 0;
  final n = line.length;
  while (i < n) {
    final c = line[i];
    if (c == ' ' || c == '\t' || c == '\n') {
      if (cur != null) {
        words.add(cur);
        cur = null;
      }
      i++;
      continue;
    }
    if (c == '#' && cur == null) {
      final j = line.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    cur ??= '';
    if (c == "'") {
      final j = line.indexOf("'", i + 1);
      if (j < 0) throw const ShellQuoteException('unterminated single quote');
      cur += line.substring(i + 1, j);
      i = j + 1;
    } else if (c == '"') {
      i++;
      while (true) {
        if (i >= n) throw const ShellQuoteException('unterminated double quote');
        final d = line[i];
        if (d == '"') {
          i++;
          break;
        }
        if (d == r'\' && i + 1 < n && r'$`"\' '\n'.contains(line[i + 1])) {
          if (line[i + 1] != '\n') cur = cur! + line[i + 1];
          i += 2;
          continue;
        }
        cur = cur! + d;
        i++;
      }
    } else if (c == r'\') {
      if (i + 1 >= n) throw const ShellQuoteException('trailing backslash');
      if (line[i + 1] != '\n') {
        cur += line[i + 1];
      } else if (cur.isEmpty) {
        cur = null;
      }
      i += 2;
    } else {
      cur += c;
      i++;
    }
  }
  if (cur != null) words.add(cur);
  return words;
}
