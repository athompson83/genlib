// SPDX-License-Identifier: Apache-2.0

package totp

import "testing"

var (
	seed20 = []byte("12345678901234567890")
	seed32 = []byte("12345678901234567890123456789012")
	seed64 = []byte("1234567890123456789012345678901234567890123456789012345678901234")
)

func TestHOTPRFC4226(t *testing.T) {
	want := []string{"755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"}
	for i, w := range want {
		got, err := HOTP(seed20, uint64(i), 6, SHA1)
		if err != nil || got != w {
			t.Fatalf("counter %d: got %q err %v want %q", i, got, err, w)
		}
	}
}

func TestTOTPRFC6238(t *testing.T) {
	cases := []struct {
		t                    int64
		sha1, sha256, sha512 string
	}{
		{59, "94287082", "46119246", "90693936"},
		{1111111109, "07081804", "68084774", "25091201"},
		{1111111111, "14050471", "67062674", "99943326"},
		{1234567890, "89005924", "91819424", "93441116"},
		{2000000000, "69279037", "90698825", "38618901"},
		{20000000000, "65353130", "77737706", "47863826"},
	}
	for _, c := range cases {
		for _, v := range []struct {
			alg    Algorithm
			secret []byte
			want   string
		}{{SHA1, seed20, c.sha1}, {SHA256, seed32, c.sha256}, {SHA512, seed64, c.sha512}} {
			got, err := TOTP(v.secret, c.t, Options{Digits: 8, Algorithm: v.alg})
			if err != nil || got != v.want {
				t.Fatalf("t=%d %s: got %q err %v want %q", c.t, v.alg, got, err, v.want)
			}
		}
	}
}

func TestBase32(t *testing.T) {
	if got := Base32Encode([]byte("foobar")); got != "MZXW6YTBOI" {
		t.Fatalf("encode: %q", got)
	}
	got, err := Base32Decode("mzxw 6ytb-oi==")
	if err != nil || string(got) != "foobar" {
		t.Fatalf("decode: %q %v", got, err)
	}
	if _, err := Base32Decode("MZ1"); err == nil {
		t.Fatal("MZ1 accepted")
	}
}

func TestVerify(t *testing.T) {
	opts := Options{Digits: 8}
	code, err := TOTP(seed20, 59, opts)
	if err != nil {
		t.Fatal(err)
	}
	if !Verify(code, seed20, 59, 1, opts) || !Verify(code, seed20, 89, 1, opts) {
		t.Fatal("expected code to verify at t=59 and t=89")
	}
	if Verify(code, seed20, 150, 1, opts) {
		t.Fatal("code verified outside the window")
	}
	for _, bad := range []string{"abc", "1234567"} {
		if Verify(bad, seed20, 59, 1, opts) {
			t.Fatalf("accepted %q", bad)
		}
	}
	if Verify("9428708a", seed20, 59, 1, opts) {
		t.Fatal("accepted non-digit code")
	}
}

func TestOtpauthURI(t *testing.T) {
	got, err := OtpauthURI("Acme Co", "alice@example.com", "JBSWY3DPEHPK3PXP", 0, 0, "")
	want := "otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30"
	if err != nil || got != want {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestGenerateSecret(t *testing.T) {
	a, err := GenerateSecret(0)
	if err != nil || len(a) != 20 {
		t.Fatalf("len %d err %v", len(a), err)
	}
	b, _ := GenerateSecret(20)
	if string(a) == string(b) {
		t.Fatal("two secrets were identical")
	}
}

func TestInvalidOptions(t *testing.T) {
	if _, err := HOTP(seed20, 0, 5, SHA1); err == nil {
		t.Fatal("accepted 5 digits")
	}
	if _, err := HOTP(seed20, 0, 6, "MD5"); err == nil {
		t.Fatal("accepted MD5")
	}
	if _, err := TOTP(seed20, -1, Options{}); err == nil {
		t.Fatal("accepted time before T0")
	}
}
