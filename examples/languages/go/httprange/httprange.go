// SPDX-License-Identifier: Apache-2.0

// Package httprange parses RFC 9110 Range headers for byte ranges and
// formats Content-Range values.
package httprange

import (
	"strconv"
	"strings"
)

// Kind tells the server how to answer.
type Kind string

const (
	// None: no or unusable header; serve 200 with the full body.
	None Kind = "none"
	// Unsatisfiable: respond 416 with ContentRange.
	Unsatisfiable Kind = "unsatisfiable"
	// Ranges: respond 206 with Ranges (inclusive, header order, not merged).
	Ranges Kind = "ranges"
)

// MaxSpecs is the largest number of range specs accepted in one header.
const MaxSpecs = 100

// Result is the outcome of ParseRange.
type Result struct {
	Kind         Kind
	Ranges       [][2]int64
	ContentRange string
}

const maxInt64 = int64(^uint64(0) >> 1)

func digits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// number parses decimal digits, saturating at the largest int64.
func number(s string) int64 {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return maxInt64
	}
	return n
}

// less compares two decimal digit strings of any length.
func less(a, b string) bool {
	a, b = strings.TrimLeft(a, "0"), strings.TrimLeft(b, "0")
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	return a < b
}

// isBytes matches the unit "bytes" in ASCII case-insensitively.
func isBytes(unit string) bool {
	if len(unit) != 5 {
		return false
	}
	for i := 0; i < 5; i++ {
		if unit[i]|0x20 != "bytes"[i] {
			return false
		}
	}
	return true
}

// ParseRange interprets a Range header ("" means absent) for a body of size
// bytes.
func ParseRange(header string, size int64) Result {
	none := Result{Kind: None}
	h := strings.TrimLeft(header, " \t")
	eq := strings.Index(h, "=")
	if eq <= 0 || !isBytes(h[:eq]) {
		return none
	}
	specs := strings.Split(h[eq+1:], ",")
	if len(specs) > MaxSpecs {
		return none
	}
	var out [][2]int64
	for _, raw := range specs {
		p := strings.Trim(raw, " \t")
		dash := strings.Index(p, "-")
		if dash < 0 {
			return none
		}
		first, last := p[:dash], p[dash+1:]
		if first == "" {
			if !digits(last) {
				return none
			}
			n := number(last)
			if n == 0 || size == 0 {
				continue
			}
			start := size - n
			if start < 0 {
				start = 0
			}
			out = append(out, [2]int64{start, size - 1})
			continue
		}
		if !digits(first) || (last != "" && !digits(last)) {
			return none
		}
		if last != "" && less(last, first) {
			return none
		}
		a := number(first)
		if a >= size {
			continue
		}
		end := size - 1
		if last != "" {
			if b := number(last); b < end {
				end = b
			}
		}
		out = append(out, [2]int64{a, end})
	}
	if len(out) == 0 {
		return Result{Kind: Unsatisfiable, ContentRange: "bytes */" + strconv.FormatInt(size, 10)}
	}
	return Result{Kind: Ranges, Ranges: out}
}

// ContentRange formats "bytes start-end/size".
func ContentRange(start, end, size int64) string {
	return "bytes " + strconv.FormatInt(start, 10) + "-" + strconv.FormatInt(end, 10) + "/" + strconv.FormatInt(size, 10)
}
