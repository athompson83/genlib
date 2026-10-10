# SPDX-License-Identifier: Apache-2.0
import unittest

from calculator import (CalculatorError, amortization_schedule, compound_interest, evaluate,
                        loan_payment, round_cents)


class CalculatorTests(unittest.TestCase):
    def test_evaluate(self):
        cases = {"2 + 3 * 4": 14, "(2+3)*4": 20, "2^3^2": 512, "-2^2": -4, "10 % 4": 2,
                 "-7 % 3": -1, "1.5e2 / 3": 50, "2^-1": 0.5}
        for expression, expected in cases.items():
            self.assertEqual(evaluate(expression), expected, expression)
        self.assertEqual(evaluate("a*2+b", {"a": 3, "b": 0.5}), 6.5)

    def test_errors(self):
        for bad in ["1/0", "2 % 0", "(1+2", "1+", "x+1", "", "1 + 2)", "1 2", "2 $ 3",
                    "__class__", "1e308*10", "(-8)^(1/3)", "1" * 1001]:
            with self.assertRaises(CalculatorError, msg=bad[:20]):
                evaluate(bad)

    def test_finance(self):
        self.assertEqual(loan_payment(200000, 6, 360), 1199.10)
        self.assertEqual(loan_payment(10000, 0, 10), 1000.00)
        self.assertEqual(loan_payment(1000, 12, 12), 88.85)
        rows = amortization_schedule(1000, 12, 12)
        self.assertEqual(len(rows), 12)
        self.assertEqual(rows[0], {"period": 1, "payment": 88.85, "interest": 10.00,
                                   "principal": 78.85, "balance": 921.15})
        self.assertEqual(rows[-1]["balance"], 0.0)
        self.assertEqual(round_cents(sum(r["principal"] for r in rows)), 1000.00)
        big = amortization_schedule(200000, 6, 360)
        self.assertEqual(big[-1]["balance"], 0.0)
        self.assertEqual(round_cents(sum(r["principal"] for r in big)), 200000.00)
        self.assertEqual(compound_interest(1000, 5, 12, 10), 1647.01)
        self.assertEqual(round_cents(1.005), 1.01)
        self.assertEqual(round_cents(-2.675), -2.68)
        with self.assertRaises(ValueError):
            loan_payment(1000, 5, 0)


if __name__ == "__main__":
    unittest.main()
