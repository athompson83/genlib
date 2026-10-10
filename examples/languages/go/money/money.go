// SPDX-License-Identifier: Apache-2.0

// Package money handles amounts as int64 minor units: exact parsing and
// formatting, rate application with round-half-to-even, and allocation.
// No floating point; intermediate products use math/big and results that do
// not fit in int64 are errors.
package money

import (
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strings"
)

var exponents = map[string]int{}

func init() {
	for _, c := range strings.Fields("USD EUR GBP CAD AUD CHF CNY INR MXN BRL SEK NOK DKK NZD SGD HKD ZAR") {
		exponents[c] = 2
	}
	for _, c := range strings.Fields("JPY KRW VND CLP ISK") {
		exponents[c] = 0
	}
	for _, c := range strings.Fields("BHD KWD JOD OMR TND") {
		exponents[c] = 3
	}
}

var decimalRE = regexp.MustCompile(`^(-?)([0-9]+)(?:\.([0-9]+))?$`)

// ErrOverflow reports a result outside the int64 range.
var ErrOverflow = errors.New("money: result exceeds the int64 range")

// Exponent returns the ISO 4217 minor-unit exponent of a supported currency code.
func Exponent(currency string) (int, error) {
	e, ok := exponents[currency]
	if !ok {
		return 0, fmt.Errorf("money: unsupported currency %q", currency)
	}
	return e, nil
}

func parseDecimal(text string, maxFraction int, name string) (*big.Int, int, error) {
	m := decimalRE.FindStringSubmatch(text)
	if m == nil {
		return nil, 0, fmt.Errorf("money: %s must match -?DIGITS(.DIGITS)?: %q", name, text)
	}
	if len(m[3]) > maxFraction {
		return nil, 0, fmt.Errorf("money: %s has more than %d fraction digits: %q", name, maxFraction, text)
	}
	v, _ := new(big.Int).SetString(m[2]+m[3], 10)
	if m[1] == "-" {
		v.Neg(v)
	}
	return v, len(m[3]), nil
}

func pow10(n int) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
}

func toInt64(v *big.Int) (int64, error) {
	if !v.IsInt64() {
		return 0, ErrOverflow
	}
	return v.Int64(), nil
}

// ToMinor converts a decimal string to minor units. It never rounds: more
// fraction digits than the currency allows is an error.
func ToMinor(amount, currency string) (int64, error) {
	exp, err := Exponent(currency)
	if err != nil {
		return 0, err
	}
	v, scale, err := parseDecimal(amount, exp, "amount")
	if err != nil {
		return 0, err
	}
	return toInt64(v.Mul(v, pow10(exp-scale)))
}

// FormatMinor writes minor units as a plain decimal without symbol or grouping.
func FormatMinor(minor int64, currency string) (string, error) {
	exp, err := Exponent(currency)
	if err != nil {
		return "", err
	}
	v := big.NewInt(minor)
	sign := ""
	if v.Sign() < 0 {
		sign = "-"
		v.Abs(v)
	}
	digits := v.String()
	if exp == 0 {
		return sign + digits, nil
	}
	if len(digits) <= exp {
		digits = strings.Repeat("0", exp+1-len(digits)) + digits
	}
	return sign + digits[:len(digits)-exp] + "." + digits[len(digits)-exp:], nil
}

// ApplyRate multiplies minor by a decimal rate (at most 9 fraction digits) and
// rounds half to even on the exact product.
func ApplyRate(minor int64, rate string) (int64, error) {
	r, scale, err := parseDecimal(rate, 9, "rate")
	if err != nil {
		return 0, err
	}
	product := r.Mul(r, big.NewInt(minor))
	negative := product.Sign() < 0
	divisor := pow10(scale)
	q, rem := new(big.Int).QuoRem(product.Abs(product), divisor, new(big.Int))
	switch rem.Lsh(rem, 1).Cmp(divisor) {
	case 1:
		q.Add(q, big.NewInt(1))
	case 0:
		if q.Bit(0) == 1 {
			q.Add(q, big.NewInt(1))
		}
	}
	if negative {
		q.Neg(q)
	}
	return toInt64(q)
}

// Allocate splits total by non-negative integer ratios with a positive sum.
// Shares are floor(|total|*r/sum); leftover units go one each to the entries
// with the largest remainder (|total|*r mod sum), ties to the lower index
// (largest-remainder method); negative totals are allocated by magnitude and
// negated.
func Allocate(total int64, ratios []int64) ([]int64, error) {
	if len(ratios) == 0 {
		return nil, errors.New("money: ratios must be non-empty")
	}
	sum := new(big.Int)
	for _, r := range ratios {
		if r < 0 {
			return nil, errors.New("money: ratios must be non-negative")
		}
		sum.Add(sum, big.NewInt(r))
	}
	if sum.Sign() == 0 {
		return nil, errors.New("money: ratios must have a positive sum")
	}
	magnitude := new(big.Int).Abs(big.NewInt(total))
	shares := make([]*big.Int, len(ratios))
	remainders := make([]*big.Int, len(ratios))
	left := new(big.Int).Set(magnitude)
	for i, r := range ratios {
		shares[i], remainders[i] = new(big.Int).QuoRem(new(big.Int).Mul(magnitude, big.NewInt(r)), sum, new(big.Int))
		left.Sub(left, shares[i])
	}
	order := make([]int, len(ratios))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return remainders[order[a]].Cmp(remainders[order[b]]) > 0 })
	for k := 0; left.Sign() > 0; k++ { // left < len(ratios)
		shares[order[k]].Add(shares[order[k]], big.NewInt(1))
		left.Sub(left, big.NewInt(1))
	}
	out := make([]int64, len(shares))
	for i, share := range shares {
		if total < 0 {
			share.Neg(share)
		}
		out[i], _ = toInt64(share) // |share| <= |total|, so it always fits
	}
	return out, nil
}
