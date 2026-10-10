// SPDX-License-Identifier: Apache-2.0
// Safe arithmetic expression evaluation (no eval/reflection) and loan/interest math.
import Foundation // pow

public enum CalculatorError: Error, Equatable {
    case invalidExpression(String)
    case invalidArgument(String)
}

public struct AmortizationRow: Equatable, Sendable {
    public let period: Int
    public let payment: Double, interest: Double, principal: Double, balance: Double
    public init(period: Int, payment: Double, interest: Double, principal: Double, balance: Double) {
        self.period = period; self.payment = payment; self.interest = interest; self.principal = principal; self.balance = balance
    }
}

public enum Calculator {
    public static let maxExpressionLength = 1000

    private enum Kind { case number, ident, op, lParen, rParen, end }
    private struct Token { let kind: Kind; let text: String; let value: Double; let position: Int }

    /// Evaluates + - * / % ^ with parentheses and named variables using double precision.
    public static func evaluate(_ expression: String, variables: [String: Double] = [:]) throws -> Double {
        guard expression.count <= maxExpressionLength else {
            throw CalculatorError.invalidExpression("expression longer than \(maxExpressionLength) characters")
        }
        let tokens = try tokenize(expression)
        guard tokens.count > 1 else { throw CalculatorError.invalidExpression("empty expression") }
        var parser = Parser(tokens: tokens, vars: variables)
        let result = try parser.expression()
        if parser.current.kind == .rParen {
            throw CalculatorError.invalidExpression("mismatched parentheses: unexpected ')' at \(parser.current.position)")
        }
        guard parser.current.kind == .end else { throw parser.unexpected() }
        return try finite(result)
    }

    private static func isDigit(_ c: UInt8) -> Bool { c >= 48 && c <= 57 }
    private static func isLetter(_ c: UInt8) -> Bool { (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95 }

    private static func tokenize(_ expression: String) throws -> [Token] {
        let s = Array(expression.utf8)
        func text(_ a: Int, _ b: Int) -> String { String(decoding: s[a..<b], as: UTF8.self) }
        var tokens: [Token] = []
        var i = 0
        while i < s.count {
            let c = s[i]
            if c == 32 || c == 9 || c == 10 || c == 13 { i += 1; continue }
            let start = i
            if isDigit(c) || c == 46 {
                var dot = false, digits = false
                while i < s.count && (isDigit(s[i]) || s[i] == 46) {
                    if s[i] == 46 {
                        if dot { throw CalculatorError.invalidExpression("unexpected '.' at \(i)") }
                        dot = true
                    } else { digits = true }
                    i += 1
                }
                guard digits else { throw CalculatorError.invalidExpression("unexpected '.' at \(start)") }
                if i < s.count && (s[i] == 101 || s[i] == 69) {
                    var j = i + 1
                    if j < s.count && (s[j] == 43 || s[j] == 45) { j += 1 }
                    guard j < s.count && isDigit(s[j]) else { throw CalculatorError.invalidExpression("malformed exponent at \(i)") }
                    while j < s.count && isDigit(s[j]) { j += 1 }
                    i = j
                }
                guard let value = Double(text(start, i)) else { throw CalculatorError.invalidExpression("invalid number at \(start)") }
                tokens.append(Token(kind: .number, text: text(start, i), value: value, position: start))
            } else if isLetter(c) {
                while i < s.count && (isLetter(s[i]) || isDigit(s[i])) { i += 1 }
                tokens.append(Token(kind: .ident, text: text(start, i), value: 0, position: start))
            } else if "+-*/%^".utf8.contains(c) {
                tokens.append(Token(kind: .op, text: text(i, i + 1), value: 0, position: i)); i += 1
            } else if c == 40 {
                tokens.append(Token(kind: .lParen, text: "(", value: 0, position: i)); i += 1
            } else if c == 41 {
                tokens.append(Token(kind: .rParen, text: ")", value: 0, position: i)); i += 1
            } else {
                throw CalculatorError.invalidExpression("unexpected character at \(i)")
            }
        }
        tokens.append(Token(kind: .end, text: "", value: 0, position: s.count))
        return tokens
    }

    private struct Parser {
        let tokens: [Token]
        let vars: [String: Double]
        var pos = 0, depth = 0

        var current: Token { tokens[pos] }
        func isOp(_ op: String) -> Bool { current.kind == .op && current.text == op }
        func unexpected() -> CalculatorError {
            current.kind == .end ? .invalidExpression("unexpected end of expression")
                : .invalidExpression("unexpected token '\(current.text)' at \(current.position)")
        }

        // expression := term (('+'|'-') term)*
        mutating func expression() throws -> Double {
            var left = try term()
            while isOp("+") || isOp("-") {
                let op = current.text; pos += 1
                let right = try term()
                left = try finite(op == "+" ? left + right : left - right)
            }
            return left
        }

        // term := unary (('*'|'/'|'%') unary)*
        mutating func term() throws -> Double {
            var left = try unary()
            while isOp("*") || isOp("/") || isOp("%") {
                let op = current.text; pos += 1
                let right = try unary()
                if op != "*" && right == 0 { throw CalculatorError.invalidExpression(op == "/" ? "division by zero" : "remainder by zero") }
                left = try finite(op == "*" ? left * right : op == "/" ? left / right : left.truncatingRemainder(dividingBy: right))
            }
            return left
        }

        // unary := ('+'|'-') unary | power   (looser than ^, tighter than * /)
        mutating func unary() throws -> Double {
            if isOp("-") || isOp("+") {
                let op = current.text; pos += 1
                try enter(); let v = try unary(); depth -= 1
                return op == "-" ? -v : v
            }
            return try power()
        }

        // power := primary ('^' unary)?   (right-associative)
        mutating func power() throws -> Double {
            let base = try primary()
            guard isOp("^") else { return base }
            pos += 1
            try enter(); let exponent = try unary(); depth -= 1
            return try finite(pow(base, exponent))
        }

        mutating func primary() throws -> Double {
            let t = current
            switch t.kind {
            case .number:
                pos += 1; return try finite(t.value)
            case .ident:
                pos += 1
                guard let v = vars[t.text] else { throw CalculatorError.invalidExpression("unknown identifier '\(t.text)'") }
                return try finite(v)
            case .lParen:
                pos += 1; try enter()
                let inner = try expression()
                depth -= 1
                guard current.kind == .rParen else { throw CalculatorError.invalidExpression("mismatched parentheses: missing ')'") }
                pos += 1
                return inner
            case .rParen:
                throw CalculatorError.invalidExpression("mismatched parentheses: unexpected ')' at \(t.position)")
            default:
                throw unexpected()
            }
        }

        mutating func enter() throws {
            depth += 1
            if depth > 200 { throw CalculatorError.invalidExpression("expression nested too deeply") }
        }
    }

    private static func finite(_ v: Double) throws -> Double {
        guard v.isFinite else { throw CalculatorError.invalidExpression("result is not finite") }
        return v
    }

    private static func round2(_ v: Double) -> Double { (v * 100).rounded(.toNearestOrAwayFromZero) / 100 }
    private static func cents(_ v: Double) -> Int64 { Int64((v * 100).rounded(.toNearestOrAwayFromZero)) }

    private static func checkLoan(_ principal: Double, _ rate: Double, _ periods: Int) throws {
        guard principal.isFinite, principal >= 0 else { throw CalculatorError.invalidArgument("principal must be non-negative and finite") }
        guard rate.isFinite, rate >= 0 else { throw CalculatorError.invalidArgument("rate must be non-negative and finite") }
        guard periods >= 1 else { throw CalculatorError.invalidArgument("periods must be at least 1") }
    }

    /// Fixed monthly payment rounded to cents (half away from zero).
    public static func loanPayment(principal: Double, annualRatePercent: Double, months: Int) throws -> Double {
        try checkLoan(principal, annualRatePercent, months)
        if annualRatePercent == 0 { return round2(principal / Double(months)) }
        let r = annualRatePercent / 1200
        return round2(principal * r / (1 - pow(1 + r, -Double(months))))
    }

    /// Per-period schedule computed in cents; the last payment absorbs rounding so the balance ends at 0.00.
    public static func amortizationSchedule(principal: Double, annualRatePercent: Double, months: Int) throws -> [AmortizationRow] {
        let paymentCents = cents(try loanPayment(principal: principal, annualRatePercent: annualRatePercent, months: months))
        let r = annualRatePercent / 1200
        var balance = cents(principal)
        var rows: [AmortizationRow] = []
        for period in 1...months {
            let interest = Int64((Double(balance) * r).rounded(.toNearestOrAwayFromZero))
            let principalPart = period == months ? balance : min(balance, paymentCents - interest)
            balance -= principalPart
            rows.append(AmortizationRow(period: period, payment: Double(principalPart + interest) / 100, interest: Double(interest) / 100,
                                        principal: Double(principalPart) / 100, balance: Double(balance) / 100))
        }
        return rows
    }

    /// Future value with periodic compounding, rounded to cents.
    public static func compoundInterest(principal: Double, annualRatePercent: Double, compoundsPerYear: Int, years: Double) throws -> Double {
        try checkLoan(principal, annualRatePercent, compoundsPerYear)
        guard years.isFinite, years >= 0 else { throw CalculatorError.invalidArgument("years must be non-negative and finite") }
        let n = Double(compoundsPerYear)
        return round2(principal * pow(1 + annualRatePercent / 100 / n, n * years))
    }
}
