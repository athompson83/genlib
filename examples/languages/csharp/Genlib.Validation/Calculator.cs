// SPDX-License-Identifier: Apache-2.0
using System.Globalization;

namespace Genlib.Validation;

public sealed class CalculatorException : Exception {
    public CalculatorException(string message) : base(message) { }
}

public sealed record AmortizationRow(int Period, double Payment, double Interest, double Principal, double Balance);

/// <summary>Safe arithmetic expression evaluation (no eval/reflection) and loan/interest math.</summary>
public static class Calculator {
    public const int MaxExpressionLength = 1000;

    private enum Kind { Number, Ident, Op, LParen, RParen, End }
    private readonly record struct Token(Kind Kind, string Text, double Value, int Position);

    /// <summary>Evaluates + - * / % ^ with parentheses and named variables using double precision.</summary>
    public static double Evaluate(string expression, IReadOnlyDictionary<string, double>? variables = null) {
        ArgumentNullException.ThrowIfNull(expression);
        if (expression.Length > MaxExpressionLength) throw new CalculatorException($"expression longer than {MaxExpressionLength} characters");
        var tokens = Tokenize(expression);
        if (tokens.Count == 1) throw new CalculatorException("empty expression");
        var parser = new Parser(tokens, variables ?? new Dictionary<string, double>());
        double result = parser.ParseExpression();
        if (parser.Current.Kind == Kind.RParen) throw new CalculatorException($"mismatched parentheses: unexpected ')' at {parser.Current.Position}");
        if (parser.Current.Kind != Kind.End) throw parser.Unexpected();
        return Finite(result);
    }

    private static List<Token> Tokenize(string s) {
        var tokens = new List<Token>();
        int i = 0;
        while (i < s.Length) {
            char c = s[i];
            if (c is ' ' or '\t' or '\n' or '\r') { i++; continue; }
            int start = i;
            if (char.IsAsciiDigit(c) || c == '.') {
                bool dot = false, digits = false;
                while (i < s.Length && (char.IsAsciiDigit(s[i]) || s[i] == '.')) {
                    if (s[i] == '.') { if (dot) throw new CalculatorException($"unexpected '.' at {i}"); dot = true; } else digits = true;
                    i++;
                }
                if (!digits) throw new CalculatorException($"unexpected '.' at {start}");
                if (i < s.Length && (s[i] == 'e' || s[i] == 'E')) {
                    int j = i + 1;
                    if (j < s.Length && (s[j] == '+' || s[j] == '-')) j++;
                    if (j >= s.Length || !char.IsAsciiDigit(s[j])) throw new CalculatorException($"malformed exponent at {i}");
                    while (j < s.Length && char.IsAsciiDigit(s[j])) j++;
                    i = j;
                }
                string text = s[start..i];
                tokens.Add(new Token(Kind.Number, text, double.Parse(text, NumberStyles.Float, CultureInfo.InvariantCulture), start));
            } else if (char.IsAsciiLetter(c) || c == '_') {
                while (i < s.Length && (char.IsAsciiLetterOrDigit(s[i]) || s[i] == '_')) i++;
                tokens.Add(new Token(Kind.Ident, s[start..i], 0, start));
            } else if ("+-*/%^".IndexOf(c) >= 0) { tokens.Add(new Token(Kind.Op, c.ToString(), 0, i++)); }
            else if (c == '(') tokens.Add(new Token(Kind.LParen, "(", 0, i++));
            else if (c == ')') tokens.Add(new Token(Kind.RParen, ")", 0, i++));
            else throw new CalculatorException($"unexpected character '{c}' at {i}");
        }
        tokens.Add(new Token(Kind.End, "", 0, s.Length));
        return tokens;
    }

    private sealed class Parser {
        private readonly List<Token> _tokens; private readonly IReadOnlyDictionary<string, double> _vars; private int _pos; private int _depth;
        public Parser(List<Token> tokens, IReadOnlyDictionary<string, double> vars) { _tokens = tokens; _vars = vars; }
        public Token Current => _tokens[_pos];
        public CalculatorException Unexpected() => Current.Kind == Kind.End
            ? new CalculatorException("unexpected end of expression")
            : new CalculatorException($"unexpected token '{Current.Text}' at {Current.Position}");
        private bool IsOp(string op) => Current.Kind == Kind.Op && Current.Text == op;

        // expression := term (('+'|'-') term)*
        public double ParseExpression() {
            double left = ParseTerm();
            while (IsOp("+") || IsOp("-")) {
                string op = Current.Text; _pos++;
                double right = ParseTerm();
                left = Finite(op == "+" ? left + right : left - right);
            }
            return left;
        }
        // term := unary (('*'|'/'|'%') unary)*
        private double ParseTerm() {
            double left = ParseUnary();
            while (IsOp("*") || IsOp("/") || IsOp("%")) {
                string op = Current.Text; _pos++;
                double right = ParseUnary();
                if (op != "*" && right == 0) throw new CalculatorException(op == "/" ? "division by zero" : "remainder by zero");
                left = Finite(op == "*" ? left * right : op == "/" ? left / right : left % right);
            }
            return left;
        }
        // unary := ('+'|'-') unary | power   (binds looser than ^, tighter than * /)
        private double ParseUnary() {
            if (IsOp("-") || IsOp("+")) {
                string op = Current.Text; _pos++;
                Enter(); double v = ParseUnary(); _depth--;
                return op == "-" ? -v : v;
            }
            return ParsePower();
        }
        // power := primary ('^' unary)?   (right-associative)
        private double ParsePower() {
            double b = ParsePrimary();
            if (!IsOp("^")) return b;
            _pos++;
            Enter(); double e = ParseUnary(); _depth--;
            return Finite(Math.Pow(b, e));
        }
        private double ParsePrimary() {
            var t = Current;
            switch (t.Kind) {
                case Kind.Number: _pos++; return Finite(t.Value);
                case Kind.Ident:
                    _pos++;
                    if (!_vars.TryGetValue(t.Text, out var v)) throw new CalculatorException($"unknown identifier '{t.Text}'");
                    return Finite(v);
                case Kind.LParen:
                    _pos++; Enter();
                    double inner = ParseExpression();
                    _depth--;
                    if (Current.Kind != Kind.RParen) throw new CalculatorException("mismatched parentheses: missing ')'");
                    _pos++;
                    return inner;
                case Kind.RParen: throw new CalculatorException($"mismatched parentheses: unexpected ')' at {t.Position}");
                default: throw Unexpected();
            }
        }
        private void Enter() { if (++_depth > 200) throw new CalculatorException("expression nested too deeply"); }
    }

    private static double Finite(double v) => double.IsFinite(v) ? v : throw new CalculatorException("result is not finite");

    private static double Round2(double v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);

    private static void CheckLoan(double principal, double annualRatePercent, int periods) {
        if (!double.IsFinite(principal) || principal < 0) throw new ArgumentOutOfRangeException(nameof(principal), "principal must be a non-negative finite number");
        if (!double.IsFinite(annualRatePercent) || annualRatePercent < 0) throw new ArgumentOutOfRangeException(nameof(annualRatePercent), "rate must be a non-negative finite number");
        if (periods < 1) throw new ArgumentOutOfRangeException(nameof(periods), "periods must be at least 1");
    }

    /// <summary>Fixed monthly payment rounded to cents (half away from zero).</summary>
    public static double LoanPayment(double principal, double annualRatePercent, int months) {
        CheckLoan(principal, annualRatePercent, months);
        if (annualRatePercent == 0) return Round2(principal / months);
        double r = annualRatePercent / 1200.0;
        return Round2(principal * r / (1 - Math.Pow(1 + r, -months)));
    }

    /// <summary>Per-period schedule in cents; the last payment absorbs rounding so the balance ends at 0.00.</summary>
    public static IReadOnlyList<AmortizationRow> AmortizationSchedule(double principal, double annualRatePercent, int months) {
        double payment = LoanPayment(principal, annualRatePercent, months);
        double r = annualRatePercent / 1200.0;
        long balance = (long)Math.Round(principal * 100, MidpointRounding.AwayFromZero);
        long paymentCents = (long)Math.Round(payment * 100, MidpointRounding.AwayFromZero);
        var rows = new List<AmortizationRow>(months);
        for (int period = 1; period <= months; period++) {
            long interest = (long)Math.Round(balance * r, MidpointRounding.AwayFromZero);
            long principalPart = period == months ? balance : Math.Min(balance, paymentCents - interest);
            long pay = principalPart + interest;
            balance -= principalPart;
            rows.Add(new AmortizationRow(period, pay / 100.0, interest / 100.0, principalPart / 100.0, balance / 100.0));
        }
        return rows;
    }

    /// <summary>Future value with periodic compounding, rounded to cents.</summary>
    public static double CompoundInterest(double principal, double annualRatePercent, int compoundsPerYear, double years) {
        CheckLoan(principal, annualRatePercent, compoundsPerYear);
        if (!double.IsFinite(years) || years < 0) throw new ArgumentOutOfRangeException(nameof(years), "years must be a non-negative finite number");
        return Round2(principal * Math.Pow(1 + annualRatePercent / 100.0 / compoundsPerYear, compoundsPerYear * years));
    }
}
