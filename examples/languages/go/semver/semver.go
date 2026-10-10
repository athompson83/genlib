// SPDX-License-Identifier: Apache-2.0

// Package semver parses and orders Semantic Versioning 2.0.0 versions and
// matches npm-style ranges. Ranges desugar exactly as node-semver (without
// includePrerelease): ^, ~, x-ranges, hyphen ranges, comparators and ||.
// A prerelease version satisfies a set only when one of the set's own
// comparators has a prerelease on the same major.minor.patch.
package semver

import (
	"errors"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	num   = `(0|[1-9][0-9]*)`
	preID = `(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`
	build = `(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?`
	xr    = `(0|[1-9][0-9]*|[xX*])`
)

var (
	versionRe = regexp.MustCompile(`^` + num + `\.` + num + `\.` + num + `(?:-(` + preID + `(?:\.` + preID + `)*))?` + build + `$`)
	partialRe = regexp.MustCompile(`^v?` + xr + `(?:\.` + xr + `(?:\.` + xr + `(?:-(` + preID + `(?:\.` + preID + `)*))?` + build + `)?)?$`)
	tokenRe   = regexp.MustCompile(`^(<=|>=|<|>|=|\^|~>?|)(.+)$`)
	hyphenRe  = regexp.MustCompile(`^(\S+)\s+-\s+(\S+)$`)
	opSpaceRe = regexp.MustCompile(`(<=|>=|<|>|=|\^|~>?)\s+`)
)

// Version is a parsed semantic version. Prerelease identifiers keep their text.
type Version struct {
	Major, Minor, Patch uint64
	Prerelease, Build   []string
}

func split(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Split(s, ".")
}

func number(s string) (uint64, error) {
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, errors.New("semver: number out of range: " + s)
	}
	return n, nil
}

// Parse reads a strict SemVer 2.0.0 string (no "v" prefix, no leading zeros).
func Parse(text string) (Version, error) {
	m := versionRe.FindStringSubmatch(text)
	if m == nil {
		return Version{}, errors.New("semver: invalid semantic version: " + strconv.Quote(text))
	}
	var v Version
	var err error
	for i, dst := range []*uint64{&v.Major, &v.Minor, &v.Patch} {
		if *dst, err = number(m[i+1]); err != nil {
			return Version{}, err
		}
	}
	v.Prerelease, v.Build = split(m[4]), split(m[5])
	return v, nil
}

// String formats the version, including prerelease and build metadata.
func (v Version) String() string {
	s := strconv.FormatUint(v.Major, 10) + "." + strconv.FormatUint(v.Minor, 10) + "." + strconv.FormatUint(v.Patch, 10)
	if len(v.Prerelease) > 0 {
		s += "-" + strings.Join(v.Prerelease, ".")
	}
	if len(v.Build) > 0 {
		s += "+" + strings.Join(v.Build, ".")
	}
	return s
}

func isNum(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s != ""
}

func cmpUint(a, b uint64) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

func comparePre(a, b []string) int {
	switch { // a release sorts after any prerelease
	case len(a) == 0 && len(b) == 0:
		return 0
	case len(a) == 0:
		return 1
	case len(b) == 0:
		return -1
	}
	for i := 0; i < len(a) && i < len(b); i++ {
		x, y := a[i], b[i]
		if x == y {
			continue
		}
		xn, yn := isNum(x), isNum(y)
		switch {
		case xn && yn:
			if len(x) != len(y) { // no leading zeros, so longer is larger
				return cmpUint(uint64(len(x)), uint64(len(y)))
			}
			return strings.Compare(x, y)
		case xn:
			return -1
		case yn:
			return 1
		default:
			return strings.Compare(x, y)
		}
	}
	return cmpUint(uint64(len(a)), uint64(len(b)))
}

// Compare returns -1, 0 or 1 by SemVer precedence; build metadata is ignored.
func Compare(a, b Version) int {
	if c := cmpUint(a.Major, b.Major); c != 0 {
		return c
	}
	if c := cmpUint(a.Minor, b.Minor); c != 0 {
		return c
	}
	if c := cmpUint(a.Patch, b.Patch); c != 0 {
		return c
	}
	return comparePre(a.Prerelease, b.Prerelease)
}

// Sort orders versions ascending by precedence with a stable sort.
func Sort(versions []Version) {
	sort.SliceStable(versions, func(i, j int) bool { return Compare(versions[i], versions[j]) < 0 })
}

type comparator struct {
	op        string
	v         Version
	synthetic bool
}

func upper(major, minor, patch uint64) comparator {
	return comparator{"<", Version{major, minor, patch, []string{"0"}, nil}, true}
}

// partial holds a possibly incomplete version; -1 marks an x/missing part.
type partial struct {
	parts [3]int64
	pre   []string
}

func parsePartial(text string) (partial, error) {
	m := partialRe.FindStringSubmatch(text)
	if m == nil {
		return partial{}, errors.New("semver: invalid version in range: " + strconv.Quote(text))
	}
	var p partial
	for i := 0; i < 3; i++ {
		s := m[i+1]
		if s == "" || s == "x" || s == "X" || s == "*" {
			p.parts[i] = -1
			continue
		}
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil || n >= 1<<62 {
			return partial{}, errors.New("semver: number out of range in range: " + s)
		}
		p.parts[i] = n
	}
	for i := 1; i < 3; i++ { // anything after an x is also x
		if p.parts[i-1] < 0 {
			p.parts[i] = -1
		}
	}
	p.pre = split(m[4])
	return p, nil
}

func z(n int64) uint64 {
	if n < 0 {
		return 0
	}
	return uint64(n)
}

func desugar(op, text string) ([]comparator, error) {
	p, err := parsePartial(text)
	if err != nil {
		return nil, err
	}
	M, m, pt := p.parts[0], p.parts[1], p.parts[2]
	switch op {
	case "^":
		if M < 0 {
			return nil, nil
		}
		lo := comparator{">=", Version{z(M), z(m), z(pt), p.pre, nil}, false}
		switch {
		case M > 0 || m < 0:
			return []comparator{lo, upper(z(M)+1, 0, 0)}, nil
		case m > 0 || pt < 0:
			return []comparator{lo, upper(0, z(m)+1, 0)}, nil
		default:
			return []comparator{lo, upper(0, 0, z(pt)+1)}, nil
		}
	case "~", "~>":
		if M < 0 {
			return nil, nil
		}
		lo := comparator{">=", Version{z(M), z(m), z(pt), p.pre, nil}, false}
		if m < 0 {
			return []comparator{lo, upper(z(M)+1, 0, 0)}, nil
		}
		return []comparator{lo, upper(z(M), z(m)+1, 0)}, nil
	}
	if pt >= 0 {
		if op == "" {
			op = "="
		}
		return []comparator{{op, Version{z(M), z(m), z(pt), p.pre, nil}, false}}, nil
	}
	if op == "=" {
		op = ""
	}
	if M < 0 {
		if op == "<" || op == ">" {
			return []comparator{{"<", Version{0, 0, 0, []string{"0"}, nil}, true}}, nil
		}
		return nil, nil
	}
	if op != "" {
		major, minor := z(M), z(m)
		if op == ">" || op == "<=" {
			if m < 0 {
				major, minor = major+1, 0
			} else {
				minor++
			}
			op = map[string]string{">": ">=", "<=": "<"}[op]
		}
		if op == "<" {
			return []comparator{upper(major, minor, 0)}, nil
		}
		return []comparator{{op, Version{major, minor, 0, nil, nil}, false}}, nil
	}
	lo := comparator{">=", Version{z(M), z(m), 0, nil, nil}, false}
	if m < 0 {
		return []comparator{lo, upper(z(M)+1, 0, 0)}, nil
	}
	return []comparator{lo, upper(z(M), z(m)+1, 0)}, nil
}

func hyphen(low, high string) ([]comparator, error) {
	a, err := parsePartial(low)
	if err != nil {
		return nil, err
	}
	b, err := parsePartial(high)
	if err != nil {
		return nil, err
	}
	var out []comparator
	if a.parts[0] >= 0 {
		pre := a.pre
		if a.parts[2] < 0 {
			pre = nil
		}
		out = append(out, comparator{">=", Version{z(a.parts[0]), z(a.parts[1]), z(a.parts[2]), pre, nil}, false})
	}
	switch {
	case b.parts[0] < 0:
	case b.parts[1] < 0:
		out = append(out, upper(z(b.parts[0])+1, 0, 0))
	case b.parts[2] < 0:
		out = append(out, upper(z(b.parts[0]), z(b.parts[1])+1, 0))
	default:
		out = append(out, comparator{"<=", Version{z(b.parts[0]), z(b.parts[1]), z(b.parts[2]), b.pre, nil}, false})
	}
	return out, nil
}

func parseSet(text string) ([]comparator, error) {
	text = strings.TrimSpace(text)
	if m := hyphenRe.FindStringSubmatch(text); m != nil {
		return hyphen(m[1], m[2])
	}
	text = opSpaceRe.ReplaceAllString(text, "$1")
	var out []comparator
	for _, token := range strings.Fields(text) {
		m := tokenRe.FindStringSubmatch(token)
		if m == nil {
			return nil, errors.New("semver: invalid range token: " + strconv.Quote(token))
		}
		cs, err := desugar(m[1], m[2])
		if err != nil {
			return nil, err
		}
		out = append(out, cs...)
	}
	return out, nil
}

func test(c comparator, v Version) bool {
	r := Compare(v, c.v)
	switch c.op {
	case "=":
		return r == 0
	case "<":
		return r < 0
	case "<=":
		return r <= 0
	case ">":
		return r > 0
	default:
		return r >= 0
	}
}

// Satisfies reports whether version matches the npm-style range.
func Satisfies(version Version, rangeText string) (bool, error) {
	for _, setText := range strings.Split(rangeText, "||") {
		set, err := parseSet(setText)
		if err != nil {
			return false, err
		}
		ok := true
		for _, c := range set {
			ok = ok && test(c, version)
		}
		if !ok {
			continue
		}
		if len(version.Prerelease) == 0 {
			return true, nil
		}
		for _, c := range set {
			if len(c.v.Prerelease) > 0 && !c.synthetic && c.v.Major == version.Major &&
				c.v.Minor == version.Minor && c.v.Patch == version.Patch {
				return true, nil
			}
		}
	}
	return false, nil
}
