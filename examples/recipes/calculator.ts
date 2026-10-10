// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: safe arithmetic expression evaluator plus loan and interest math. Original source; copy and adapt.
// A small tokenizer and recursive-descent parser: no eval, Function, reflection or property
// lookup, so user input can only do arithmetic on numbers and caller-supplied variables.
// Results are IEEE-754 doubles; money helpers round to cents (half away from zero) per step.
// For ledger-grade amounts, keep integer minor units (see the money recipe).

export class CalculatorError extends Error {
  constructor(message: string) { super(message); this.name = "CalculatorError"; }
}

type Token = { kind: "num"; value: number } | { kind: "id"; name: string } | { kind: "op"; op: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s+|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/%^()])/y;
  while (pattern.lastIndex < input.length) {
    const at = pattern.lastIndex;
    const match = pattern.exec(input);
    if (!match) throw new CalculatorError(`Unexpected character at position ${at}`);
    if (match[1] !== undefined) tokens.push({ kind: "num", value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ kind: "id", name: match[2] });
    else if (match[3] !== undefined) tokens.push({ kind: "op", op: match[3] });
  }
  return tokens;
}

const finite = (value: number): number => {
  if (!Number.isFinite(value)) throw new CalculatorError("Result is not a finite number");
  return value;
};

/**
 * Evaluates + - * / % ^ and parentheses. Unary +/- binds looser than ^ (-2^2 = -4) and tighter
 * than * and /; ^ is right-associative; % keeps the sign of the dividend.
 */
export function evaluate(expression: string, variables: Readonly<Record<string, number>> = {}): number {
  if (expression.length > 1000) throw new CalculatorError("Expression is longer than 1000 characters");
  const tokens = tokenize(expression);
  if (tokens.length === 0) throw new CalculatorError("Expression is empty");
  let pos = 0;
  const peekOp = (): string | undefined => { const t = tokens[pos]; return t?.kind === "op" ? t.op : undefined; };

  function expr(): number {
    let left = term();
    for (let op = peekOp(); op === "+" || op === "-"; op = peekOp()) {
      pos++;
      const right = term();
      left = finite(op === "+" ? left + right : left - right);
    }
    return left;
  }
  function term(): number {
    let left = unary();
    for (let op = peekOp(); op === "*" || op === "/" || op === "%"; op = peekOp()) {
      pos++;
      const right = unary();
      if (op !== "*" && right === 0) throw new CalculatorError(op === "/" ? "Division by zero" : "Remainder by zero");
      left = finite(op === "*" ? left * right : op === "/" ? left / right : left % right);
    }
    return left;
  }
  function unary(): number {
    const op = peekOp();
    if (op === "-" || op === "+") { pos++; const value = unary(); return op === "-" ? -value : value; }
    return power();
  }
  function power(): number {
    const base = primary();
    if (peekOp() !== "^") return base;
    pos++;
    return finite(base ** unary());
  }
  function primary(): number {
    const token = tokens[pos++];
    if (!token) throw new CalculatorError("Unexpected end of expression");
    if (token.kind === "num") return finite(token.value);
    if (token.kind === "id") {
      const value = Object.hasOwn(variables, token.name) ? variables[token.name] : undefined;
      if (typeof value !== "number") throw new CalculatorError(`Unknown identifier: ${token.name}`);
      return finite(value);
    }
    if (token.op === "(") {
      const value = expr();
      if (peekOp() !== ")") throw new CalculatorError("Mismatched parentheses: expected )");
      pos++;
      return value;
    }
    throw new CalculatorError(`Unexpected token: ${token.op}`);
  }

  const result = expr();
  const rest = tokens[pos];
  if (rest) throw new CalculatorError(rest.kind === "op" && rest.op === ")" ? "Mismatched parentheses: unexpected )" : "Unexpected token after expression");
  return finite(result);
}

/** Rounds to cents, half away from zero, using the shortest decimal representation (1.005 -> 1.01). */
export function roundCents(value: number): number {
  const abs = Math.abs(value);
  const text = String(abs);
  const rounded = text.includes("e") ? Math.round(abs * 100) / 100 : Number(`${Math.round(Number(`${text}e2`))}e-2`);
  return value < 0 ? -rounded : rounded;
}

function checkLoan(principal: number, annualRatePercent: number, periods: number): void {
  if (!Number.isFinite(principal) || principal <= 0) throw new RangeError("principal must be a positive number");
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) throw new RangeError("annual rate must be zero or positive");
  if (!Number.isInteger(periods) || periods < 1 || periods > 12_000) throw new RangeError("periods must be a positive integer");
}

/** Level monthly payment, rounded to cents. A 0% rate divides the principal evenly. */
export function loanPayment(principal: number, annualRatePercent: number, months: number): number {
  checkLoan(principal, annualRatePercent, months);
  const r = annualRatePercent / 1200;
  return roundCents(r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months));
}

export interface AmortizationRow { period: number; payment: number; interest: number; principal: number; balance: number }

/** Monthly schedule; the final payment absorbs rounding so the balance ends at exactly 0.00. */
export function amortizationSchedule(principal: number, annualRatePercent: number, months: number): AmortizationRow[] {
  const payment = loanPayment(principal, annualRatePercent, months);
  const r = annualRatePercent / 1200;
  const rows: AmortizationRow[] = [];
  let balance = roundCents(principal);
  for (let period = 1; period <= months; period++) {
    const interest = roundCents(balance * r);
    const toPrincipal = period === months ? balance : Math.min(balance, roundCents(payment - interest));
    balance = roundCents(balance - toPrincipal);
    rows.push({ period, payment: roundCents(interest + toPrincipal), interest, principal: toPrincipal, balance });
  }
  return rows;
}

/** Future value of `principal` compounded `compoundsPerYear` times a year, rounded to cents. */
export function compoundInterest(principal: number, annualRatePercent: number, compoundsPerYear: number, years: number): number {
  checkLoan(principal, annualRatePercent, compoundsPerYear);
  if (!Number.isFinite(years) || years < 0) throw new RangeError("years must be zero or positive");
  return roundCents(finite(principal * (1 + annualRatePercent / 100 / compoundsPerYear) ** (compoundsPerYear * years)));
}
