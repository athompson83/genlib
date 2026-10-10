# SPDX-License-Identifier: Apache-2.0
"""Safe arithmetic expression evaluator plus loan and interest math.

A tokenizer and recursive-descent parser: no eval, exec, ast evaluation or attribute access,
so input can only do arithmetic on numbers and caller-supplied variables. Results are floats;
money helpers round to cents (half away from zero). Use integer minor units for ledgers.
"""
import math
import re
from collections.abc import Mapping
from decimal import ROUND_HALF_UP, Decimal

_TOKEN = re.compile(r"\s+|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)"
                    r"|([A-Za-z_][A-Za-z0-9_]*)|([-+*/%^()])", re.ASCII)


class CalculatorError(ValueError):
    """Raised for any invalid expression or non-finite result."""


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise CalculatorError("result is not a finite number")
    return value


def _tokenize(text: str) -> list[tuple[str, object]]:
    tokens: list[tuple[str, object]] = []
    pos = 0
    while pos < len(text):
        match = _TOKEN.match(text, pos)
        if not match:
            raise CalculatorError(f"unexpected character at position {pos}")
        pos = match.end()
        if match.group(1) is not None:
            tokens.append(("num", float(match.group(1))))
        elif match.group(2) is not None:
            tokens.append(("id", match.group(2)))
        elif match.group(3) is not None:
            tokens.append(("op", match.group(3)))
    return tokens


class _Parser:
    def __init__(self, tokens: list[tuple[str, object]], variables: Mapping[str, float]):
        self.tokens, self.variables, self.pos = tokens, variables, 0

    def op(self) -> object:
        token = self.tokens[self.pos] if self.pos < len(self.tokens) else None
        return token[1] if token and token[0] == "op" else None

    def expr(self) -> float:
        left = self.term()
        while (op := self.op()) in ("+", "-"):
            self.pos += 1
            right = self.term()
            left = _finite(left + right if op == "+" else left - right)
        return left

    def term(self) -> float:
        left = self.unary()
        while (op := self.op()) in ("*", "/", "%"):
            self.pos += 1
            right = self.unary()
            if op != "*" and right == 0:
                raise CalculatorError("division by zero" if op == "/" else "remainder by zero")
            left = _finite(left * right if op == "*" else left / right if op == "/" else math.fmod(left, right))
        return left

    def unary(self) -> float:
        op = self.op()
        if op in ("-", "+"):
            self.pos += 1
            value = self.unary()
            return -value if op == "-" else value
        return self.power()

    def power(self) -> float:
        base = self.primary()
        if self.op() != "^":
            return base
        self.pos += 1
        exponent = self.unary()
        try:
            return _finite(math.pow(base, exponent))
        except (OverflowError, ValueError) as exc:
            raise CalculatorError("result is not a finite number") from exc

    def primary(self) -> float:
        if self.pos >= len(self.tokens):
            raise CalculatorError("unexpected end of expression")
        kind, value = self.tokens[self.pos]
        self.pos += 1
        if kind == "num":
            return _finite(value)  # type: ignore[arg-type]
        if kind == "id":
            found = self.variables.get(value) if isinstance(self.variables, Mapping) else None  # type: ignore[arg-type]
            if isinstance(found, bool) or not isinstance(found, (int, float)):
                raise CalculatorError(f"unknown identifier: {value}")
            return _finite(float(found))
        if value == "(":
            result = self.expr()
            if self.op() != ")":
                raise CalculatorError("mismatched parentheses: expected )")
            self.pos += 1
            return result
        raise CalculatorError(f"unexpected token: {value}")


def evaluate(expression: str, variables: Mapping[str, float] | None = None) -> float:
    """Evaluate + - * / % ^ and parentheses. -2^2 == -4; ^ is right-associative;
    % keeps the sign of the dividend."""
    if len(expression) > 1000:
        raise CalculatorError("expression is longer than 1000 characters")
    tokens = _tokenize(expression)
    if not tokens:
        raise CalculatorError("expression is empty")
    parser = _Parser(tokens, variables or {})
    result = parser.expr()
    if parser.pos < len(tokens):
        rest = tokens[parser.pos]
        raise CalculatorError("mismatched parentheses: unexpected )" if rest == ("op", ")")
                              else "unexpected token after expression")
    return _finite(result)


def round_cents(value: float) -> float:
    """Round to cents, half away from zero, from the shortest repr (1.005 -> 1.01)."""
    return float(Decimal(repr(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _check_loan(principal: float, annual_rate_percent: float, periods: int) -> None:
    if not math.isfinite(principal) or principal <= 0:
        raise ValueError("principal must be a positive number")
    if not math.isfinite(annual_rate_percent) or annual_rate_percent < 0:
        raise ValueError("annual rate must be zero or positive")
    if isinstance(periods, bool) or not isinstance(periods, int) or not 1 <= periods <= 12_000:
        raise ValueError("periods must be a positive integer")


def loan_payment(principal: float, annual_rate_percent: float, months: int) -> float:
    """Level monthly payment rounded to cents; a 0% rate divides the principal evenly."""
    _check_loan(principal, annual_rate_percent, months)
    r = annual_rate_percent / 1200
    return round_cents(principal / months if r == 0 else principal * r / (1 - (1 + r) ** -months))


def amortization_schedule(principal: float, annual_rate_percent: float, months: int) -> list[dict[str, float]]:
    """Rows of period/payment/interest/principal/balance; the last payment absorbs rounding."""
    payment = loan_payment(principal, annual_rate_percent, months)
    r = annual_rate_percent / 1200
    rows: list[dict[str, float]] = []
    balance = round_cents(principal)
    for period in range(1, months + 1):
        interest = round_cents(balance * r)
        to_principal = balance if period == months else min(balance, round_cents(payment - interest))
        balance = round_cents(balance - to_principal)
        rows.append({"period": period, "payment": round_cents(interest + to_principal),
                     "interest": interest, "principal": to_principal, "balance": balance})
    return rows


def compound_interest(principal: float, annual_rate_percent: float, compounds_per_year: int, years: float) -> float:
    """Future value compounded compounds_per_year times a year, rounded to cents."""
    _check_loan(principal, annual_rate_percent, compounds_per_year)
    if not math.isfinite(years) or years < 0:
        raise ValueError("years must be zero or positive")
    try:
        value = principal * (1 + annual_rate_percent / 100 / compounds_per_year) ** (compounds_per_year * years)
    except OverflowError as exc:
        raise CalculatorError("result is not a finite number") from exc
    return round_cents(_finite(value))
