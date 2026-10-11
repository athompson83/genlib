// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package htmlescape

import (
	"testing"
)

func TestEscape(t *testing.T) {
	for _, c := range [][2]string{
		{"<a href=\"x\">", "&lt;a href=&quot;x&quot;&gt;"},
		{"Tom & Jerry's", "Tom &amp; Jerry&#39;s"},
		{"plain", "plain"},
		{"", ""},
	} {
		if got := Escape(c[0]); got != c[1] {
			t.Errorf("Escape(%q) = %q; want %q", c[0], got, c[1])
		}
	}
}

func TestUnescape(t *testing.T) {
	for _, c := range [][2]string{
		{"&lt;p&gt;", "<p>"},
		{"&#169; &#xA9; &#XA9;", "\u00a9 \u00a9 \u00a9"},
		{"&amp;amp;", "&amp;"},
		{"&amp no semicolon", "&amp no semicolon"},
		{"&bogus; &AMP;", "&bogus; &AMP;"},
		{"&#128; &#x9F;", "\u20ac \u0178"},
		{"&#0; &#xD800; &#1114112;", "\ufffd \ufffd \ufffd"},
		{"&euro;5 &mdash; &hellip;", "\u20ac5 \u2014 \u2026"},
		{"&#99999999999;", "&#99999999999;"},
	} {
		if got := Unescape(c[0]); got != c[1] {
			t.Errorf("Unescape(%q) = %q; want %q", c[0], got, c[1])
		}
	}
}

func TestStripTags(t *testing.T) {
	for _, c := range [][2]string{
		{"<p>Hello <b>world</b></p>", "Hello world"},
		{"a<script>alert(1)</script>b", "ab"},
		{"<STYLE>p{}</STYLE>x &amp; y", "x & y"},
		{"1 < 2 and 3>1", "1 < 2 and 3>1"},
		{"<!-- c -->t", "t"},
		{"unclosed <script>evil", "unclosed "},
	} {
		if got := StripTags(c[0]); got != c[1] {
			t.Errorf("StripTags(%q) = %q; want %q", c[0], got, c[1])
		}
	}
}
