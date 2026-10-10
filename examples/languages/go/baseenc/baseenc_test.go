// SPDX-License-Identifier: Apache-2.0

package baseenc

import (
	"bytes"
	"encoding/hex"
	"testing"
)

func h(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func TestBase32(t *testing.T) {
	for _, c := range [][4]string{
		{"", "", "", ""},
		{"66", "MY======", "CO======", "MY"},
		{"666f", "MZXQ====", "CPNG====", "MZXQ"},
		{"666f6f", "MZXW6===", "CPNMU===", "MZXW6"},
		{"666f6f62", "MZXW6YQ=", "CPNMUOG=", "MZXW6YQ"},
		{"666f6f6261", "MZXW6YTB", "CPNMUOJ1", "MZXW6YTB"},
		{"666f6f626172", "MZXW6YTBOI======", "CPNMUOJ1E8======", "MZXW6YTBOI"},
	} {
		data := h(c[0])
		for _, v := range []struct {
			a    Alphabet
			pad  bool
			want string
		}{{RFC4648, true, c[1]}, {Hex, true, c[2]}, {RFC4648, false, c[3]}} {
			if got := Base32Encode(data, v.a, v.pad); got != v.want {
				t.Errorf("Base32Encode(%s, %d, %v) = %q, want %q", c[0], v.a, v.pad, got, v.want)
			}
			if got, err := Base32Decode(v.want, v.a, v.pad); err != nil || !bytes.Equal(got, data) {
				t.Errorf("Base32Decode(%q) = %x, %v; want %s", v.want, got, err, c[0])
			}
		}
	}
	if got, err := Base32Decode("mzxw6ytboi======", RFC4648, true); err != nil || !bytes.Equal(got, h("666f6f626172")) {
		t.Errorf("case-insensitive decode = %x, %v", got, err)
	}
	for _, c := range []struct {
		text string
		pad  bool
	}{{"MZXW6YT", true}, {"MZXW6YR=", true}, {"MZ======", true}, {"MZXW6YTB1=======", true}, {"MZXR====", true}, {"MZXW6===", false}} {
		if got, err := Base32Decode(c.text, RFC4648, c.pad); err == nil {
			t.Errorf("Base32Decode(%q, %v) = %x, want error", c.text, c.pad, got)
		}
	}
}

func TestBase58(t *testing.T) {
	for _, c := range [][2]string{
		{"", ""},
		{"48656c6c6f20576f726c6421", "2NEpo7TZRRrLZSi2U"},
		{"0000287fb4cd", "11233QC4"},
		{"00", "1"},
		{"0000", "11"},
		{"ff", "5Q"},
		{"00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L"},
	} {
		if got := Base58Encode(h(c[0])); got != c[1] {
			t.Errorf("Base58Encode(%s) = %q, want %q", c[0], got, c[1])
		}
		if got, err := Base58Decode(c[1]); err != nil || !bytes.Equal(got, h(c[0])) {
			t.Errorf("Base58Decode(%q) = %x, %v; want %s", c[1], got, err, c[0])
		}
	}
	for _, s := range []string{"0OIl", "abc0", "I"} {
		if got, err := Base58Decode(s); err == nil {
			t.Errorf("Base58Decode(%q) = %x, want error", s, got)
		}
	}
}

func TestBase64URL(t *testing.T) {
	for _, c := range [][2]string{
		{"", ""}, {"66", "Zg"}, {"666f", "Zm8"}, {"666f6f", "Zm9v"}, {"666f6f62", "Zm9vYg"},
		{"666f6f6261", "Zm9vYmE"}, {"666f6f626172", "Zm9vYmFy"}, {"fbff", "-_8"}, {"000102030405", "AAECAwQF"},
	} {
		if got := Base64URLEncode(h(c[0])); got != c[1] {
			t.Errorf("Base64URLEncode(%s) = %q, want %q", c[0], got, c[1])
		}
		if got, err := Base64URLDecode(c[1]); err != nil || !bytes.Equal(got, h(c[0])) {
			t.Errorf("Base64URLDecode(%q) = %x, %v; want %s", c[1], got, err, c[0])
		}
	}
	for _, s := range []string{"Zg==", "Zh", "a", "+/", "Zm9v!"} {
		if got, err := Base64URLDecode(s); err == nil {
			t.Errorf("Base64URLDecode(%q) = %x, want error", s, got)
		}
	}
}
