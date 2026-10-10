// SPDX-License-Identifier: Apache-2.0
import 'package:genlib_validation_example/calculator.dart';

import 'src/checks.dart';

void runCalculatorTests(Checks c) {
  c.eq('2 + 3 * 4', 14.0, evaluate('2 + 3 * 4'));
  c.eq('(2+3)*4', 20.0, evaluate('(2+3)*4'));
  c.eq('2^3^2', 512.0, evaluate('2^3^2'));
  c.eq('-2^2', -4.0, evaluate('-2^2'));
  c.eq('10 % 4', 2.0, evaluate('10 % 4'));
  c.eq('-7 % 3', -1.0, evaluate('-7 % 3'));
  c.eq('1.5e2 / 3', 50.0, evaluate('1.5e2 / 3'));
  c.eq('a*2+b', 6.5, evaluate('a*2+b', {'a': 3, 'b': 0.5}));
  for (final bad in ['1/0', '2 % 0', '(1+2', '1+', 'x+1', '', '1 + 2)', '2^9999', '1' * 1001]) {
    c.throws<CalculatorException>("calc error '${bad.length > 20 ? '${bad.substring(0, 20)}...' : bad}'", () => evaluate(bad));
  }
  c.eq('loan 200000/6/360', 1199.10, loanPayment(200000, 6, 360));
  c.eq('loan 10000/0/10', 1000.00, loanPayment(10000, 0, 10));
  c.eq('loan 1000/12/12', 88.85, loanPayment(1000, 12, 12));
  final schedule = amortizationSchedule(1000, 12, 12);
  c.eq('schedule rows', 12, schedule.length);
  final first = schedule.first;
  c.check('schedule row1',
      first.period == 1 && first.payment == 88.85 && first.interest == 10.00 && first.principal == 78.85 && first.balance == 921.15);
  c.eq('schedule last balance', 0.0, schedule.last.balance);
  c.eq('schedule principal sum', 100000, schedule.fold<int>(0, (sum, r) => sum + (r.principal * 100).round()));
  c.eq('compound 1000/5/12/10', 1647.01, compoundInterest(1000, 5, 12, 10));
}

void main() {
  final c = Checks('calculator');
  runCalculatorTests(c);
  c.finish();
}
