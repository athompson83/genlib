// SPDX-License-Identifier: Apache-2.0

// Package utmlinks builds, parses and cleans campaign (UTM) URLs with plain
// string handling, so existing query parameters keep their position and
// original encoding. Values are trimmed and lowercased.
package utmlinks

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Keys is the output order for BuildURL and Parse.
var Keys = []string{"id", "source", "medium", "campaign", "term", "content"}

// TrackingParams are the click-ID parameters removed by StripTracking (with utm_*).
var TrackingParams = []string{
	"gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id",
	"mc_cid", "mc_eid", "_hsenc", "_hsmi", "yclid", "igshid",
}

// Params are the UTM values. Source, Medium and Campaign are required;
// empty optional values are skipped.
type Params struct {
	ID, Source, Medium, Campaign, Term, Content string
}

// Field is one parsed UTM value; Key has no "utm_" prefix.
type Field struct {
	Key, Value string
}

var (
	urlRE = regexp.MustCompile(`(?i)^https?://[^/?#]+`)
	badRE = regexp.MustCompile(`[\x00-\x20\x7f]`)
)

type parts struct {
	base     string
	params   []string
	fragment string
}

func split(u, label string) (parts, error) {
	if badRE.MatchString(u) || !urlRE.MatchString(u) {
		return parts{}, fmt.Errorf("%s must be an absolute http(s) URL", label)
	}
	var p parts
	rest := u
	if i := strings.IndexByte(u, '#'); i >= 0 {
		rest, p.fragment = u[:i], u[i:]
	}
	p.base = rest
	if i := strings.IndexByte(rest, '?'); i >= 0 {
		p.base = rest[:i]
		for _, s := range strings.Split(rest[i+1:], "&") {
			if s != "" {
				p.params = append(p.params, s)
			}
		}
	}
	return p, nil
}

func (p parts) join() string {
	q := ""
	if len(p.params) > 0 {
		q = "?" + strings.Join(p.params, "&")
	}
	return p.base + q + p.fragment
}

func rawKey(param string) string {
	if i := strings.IndexByte(param, '='); i >= 0 {
		return param[:i]
	}
	return param
}

// PercentEncode encodes UTF-8 bytes, keeping only RFC 3986 unreserved characters.
func PercentEncode(s string) string {
	var sb strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~' {
			sb.WriteByte(c)
		} else {
			fmt.Fprintf(&sb, "%%%02X", c)
		}
	}
	return sb.String()
}

func decode(s string) (string, error) {
	v, err := url.QueryUnescape(s) // also decodes + as a space
	if err != nil || !utf8.ValidString(v) {
		return "", fmt.Errorf("invalid percent-encoding in %q", s)
	}
	return v, nil
}

// BuildURL appends utm_* parameters (replacing same-named ones in place)
// before any #fragment.
func BuildURL(baseURL string, p Params) (string, error) {
	u, err := split(baseURL, "baseURL")
	if err != nil {
		return "", err
	}
	values := []string{p.ID, p.Source, p.Medium, p.Campaign, p.Term, p.Content}
	for i, key := range Keys {
		value := strings.ToLower(strings.TrimSpace(values[i]))
		if value == "" {
			if key == "source" || key == "medium" || key == "campaign" {
				return "", fmt.Errorf("%s is required", key)
			}
			continue
		}
		name := "utm_" + key
		pair := name + "=" + PercentEncode(value)
		index := -1
		kept := u.params[:0:0]
		for j, param := range u.params {
			if rawKey(param) == name {
				if index >= 0 {
					continue
				}
				index = j
				param = pair
			}
			kept = append(kept, param)
		}
		if index < 0 {
			kept = append(kept, pair)
		}
		u.params = kept
	}
	return u.join(), nil
}

// Parse returns the present utm_* values (prefix removed, decoded, first
// occurrence wins) in the order id, source, medium, campaign, term, content.
func Parse(rawURL string) ([]Field, error) {
	u, err := split(rawURL, "url")
	if err != nil {
		return nil, err
	}
	found := map[string]string{}
	for _, param := range u.params {
		k, v := param, ""
		if i := strings.IndexByte(param, '='); i >= 0 {
			k, v = param[:i], param[i+1:]
		}
		key, err := decode(k)
		if err != nil {
			return nil, err
		}
		if _, seen := found[key]; !strings.HasPrefix(key, "utm_") || seen {
			continue
		}
		if found[key], err = decode(v); err != nil {
			return nil, err
		}
	}
	fields := []Field{}
	for _, key := range Keys {
		if v, ok := found["utm_"+key]; ok {
			fields = append(fields, Field{key, v})
		}
	}
	return fields, nil
}

// StripTracking removes utm_* and click-ID parameters; others keep their
// order and encoding. The "?" is dropped when nothing remains.
func StripTracking(rawURL string) (string, error) {
	u, err := split(rawURL, "url")
	if err != nil {
		return "", err
	}
	kept := u.params[:0:0]
	for _, param := range u.params {
		key := rawKey(param)
		tracking := strings.HasPrefix(key, "utm_")
		for _, t := range TrackingParams {
			tracking = tracking || key == t
		}
		if !tracking {
			kept = append(kept, param)
		}
	}
	u.params = kept
	return u.join(), nil
}
