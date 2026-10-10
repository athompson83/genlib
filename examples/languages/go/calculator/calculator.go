// SPDX-License-Identifier: Apache-2.0

// Package calculator evaluates arithmetic expressions safely (a small
// recursive-descent parser, no code execution) and provides loan and
// compound-interest helpers rounded to cents.
package calculator

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"unicode/utf8"
)

// MaxExpressionLength is the longest accepted expression, in characters.
const MaxExpressionLength = 1000

// MaxDepth is the deepest accepted nesting of parentheses and unary operators.
const MaxDepth = 200

var errTooDeep = errors.New("calculator: expression nested too deeply")

type tokenKind int

const (
	tokNumber tokenKind = iota
	tokIdent
	tokOp
	tokEOF
)

type token struct {
	kind tokenKind
	text string
	num  float64
	pos  int
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }
func isIdentStart(c byte) bool {
	return c == '_' || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z'
}

func tokenize(s string) ([]token, error) {
	var toks []token
	for i := 0; i < len(s); {
		c := s[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			i++
		case isDigit(c) || (c == '.' && i+1 < len(s) && isDigit(s[i+1])):
			start := i
			for i < len(s) && isDigit(s[i]) {
				i++
			}
			if i < len(s) && s[i] == '.' {
				i++
				for i < len(s) && isDigit(s[i]) {
					i++
				}
			}
			if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
				j := i + 1
				if j < len(s) && (s[j] == '+' || s[j] == '-') {
					j++
				}
				if j >= len(s) || !isDigit(s[j]) {
					return nil, fmt.Errorf("calculator: malformed exponent at position %d", i)
				}
				for j < len(s) && isDigit(s[j]) {
					j++
				}
				i = j
			}
			v, err := strconv.ParseFloat(s[start:i], 64)
			if err != nil || math.IsInf(v, 0) {
				return nil, fmt.Errorf("calculator: invalid number at position %d", start)
			}
			toks = append(toks, token{kind: tokNumber, text: s[start:i], num: v, pos: start})
		case isIdentStart(c):
			start := i
			for i < len(s) && (isIdentStart(s[i]) || isDigit(s[i])) {
				i++
			}
			toks = append(toks, token{kind: tokIdent, text: s[start:i], pos: start})
		case c == '+' || c == '-' || c == '*' || c == '/' || c == '%' || c == '^' || c == '(' || c == ')':
			toks = append(toks, token{kind: tokOp, text: string(c), pos: i})
			i++
		default:
			return nil, fmt.Errorf("calculator: unexpected character at position %d", i)
		}
	}
	return append(toks, token{kind: tokEOF, pos: len(s)}), nil
}

type parser struct {
	toks  []token
	pos   int
	depth int
	vars  map[string]float64
}

func (p *parser) enter() error {
	p.depth++
	if p.depth > MaxDepth {
		return errTooDeep
	}
	return nil
}

func (p *parser) peek() token { return p.toks[p.pos] }
func (p *parser) isOp(op string) bool {
	t := p.peek()
	return t.kind == tokOp && t.text == op
}

func checked(v float64) (float64, error) {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, errors.New("calculator: result is not finite")
	}
	return v, nil
}

// expr := term (('+' | '-') term)*
func (p *parser) expr() (float64, error) {
	left, err := p.term()
	if err != nil {
		return 0, err
	}
	for p.isOp("+") || p.isOp("-") {
		op := p.peek().text
		p.pos++
		right, err := p.term()
		if err != nil {
			return 0, err
		}
		if op == "+" {
			left += right
		} else {
			left -= right
		}
		if left, err = checked(left); err != nil {
			return 0, err
		}
	}
	return left, nil
}

// term := unary (('*' | '/' | '%') unary)*
func (p *parser) term() (float64, error) {
	left, err := p.unary()
	if err != nil {
		return 0, err
	}
	for p.isOp("*") || p.isOp("/") || p.isOp("%") {
		op := p.peek().text
		p.pos++
		right, err := p.unary()
		if err != nil {
			return 0, err
		}
		switch op {
		case "*":
			left *= right
		case "/":
			if right == 0 {
				return 0, errors.New("calculator: division by zero")
			}
			left /= right
		case "%":
			if right == 0 {
				return 0, errors.New("calculator: remainder by zero")
			}
			left = math.Mod(left, right) // sign follows the dividend
		}
		if left, err = checked(left); err != nil {
			return 0, err
		}
	}
	return left, nil
}

// unary := ('+' | '-') unary | power   (binds looser than '^')
func (p *parser) unary() (float64, error) {
	if p.isOp("-") || p.isOp("+") {
		neg := p.isOp("-")
		p.pos++
		if err := p.enter(); err != nil {
			return 0, err
		}
		v, err := p.unary()
		p.depth--
		if neg {
			v = -v
		}
		return v, err
	}
	return p.power()
}

// power := primary ('^' unary)?   (right-associative)
func (p *parser) power() (float64, error) {
	base, err := p.primary()
	if err != nil {
		return 0, err
	}
	if !p.isOp("^") {
		return base, nil
	}
	p.pos++
	if err := p.enter(); err != nil {
		return 0, err
	}
	exp, err := p.unary()
	if err != nil {
		return 0, err
	}
	p.depth--
	return checked(math.Pow(base, exp))
}

// primary := number | identifier | '(' expr ')'
func (p *parser) primary() (float64, error) {
	t := p.peek()
	switch {
	case t.kind == tokNumber:
		p.pos++
		return t.num, nil
	case t.kind == tokIdent:
		p.pos++
		v, ok := p.vars[t.text]
		if !ok {
			return 0, fmt.Errorf("calculator: unknown identifier %q", t.text)
		}
		return checked(v)
	case p.isOp("("):
		p.pos++
		if err := p.enter(); err != nil {
			return 0, err
		}
		v, err := p.expr()
		if err != nil {
			return 0, err
		}
		p.depth--
		if !p.isOp(")") {
			return 0, fmt.Errorf("calculator: mismatched parentheses at position %d", p.peek().pos)
		}
		p.pos++
		return v, nil
	case t.kind == tokEOF:
		return 0, errors.New("calculator: unexpected end of expression")
	}
	return 0, fmt.Errorf("calculator: unexpected token %q at position %d", t.text, t.pos)
}

// Evaluate computes expression using the given variables (may be nil).
func Evaluate(expression string, variables map[string]float64) (float64, error) {
	if utf8.RuneCountInString(expression) > MaxExpressionLength {
		return 0, errors.New("calculator: expression too long")
	}
	toks, err := tokenize(expression)
	if err != nil {
		return 0, err
	}
	if len(toks) == 1 {
		return 0, errors.New("calculator: empty expression")
	}
	p := &parser{toks: toks, vars: variables}
	v, err := p.expr()
	if err != nil {
		return 0, err
	}
	if t := p.peek(); t.kind != tokEOF {
		if t.text == ")" {
			return 0, fmt.Errorf("calculator: mismatched parentheses at position %d", t.pos)
		}
		return 0, fmt.Errorf("calculator: unexpected token %q at position %d", t.text, t.pos)
	}
	return checked(v)
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func validLoan(principal, annualRatePercent float64, months int) error {
	if !(principal >= 0) || math.IsInf(principal, 0) || !(annualRatePercent >= 0) || math.IsInf(annualRatePercent, 0) || months < 1 || months > 1200 {
		return errors.New("calculator: principal and rate must be finite and non-negative; months must be 1..1200")
	}
	return nil
}

func monthlyPayment(principal, annualRatePercent float64, months int) float64 {
	if annualRatePercent == 0 {
		return principal / float64(months)
	}
	r := annualRatePercent / 100 / 12
	return principal * r / (1 - math.Pow(1+r, -float64(months)))
}

// LoanPayment returns the fixed monthly payment, rounded half away from zero to cents.
func LoanPayment(principal, annualRatePercent float64, months int) (float64, error) {
	if err := validLoan(principal, annualRatePercent, months); err != nil {
		return 0, err
	}
	return round2(monthlyPayment(principal, annualRatePercent, months)), nil
}

// Row is one amortization period; money values are rounded to cents.
type Row struct {
	Period    int
	Payment   float64
	Interest  float64
	Principal float64
	Balance   float64
}

// AmortizationSchedule returns one row per month. Arithmetic is done in
// integer cents; the final payment absorbs rounding so the balance ends at
// exactly 0.00 and the principal column sums to the original principal.
func AmortizationSchedule(principal, annualRatePercent float64, months int) ([]Row, error) {
	if err := validLoan(principal, annualRatePercent, months); err != nil {
		return nil, err
	}
	payment, _ := LoanPayment(principal, annualRatePercent, months)
	paymentCents := int64(math.Round(payment * 100))
	balance := int64(math.Round(principal * 100))
	r := annualRatePercent / 100 / 12
	rows := make([]Row, 0, months)
	for period := 1; period <= months; period++ {
		interest := int64(math.Round(float64(balance) * r))
		principalPart := paymentCents - interest
		if period == months || principalPart > balance {
			principalPart = balance
		}
		pay := principalPart + interest
		balance -= principalPart
		rows = append(rows, Row{Period: period, Payment: float64(pay) / 100, Interest: float64(interest) / 100, Principal: float64(principalPart) / 100, Balance: float64(balance) / 100})
	}
	return rows, nil
}

// CompoundInterest returns the future value principal*(1+r/n)^(n*years),
// rounded half away from zero to cents.
func CompoundInterest(principal, annualRatePercent float64, compoundsPerYear int, years float64) (float64, error) {
	if !(principal >= 0) || math.IsInf(principal, 0) || !(annualRatePercent >= 0) || math.IsInf(annualRatePercent, 0) || compoundsPerYear < 1 || !(years >= 0) || math.IsInf(years, 0) {
		return 0, errors.New("calculator: invalid compound interest input")
	}
	n := float64(compoundsPerYear)
	return checked(round2(principal * math.Pow(1+annualRatePercent/100/n, n*years)))
}
