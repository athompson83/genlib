// SPDX-License-Identifier: Apache-2.0

// Package mustache renders a logic-less Mustache subset over JSON-like data
// (map[string]any, []any, strings, numbers, booleans and nil):
//
//	{{ path }}    value at a dotted path (names and [n]), HTML-escaped (& < > " ')
//	{{{ path }}}  raw value
//	{{# path }}...{{/ path }}  section: once per list item ('.' is the item; lookups
//	              try the item, then outer scopes), once for other truthy values
//	              (a map value becomes the inner scope)
//	{{^ path }}...{{/ path }}  inverted section for missing or falsy values
//	{{! comment }}
//
// Missing values render as "", nil as "", booleans as true/false, integral
// numbers without a decimal point and other floats in shortest round-trip
// form. Lists and maps cannot be rendered as values. There are no partials,
// custom delimiters or lambdas. It is unrelated to text/template.
package mustache

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// ErrTemplate is wrapped by every parse and render error.
var ErrTemplate = errors.New("mustache: invalid template")

type tplError struct{ msg string }

func (e *tplError) Error() string { return "mustache: " + e.msg }
func (e *tplError) Unwrap() error { return ErrTemplate }

func fail(msg string) error { return &tplError{msg} }

var nameRe = regexp.MustCompile(`^(?:\.|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9][0-9]*)\])*)$`)
var partRe = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\]`)

func isSpace(r rune) bool { return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f) }

type node struct {
	kind     string // text, var, raw, section, inverted
	text     string
	children []*node
}

type tag struct {
	start, end    int
	triple, close bool
	sig           byte
	name          string
}

// nextTag finds the next {{...}} tag at or after pos, mirroring the reference
// regex \{\{(\{)?\s*([#^/!]?)\s*(.*?)\s*(\})?\}\} (dot matches newlines).
func nextTag(t string, pos int) (tag, bool) {
	start := strings.Index(t[pos:], "{{")
	if start < 0 {
		return tag{}, false
	}
	start += pos
	i := start + 2
	tg := tag{start: start}
	if i < len(t) && t[i] == '{' {
		tg.triple = true
		i++
	}
	i = skipSpace(t, i)
	if i < len(t) && strings.IndexByte("#^/!", t[i]) >= 0 {
		tg.sig = t[i]
		i++
	}
	i = skipSpace(t, i)
	q := strings.Index(t[i:], "}}")
	if q < 0 {
		return tag{}, false
	}
	q += i
	e := q
	for e > i {
		r, size := lastRune(t[i:e])
		if !isSpace(r) {
			break
		}
		e -= size
	}
	tg.name = t[i:e]
	tg.end = q + 2
	if q+2 < len(t) && t[q+2] == '}' {
		tg.close = true
		tg.end++
	}
	return tg, true
}

func skipSpace(t string, i int) int {
	for i < len(t) {
		r, size := firstRune(t[i:])
		if !isSpace(r) {
			break
		}
		i += size
	}
	return i
}

func firstRune(s string) (rune, int) {
	for _, r := range s {
		return r, len(string(r))
	}
	return 0, 0
}

func lastRune(s string) (rune, int) {
	rs := []rune(s)
	r := rs[len(rs)-1]
	if r == unicode.ReplacementChar {
		return r, 1
	}
	return r, len(string(r))
}

type frame struct {
	name  string
	nodes *[]*node
}

func parse(t string) ([]*node, error) {
	var root []*node
	stack := []frame{{"", &root}}
	pos := 0
	for {
		tg, ok := nextTag(t, pos)
		if !ok {
			break
		}
		top := stack[len(stack)-1].nodes
		if tg.start > pos {
			*top = append(*top, &node{kind: "text", text: t[pos:tg.start]})
		}
		if tg.sig == '!' {
			pos = tg.end
			continue
		}
		if tg.triple != tg.close || (tg.triple && tg.sig != 0) {
			return nil, fail("bad triple-brace tag")
		}
		if !nameRe.MatchString(tg.name) {
			return nil, fail("bad tag name " + strconv.Quote(tg.name))
		}
		switch tg.sig {
		case '#', '^':
			kind := "section"
			if tg.sig == '^' {
				kind = "inverted"
			}
			nd := &node{kind: kind, text: tg.name}
			*top = append(*top, nd)
			stack = append(stack, frame{tg.name, &nd.children})
		case '/':
			if len(stack) == 1 || stack[len(stack)-1].name != tg.name {
				return nil, fail("mismatched close tag")
			}
			stack = stack[:len(stack)-1]
		default:
			kind := "var"
			if tg.triple {
				kind = "raw"
			}
			*top = append(*top, &node{kind: kind, text: tg.name})
		}
		pos = tg.end
	}
	rest := t[pos:]
	if strings.Contains(rest, "{{") {
		return nil, fail("unclosed tag")
	}
	if rest != "" {
		top := stack[len(stack)-1].nodes
		*top = append(*top, &node{kind: "text", text: rest})
	}
	if len(stack) > 1 {
		return nil, fail("unclosed section")
	}
	return root, nil
}

func number(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	}
	return 0, false
}

func format(v any) (string, error) {
	switch x := v.(type) {
	case nil:
		return "", nil
	case bool:
		if x {
			return "true", nil
		}
		return "false", nil
	case string:
		return x, nil
	case int:
		return strconv.Itoa(x), nil
	case int64:
		return strconv.FormatInt(x, 10), nil
	case uint64:
		return strconv.FormatUint(x, 10), nil
	}
	if f, ok := number(v); ok {
		if f == math.Trunc(f) && !math.IsInf(f, 0) {
			return strconv.FormatFloat(f, 'f', 0, 64), nil
		}
		if math.Abs(f) < 1e-4 && f != 0 && !math.IsNaN(f) {
			return strconv.FormatFloat(f, 'e', -1, 64), nil
		}
		return strconv.FormatFloat(f, 'f', -1, 64), nil
	}
	return "", fail("cannot render a list or object")
}

func htmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;").Replace(s)
}

func lookup(stack []any, path string) any {
	if path == "." {
		return stack[len(stack)-1]
	}
	parts := partRe.FindAllString(path, -1)
	first := parts[0]
	for i := len(stack) - 1; i >= 0; i-- {
		scope, ok := stack[i].(map[string]any)
		if !ok {
			continue
		}
		cur, found := scope[first]
		if !found {
			continue
		}
		for _, p := range parts[1:] {
			if strings.HasPrefix(p, "[") {
				idx, err := strconv.Atoi(p[1 : len(p)-1])
				if l, ok := cur.([]any); ok && err == nil && idx < len(l) {
					cur = l[idx]
				} else {
					cur = nil
				}
			} else if m, ok := cur.(map[string]any); ok {
				cur = m[p]
			} else {
				cur = nil
			}
			if cur == nil {
				return nil
			}
		}
		return cur
	}
	return nil
}

func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case []any:
		return len(x) > 0
	case map[string]any:
		return len(x) > 0
	}
	if f, ok := number(v); ok {
		return f != 0
	}
	return true
}

func run(nodes []*node, stack []any, esc bool, out *strings.Builder) error {
	for _, n := range nodes {
		switch n.kind {
		case "text":
			out.WriteString(n.text)
		case "var", "raw":
			s, err := format(lookup(stack, n.text))
			if err != nil {
				return err
			}
			if esc && n.kind == "var" {
				s = htmlEscape(s)
			}
			out.WriteString(s)
		case "section":
			v := lookup(stack, n.text)
			if l, ok := v.([]any); ok {
				for _, item := range l {
					if err := run(n.children, append(stack[:len(stack):len(stack)], item), esc, out); err != nil {
						return err
					}
				}
			} else if truthy(v) {
				inner := stack
				if _, ok := v.(map[string]any); ok {
					inner = append(stack[:len(stack):len(stack)], v)
				}
				if err := run(n.children, inner, esc, out); err != nil {
					return err
				}
			}
		default:
			if !truthy(lookup(stack, n.text)) {
				if err := run(n.children, stack, esc, out); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// Render renders template against data, HTML-escaping {{path}} values when escape is true.
func Render(template string, data any, escape bool) (string, error) {
	nodes, err := parse(template)
	if err != nil {
		return "", err
	}
	var out strings.Builder
	if err := run(nodes, []any{data}, escape, &out); err != nil {
		return "", err
	}
	return out.String(), nil
}
