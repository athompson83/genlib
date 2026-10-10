// SPDX-License-Identifier: Apache-2.0

// Package structureddata renders JSON-LD <script> blocks and <head> meta,
// Open Graph and Twitter card tags. JSON-LD escapes < > & U+2028 U+2029 as
// \uXXXX so text cannot close the <script> element; meta values are
// HTML-escaped. Output is deterministic.
package structureddata

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Member is one key/value pair of an Object.
type Member struct {
	Key   string
	Value any
}

// Object is a JSON object that keeps its keys in insertion order.
type Object []Member

// TwitterCards lists the accepted twitter:card values.
var TwitterCards = []string{"summary", "summary_large_image", "app", "player"}

var (
	httpsRE  = regexp.MustCompile(`(?i)^https://[^/?#]+`)
	badRE    = regexp.MustCompile(`[\x00-\x20\x7f]`)
	localeRE = regexp.MustCompile(`^[a-z]{2,3}(_[A-Z]{2})?$`)
	htmlEsc  = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
)

// jsonString uses encoding/json, whose default HTML escaping already writes
// < > & U+2028 U+2029 as \u003c \u003e \u0026 \u2028 \u2029.
func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func writeValue(sb *strings.Builder, v any, path string, depth int) error {
	if depth > 64 {
		return fmt.Errorf("%s: nesting is deeper than 64 levels", path)
	}
	switch x := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		sb.WriteString(strconv.FormatBool(x))
	case string:
		sb.WriteString(jsonString(x))
	case int:
		sb.WriteString(strconv.Itoa(x))
	case int64:
		sb.WriteString(strconv.FormatInt(x, 10))
	case int32:
		sb.WriteString(strconv.FormatInt(int64(x), 10))
	case float32:
		return writeValue(sb, float64(x), path, depth)
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return fmt.Errorf("%s: numbers must be finite (no NaN or Infinity)", path)
		}
		b, _ := json.Marshal(x)
		sb.Write(b)
	case Object:
		sb.WriteByte('{')
		for i, m := range x {
			if i > 0 {
				sb.WriteByte(',')
			}
			sb.WriteString(jsonString(m.Key) + ":")
			if err := writeValue(sb, m.Value, path+"."+m.Key, depth+1); err != nil {
				return err
			}
		}
		sb.WriteByte('}')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys) // Go maps are unordered; use Object to control key order.
		obj := make(Object, 0, len(keys))
		for _, k := range keys {
			obj = append(obj, Member{k, x[k]})
		}
		return writeValue(sb, obj, path, depth)
	case []string:
		items := make([]any, len(x))
		for i, s := range x {
			items[i] = s
		}
		return writeValue(sb, items, path, depth)
	case []any:
		sb.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeValue(sb, item, fmt.Sprintf("%s[%d]", path, i), depth+1); err != nil {
				return err
			}
		}
		sb.WriteByte(']')
	default:
		return fmt.Errorf("%s: unsupported JSON-LD value of type %T", path, v)
	}
	return nil
}

// ScriptSafeJSON serializes compact JSON with script-safe escaping. Supported
// values: nil, bool, string, int, int32, int64, finite float32/float64,
// Object, map[string]any (sorted keys), []any and []string.
func ScriptSafeJSON(v any) (string, error) {
	var sb strings.Builder
	if err := writeValue(&sb, v, "$", 0); err != nil {
		return "", err
	}
	return sb.String(), nil
}

// JSONLDScript wraps an Object, map or slice in <script type="application/ld+json">.
func JSONLDScript(data any) (string, error) {
	switch data.(type) {
	case Object, map[string]any, []any:
	default:
		return "", errors.New("JSON-LD data must be an object or an array")
	}
	body, err := ScriptSafeJSON(data)
	if err != nil {
		return "", err
	}
	return `<script type="application/ld+json">` + body + `</script>`, nil
}

// HTMLEscape escapes & < > and ".
func HTMLEscape(s string) string { return htmlEsc.Replace(s) }

// Meta holds metaTags input. Empty strings are treated as absent; Type
// defaults to "website" and TwitterCard to "summary_large_image".
type Meta struct {
	Title, Description, Canonical, Image, SiteName, Type, TwitterCard, Locale string
}

func isHTTPSURL(s string) bool { return !badRE.MatchString(s) && httpsRE.MatchString(s) }

// MetaTags returns the tags joined by "\n" with no trailing newline.
func MetaTags(m Meta) (string, error) {
	if strings.TrimSpace(m.Title) == "" {
		return "", errors.New("title must be a non-empty string")
	}
	if m.Type == "" {
		m.Type = "website"
	}
	if m.TwitterCard == "" {
		m.TwitterCard = "summary_large_image"
	}
	if m.Canonical != "" && !isHTTPSURL(m.Canonical) {
		return "", errors.New("canonical must be an absolute https URL")
	}
	if m.Image != "" && !isHTTPSURL(m.Image) {
		return "", errors.New("image must be an absolute https URL")
	}
	valid := false
	for _, c := range TwitterCards {
		valid = valid || c == m.TwitterCard
	}
	if !valid {
		return "", fmt.Errorf("twitterCard must be one of %s", strings.Join(TwitterCards, ", "))
	}
	if m.Locale != "" && !localeRE.MatchString(m.Locale) {
		return "", errors.New("locale must look like en or en_US")
	}
	rows := []struct{ value, format string }{
		{m.Title, `<title>%s</title>`},
		{m.Description, `<meta name="description" content="%s">`},
		{m.Canonical, `<link rel="canonical" href="%s">`},
		{m.Title, `<meta property="og:title" content="%s">`},
		{m.Description, `<meta property="og:description" content="%s">`},
		{m.Canonical, `<meta property="og:url" content="%s">`},
		{m.Image, `<meta property="og:image" content="%s">`},
		{m.SiteName, `<meta property="og:site_name" content="%s">`},
		{m.Type, `<meta property="og:type" content="%s">`},
		{m.Locale, `<meta property="og:locale" content="%s">`},
		{m.TwitterCard, `<meta name="twitter:card" content="%s">`},
		{m.Title, `<meta name="twitter:title" content="%s">`},
		{m.Description, `<meta name="twitter:description" content="%s">`},
		{m.Image, `<meta name="twitter:image" content="%s">`},
	}
	lines := make([]string, 0, len(rows))
	for _, r := range rows {
		if r.value != "" {
			lines = append(lines, fmt.Sprintf(r.format, HTMLEscape(r.value)))
		}
	}
	return strings.Join(lines, "\n"), nil
}
