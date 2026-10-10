// SPDX-License-Identifier: Apache-2.0
/// Safe arithmetic expression evaluation (no eval/mirrors) and loan/interest math.
library;

import 'dart:math' as math;

const maxExpressionLength = 1000;

class CalculatorException implements Exception {
  final String message;
  const CalculatorException(this.message);
  @override
  String toString() => 'CalculatorException: $message';
}

class AmortizationRow {
  final int period;
  final double payment, interest, principal, balance;
  const AmortizationRow(this.period, this.payment, this.interest, this.principal, this.balance);
  @override
  String toString() => 'AmortizationRow($period, $payment, $interest, $principal, $balance)';
}

enum _Kind { number, ident, op, lParen, rParen, end }

class _Token {
  final _Kind kind;
  final String text;
  final double value;
  final int position;
  const _Token(this.kind, this.text, this.value, this.position);
}

bool _isDigit(int c) => c >= 0x30 && c <= 0x39;
bool _isLetter(int c) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c == 0x5f;

/// Evaluates + - * / % ^ with parentheses and named variables using double precision.
double evaluate(String expression, [Map<String, double> variables = const {}]) {
  if (expression.length > maxExpressionLength) {
    throw const CalculatorException('expression longer than $maxExpressionLength characters');
  }
  final tokens = _tokenize(expression);
  if (tokens.length == 1) throw const CalculatorException('empty expression');
  final parser = _Parser(tokens, variables);
  final result = parser.expression();
  if (parser.current.kind == _Kind.rParen) {
    throw CalculatorException("mismatched parentheses: unexpected ')' at ${parser.current.position}");
  }
  if (parser.current.kind != _Kind.end) throw parser.unexpected();
  return _finite(result);
}

List<_Token> _tokenize(String s) {
  final tokens = <_Token>[];
  var i = 0;
  while (i < s.length) {
    final c = s.codeUnitAt(i);
    if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) {
      i++;
      continue;
    }
    final start = i;
    if (_isDigit(c) || c == 0x2e) {
      var dot = false, digits = false;
      while (i < s.length && (_isDigit(s.codeUnitAt(i)) || s.codeUnitAt(i) == 0x2e)) {
        if (s.codeUnitAt(i) == 0x2e) {
          if (dot) throw CalculatorException("unexpected '.' at $i");
          dot = true;
        } else {
          digits = true;
        }
        i++;
      }
      if (!digits) throw CalculatorException("unexpected '.' at $start");
      if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
        var j = i + 1;
        if (j < s.length && (s[j] == '+' || s[j] == '-')) j++;
        if (j >= s.length || !_isDigit(s.codeUnitAt(j))) throw CalculatorException('malformed exponent at $i');
        while (j < s.length && _isDigit(s.codeUnitAt(j))) {
          j++;
        }
        i = j;
      }
      final text = s.substring(start, i);
      tokens.add(_Token(_Kind.number, text, double.parse(text), start));
    } else if (_isLetter(c)) {
      while (i < s.length && (_isLetter(s.codeUnitAt(i)) || _isDigit(s.codeUnitAt(i)))) {
        i++;
      }
      tokens.add(_Token(_Kind.ident, s.substring(start, i), 0, start));
    } else if ('+-*/%^'.contains(s[i])) {
      tokens.add(_Token(_Kind.op, s[i], 0, i++));
    } else if (s[i] == '(') {
      tokens.add(_Token(_Kind.lParen, '(', 0, i++));
    } else if (s[i] == ')') {
      tokens.add(_Token(_Kind.rParen, ')', 0, i++));
    } else {
      throw CalculatorException("unexpected character '${s[i]}' at $i");
    }
  }
  tokens.add(_Token(_Kind.end, '', 0, s.length));
  return tokens;
}

class _Parser {
  final List<_Token> _tokens;
  final Map<String, double> _vars;
  var _pos = 0, _depth = 0;
  _Parser(this._tokens, this._vars);

  _Token get current => _tokens[_pos];
  bool _isOp(String op) => current.kind == _Kind.op && current.text == op;
  CalculatorException unexpected() => current.kind == _Kind.end
      ? const CalculatorException('unexpected end of expression')
      : CalculatorException("unexpected token '${current.text}' at ${current.position}");

  // expression := term (('+'|'-') term)*
  double expression() {
    var left = _term();
    while (_isOp('+') || _isOp('-')) {
      final op = current.text;
      _pos++;
      final right = _term();
      left = _finite(op == '+' ? left + right : left - right);
    }
    return left;
  }

  // term := unary (('*'|'/'|'%') unary)*
  double _term() {
    var left = _unary();
    while (_isOp('*') || _isOp('/') || _isOp('%')) {
      final op = current.text;
      _pos++;
      final right = _unary();
      if (op != '*' && right == 0) throw CalculatorException(op == '/' ? 'division by zero' : 'remainder by zero');
      // remainder() keeps the sign of the dividend (Dart's % operator is Euclidean).
      left = _finite(op == '*' ? left * right : op == '/' ? left / right : left.remainder(right));
    }
    return left;
  }

  // unary := ('+'|'-') unary | power   (looser than ^, tighter than * /)
  double _unary() {
    if (_isOp('-') || _isOp('+')) {
      final op = current.text;
      _pos++;
      _enter();
      final v = _unary();
      _depth--;
      return op == '-' ? -v : v;
    }
    return _power();
  }

  // power := primary ('^' unary)?   (right-associative)
  double _power() {
    final base = _primary();
    if (!_isOp('^')) return base;
    _pos++;
    _enter();
    final exponent = _unary();
    _depth--;
    return _finite(math.pow(base, exponent).toDouble());
  }

  double _primary() {
    final t = current;
    switch (t.kind) {
      case _Kind.number:
        _pos++;
        return _finite(t.value);
      case _Kind.ident:
        _pos++;
        final v = _vars[t.text];
        if (v == null) throw CalculatorException("unknown identifier '${t.text}'");
        return _finite(v);
      case _Kind.lParen:
        _pos++;
        _enter();
        final inner = expression();
        _depth--;
        if (current.kind != _Kind.rParen) throw const CalculatorException("mismatched parentheses: missing ')'");
        _pos++;
        return inner;
      case _Kind.rParen:
        throw CalculatorException("mismatched parentheses: unexpected ')' at ${t.position}");
      default:
        throw unexpected();
    }
  }

  void _enter() {
    if (++_depth > 200) throw const CalculatorException('expression nested too deeply');
  }
}

double _finite(double v) => v.isFinite ? v : throw const CalculatorException('result is not finite');

/// Rounds to cents, half away from zero.
double _round2(double v) => (v * 100).round() / 100;

void _checkLoan(double principal, double annualRatePercent, int periods) {
  if (!principal.isFinite || principal < 0) throw ArgumentError.value(principal, 'principal', 'must be non-negative and finite');
  if (!annualRatePercent.isFinite || annualRatePercent < 0) {
    throw ArgumentError.value(annualRatePercent, 'annualRatePercent', 'must be non-negative and finite');
  }
  if (periods < 1) throw ArgumentError.value(periods, 'periods', 'must be at least 1');
}

/// Fixed monthly payment rounded to cents (half away from zero).
double loanPayment(double principal, double annualRatePercent, int months) {
  _checkLoan(principal, annualRatePercent, months);
  if (annualRatePercent == 0) return _round2(principal / months);
  final r = annualRatePercent / 1200;
  return _round2(principal * r / (1 - math.pow(1 + r, -months)));
}

/// Per-period schedule computed in cents; the last payment absorbs rounding so the balance ends at 0.00.
List<AmortizationRow> amortizationSchedule(double principal, double annualRatePercent, int months) {
  final payment = loanPayment(principal, annualRatePercent, months);
  final r = annualRatePercent / 1200;
  var balance = (principal * 100).round();
  final paymentCents = (payment * 100).round();
  final rows = <AmortizationRow>[];
  for (var period = 1; period <= months; period++) {
    final interest = (balance * r).round();
    final principalPart = period == months ? balance : math.min(balance, paymentCents - interest);
    balance -= principalPart;
    rows.add(AmortizationRow(period, (principalPart + interest) / 100, interest / 100, principalPart / 100, balance / 100));
  }
  return rows;
}

/// Future value with periodic compounding, rounded to cents.
double compoundInterest(double principal, double annualRatePercent, int compoundsPerYear, double years) {
  _checkLoan(principal, annualRatePercent, compoundsPerYear);
  if (!years.isFinite || years < 0) throw ArgumentError.value(years, 'years', 'must be non-negative and finite');
  return _round2(principal * math.pow(1 + annualRatePercent / 100 / compoundsPerYear, compoundsPerYear * years));
}
