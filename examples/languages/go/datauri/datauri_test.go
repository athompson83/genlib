// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package datauri

import (
	"bytes"
	"errors"
	"reflect"
	"testing"
)

func bp(v bool) *bool { return &v }

func TestParse(t *testing.T) {
	for _, c := range []struct {
		url  string
		want DataURI
	}{
		{"data:,Hello%2C%20World!", DataURI{"text/plain", []Param{{"charset", "US-ASCII"}}, false, []byte{0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21}}},
		{"data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==", DataURI{"text/plain", []Param{}, true, []byte{0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21}}},
		{"data:text/html;charset=utf-8,%3Ch1%3EHi%3C%2Fh1%3E", DataURI{"text/html", []Param{{"charset", "utf-8"}}, false, []byte{0x3c, 0x68, 0x31, 0x3e, 0x48, 0x69, 0x3c, 0x2f, 0x68, 0x31, 0x3e}}},
		{"DATA:image/png;BASE64,iVBORw0KGgo=", DataURI{"image/png", []Param{}, true, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}}},
		{"data:;base64,SGk", DataURI{"text/plain", []Param{{"charset", "US-ASCII"}}, true, []byte{0x48, 0x69}}},
		{"data:text/plain;charset=utf-8;foo=bar,x", DataURI{"text/plain", []Param{{"charset", "utf-8"}, {"foo", "bar"}}, false, []byte{0x78}}},
		{"data:application/json,%7B%22a%22%3A1%7D", DataURI{"application/json", []Param{}, false, []byte{0x7b, 0x22, 0x61, 0x22, 0x3a, 0x31, 0x7d}}},
		{"data:bogus,x", DataURI{"text/plain", []Param{{"charset", "US-ASCII"}}, false, []byte{0x78}}},
		{"data:text/plain;base64,SG Vs\nbG8=", DataURI{"text/plain", []Param{}, true, []byte{0x48, 0x65, 0x6c, 0x6c, 0x6f}}},
		{"data:;charset=utf-8,%E2%82%AC", DataURI{"text/plain", []Param{{"charset", "utf-8"}}, false, []byte{0xe2, 0x82, 0xac}}},
		{"data:,a%zzb", DataURI{"text/plain", []Param{{"charset", "US-ASCII"}}, false, []byte{0x61, 0x25, 0x7a, 0x7a, 0x62}}},
	} {
		got, err := Parse(c.url)
		if err != nil || got.Mime != c.want.Mime || !reflect.DeepEqual(got.Params, c.want.Params) || got.Base64 != c.want.Base64 || !bytes.Equal(got.Data, c.want.Data) {
			t.Errorf("Parse(%q) = %+v, %v; want %+v", c.url, got, err, c.want)
		}
	}
}

func TestBuild(t *testing.T) {
	for _, c := range []struct {
		data []byte
		mime string
		b64  *bool
		want string
	}{
		{[]byte{0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21}, "text/plain", nil, "data:text/plain,Hello,%20World!"},
		{[]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a}, "image/png", nil, "data:image/png;base64,iVBORw0K"},
		{[]byte{0x7b, 0x22, 0x61, 0x22, 0x3a, 0x31, 0x7d}, "application/json", nil, "data:application/json,%7B%22a%22:1%7D"},
		{[]byte{0xe2, 0x82, 0xac, 0x20, 0x26, 0x20, 0xc3, 0xbc}, "text/plain;charset=utf-8", nil, "data:text/plain;charset=utf-8,%E2%82%AC%20&%20%C3%BC"},
		{[]byte{0xff, 0xfe}, "text/plain", nil, "data:text/plain;base64,//4="},
		{[]byte{0x61, 0x62, 0x63}, "text/plain", bp(true), "data:text/plain;base64,YWJj"},
		{[]byte{}, "application/octet-stream", nil, "data:application/octet-stream;base64,"},
		{[]byte{0x61, 0x20, 0x62, 0x2f, 0x63, 0x3f, 0x64}, "text/plain", bp(false), "data:text/plain,a%20b/c?d"},
	} {
		got, err := Build(c.data, c.mime, c.b64)
		if err != nil || got != c.want {
			t.Errorf("Build(%x, %q) = %q, %v; want %q", c.data, c.mime, got, err, c.want)
		}
		back, err := Parse(got)
		if err != nil || !bytes.Equal(back.Data, c.data) {
			t.Errorf("round trip of %q = %x, %v", got, back.Data, err)
		}
	}
	if got, _ := Build([]byte("hi"), "", nil); got != "data:application/octet-stream;base64,aGk=" {
		t.Errorf("default mime = %q", got)
	}
}

func TestInvalid(t *testing.T) {
	for _, u := range []string{"text/plain,x", "data:text/plain", "data:;base64,a", "data:;base64,@@@@", "data:;base64,SGVsbG8=x"} {
		if _, err := Parse(u); !errors.Is(err, ErrInvalid) {
			t.Errorf("Parse(%q) error = %v", u, err)
		}
	}
	for _, c := range []struct {
		data []byte
		mime string
	}{
		{[]byte{0x00}, "not a type"},
		{[]byte{0x00}, "text/plain; charset"},
	} {
		if _, err := Build(c.data, c.mime, nil); !errors.Is(err, ErrInvalid) {
			t.Errorf("Build(%q) error = %v", c.mime, err)
		}
	}
}
