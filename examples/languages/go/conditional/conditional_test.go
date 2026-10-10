// SPDX-License-Identifier: Apache-2.0

package conditional

import (
	"reflect"
	"testing"
)

func s(v string) *string { return &v }

const lm = int64(1792567680) // Wed, 21 Oct 2026 07:28:00 GMT

func TestEvaluate(t *testing.T) {
	l := lm
	d, early := "Wed, 21 Oct 2026 07:28:00 GMT", "Tue, 20 Oct 2026 07:28:00 GMT"
	for i, c := range []struct {
		r    Request
		want int
	}{
		{Request{Method: "GET", ETag: s(`"v2"`), IfNoneMatch: s(`"v2"`)}, 304},
		{Request{Method: "GET", ETag: s(`"v2"`), IfNoneMatch: s(`W/"v2"`)}, 304},
		{Request{Method: "GET", ETag: s(`W/"v2"`), IfNoneMatch: s(`"v1", "v2"`)}, 304},
		{Request{Method: "GET", ETag: s(`"v2"`), IfNoneMatch: s(`"v1"`)}, 200},
		{Request{Method: "HEAD", ETag: s(`"v2"`), IfNoneMatch: s("*")}, 304},
		{Request{Method: "PUT", ETag: s(`"v2"`), IfNoneMatch: s("*")}, 412},
		{Request{Method: "PUT", IfNoneMatch: s("*")}, 200},
		{Request{Method: "PUT", ETag: s(`"v2"`), IfMatch: s(`"v2"`)}, 200},
		{Request{Method: "PUT", ETag: s(`"v2"`), IfMatch: s(`"v1"`)}, 412},
		{Request{Method: "PUT", ETag: s(`W/"v2"`), IfMatch: s(`W/"v2"`)}, 412},
		{Request{Method: "DELETE", IfMatch: s("*")}, 412},
		{Request{Method: "DELETE", ETag: s(`"a"`), IfMatch: s("*")}, 200},
		{Request{Method: "GET", ETag: s(`"v2"`), LastModified: &l, IfModifiedSince: s(d)}, 304},
		{Request{Method: "GET", ETag: s(`"v2"`), LastModified: &l, IfModifiedSince: s(early)}, 200},
		{Request{Method: "GET", ETag: s(`"v2"`), LastModified: &l, IfNoneMatch: s(`"v1"`), IfModifiedSince: s(d)}, 200},
		{Request{Method: "POST", LastModified: &l, IfModifiedSince: s(d)}, 200},
		{Request{Method: "PUT", LastModified: &l, IfUnmodifiedSince: s(early)}, 412},
		{Request{Method: "PUT", LastModified: &l, IfUnmodifiedSince: s(d)}, 200},
		{Request{Method: "GET", LastModified: &l, IfModifiedSince: s("Wednesday, 21-Oct-26 07:28:00 GMT")}, 200},
		{Request{Method: "GET", ETag: s(`"v2"`), IfNoneMatch: s("v2")}, 200},
		{Request{Method: "PUT", ETag: s(`"v2"`), IfMatch: s(`"v2"`), IfUnmodifiedSince: s(early)}, 200},
	} {
		if got := Evaluate(c.r); got != c.want {
			t.Errorf("case %d: Evaluate = %d, want %d", i, got, c.want)
		}
	}
}

func TestParseETags(t *testing.T) {
	for _, c := range []struct {
		h    string
		want ETags
	}{
		{`"a", W/"b" ,"c"`, ETags{Tags: []string{`"a"`, `W/"b"`, `"c"`}}},
		{"*", ETags{Any: true}},
		{" * ", ETags{Any: true}},
		{`W/"x", bogus, "y"`, ETags{Tags: []string{`W/"x"`, `"y"`}}},
		{`""`, ETags{Tags: []string{`""`}}},
	} {
		if got := ParseETags(c.h); !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParseETags(%q) = %+v", c.h, got)
		}
	}
}

func TestHTTPDate(t *testing.T) {
	if v, ok := ParseHTTPDate("Wed, 21 Oct 2026 07:28:00 GMT"); !ok || v != lm {
		t.Errorf("ParseHTTPDate = %d, %v", v, ok)
	}
	for _, bad := range []string{"Thu, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 24:00:00 GMT", "Wed, 1 Oct 2026 07:28:00 GMT", "Sun, 29 Feb 2026 00:00:00 GMT", "Wed, 21 oct 2026 07:28:00 GMT"} {
		if _, ok := ParseHTTPDate(bad); ok {
			t.Errorf("accepted %q", bad)
		}
	}
}
