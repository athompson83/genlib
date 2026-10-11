// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package punycode

import (
	"errors"
	"testing"
)

func TestEncode(t *testing.T) {
	for _, c := range [][2]string{
		{"b\u00fccher", "bcher-kva"},
		{"m\u00fcnchen", "mnchen-3ya"},
		{"\u65e5\u672c\u8a9e", "wgv71a119e"},
		{"\u00fc", "tda"},
		{"abc", "abc-"},
		{"Ma\u00f1ana", "Maana-pta"},
		{"\u03b5\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac", "hxargifdar"},
		{"\u043f\u0440\u0430\u0432\u0434\u0430", "80aafi6cg"},
		{"\U0001f600", "e28h"},
		{"a-b", "a-b-"},
		{"-", "--"},
		{"\u0627\u0644\u062d\u0631\u064a\u0647", "mgbmm8erar"},
		{"Hello-Another-Way-\u305d\u308c\u305e\u308c\u306e\u5834\u6240", "Hello-Another-Way--fc4qua05auwb3674vfr0b"},
		{"\u00dcBER", "BER-ska"},
		{"x\u00e9\u0301", "x-bga22n"},
	} {
		got, err := Encode(c[0])
		if err != nil || got != c[1] {
			t.Errorf("Encode(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestDecode(t *testing.T) {
	for _, c := range [][2]string{
		{"bcher-kva", "b\u00fccher"},
		{"mnchen-3ya", "m\u00fcnchen"},
		{"wgv71a119e", "\u65e5\u672c\u8a9e"},
		{"tda", "\u00fc"},
		{"abc-", "abc"},
		{"Maana-pta", "Ma\u00f1ana"},
		{"hxargifdar", "\u03b5\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac"},
		{"80aafi6cg", "\u043f\u0440\u0430\u0432\u0434\u0430"},
		{"e28h", "\U0001f600"},
		{"a-b-", "a-b"},
		{"--", "-"},
		{"mgbmm8erar", "\u0627\u0644\u062d\u0631\u064a\u0647"},
		{"Hello-Another-Way--fc4qua05auwb3674vfr0b", "Hello-Another-Way-\u305d\u308c\u305e\u308c\u306e\u5834\u6240"},
		{"BER-ska", "\u00dcBER"},
		{"x-bga22n", "x\u00e9\u0301"},
		{"bcher-kva", "b\u00fccher"},
	} {
		got, err := Decode(c[0])
		if err != nil || got != c[1] {
			t.Errorf("Decode(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestDomainToASCII(t *testing.T) {
	for _, c := range [][2]string{
		{"B\u00fccher.Example", "xn--bcher-kva.example"},
		{"EXAMPLE.com", "example.com"},
		{"\u65e5\u672c\u8a9e.jp.", "xn--wgv71a119e.jp."},
		{"m\u00fcnchen.de", "xn--mnchen-3ya.de"},
		{"a.b.c", "a.b.c"},
	} {
		got, err := DomainToASCII(c[0])
		if err != nil || got != c[1] {
			t.Errorf("DomainToASCII(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestDomainToUnicode(t *testing.T) {
	for _, c := range [][2]string{
		{"xn--bcher-kva.example", "b\u00fccher.example"},
		{"XN--wgv71a119e.jp", "\u65e5\u672c\u8a9e.jp"},
		{"plain.com", "plain.com"},
	} {
		got, err := DomainToUnicode(c[0])
		if err != nil || got != c[1] {
			t.Errorf("DomainToUnicode(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"bcher-kv!", "a-99999999999999999999", "\u00fc-abc", "xyzzy123456789zzzz"} {
		if _, err := Decode(s); !errors.Is(err, ErrPunycode) {
			t.Errorf("Decode(%q) error = %v; want ErrPunycode", s, err)
		}
	}
	for _, s := range []string{"a..b", ".x", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com", "\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc\u00fc.com"} {
		if _, err := DomainToASCII(s); !errors.Is(err, ErrPunycode) {
			t.Errorf("DomainToASCII(%q) error = %v; want ErrPunycode", s, err)
		}
	}
}
