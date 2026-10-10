// SPDX-License-Identifier: Apache-2.0

package passwordpolicy

import (
	"reflect"
	"strings"
	"testing"
)

func TestCheck(t *testing.T) {
	d := DefaultOptions()
	with := func(f func(*Options)) Options { o := DefaultOptions(); f(&o); return o }
	min8 := with(func(o *Options) { o.MinLength = 8 })
	for _, c := range []struct {
		pw   string
		o    Options
		want []string
	}{
		{"correct horse battery staple", d, nil},
		{"short", d, []string{"too-short"}},
		{"Tr0ub4dor&3", min8, nil},
		{"password", with(func(o *Options) { o.MinLength = 8; o.Blocklist = []string{"Password", "123456"} }), []string{"blocklisted"}},
		{strings.Repeat("a", 65), with(func(o *Options) { o.MaxLength = 64 }), []string{"too-long", "repetitive"}},
		{"aaaa-unique-phrase-x", d, []string{"repetitive"}},
		{"my-1234-long-passphrase", d, []string{"repetitive"}},
		{"zyxw-backwards-phrase!", d, []string{"repetitive"}},
		{"alice-secret-passphrase", with(func(o *Options) { o.Context = []string{"alice", "example"} }), []string{"contains-context"}},
		{"tab\tinside-long-enough", d, []string{"control-characters"}},
		{"ünïcödé-pässwörd-long", d, nil},
		{strings.Repeat("😀", 15), d, []string{"repetitive"}},
		{"ABCD-upper-sequence-x", d, []string{"repetitive"}},
	} {
		got, err := Check(c.pw, c.o)
		want := Result{len(c.want) == 0, c.want}
		if want.Failures == nil {
			want.Failures = []string{}
		}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("Check(%q) = %+v, %v; want %+v", c.pw, got, err, want)
		}
	}
	for _, o := range []Options{{MinLength: 0, MaxLength: 64}, {MinLength: 10, MaxLength: 9}} {
		if _, err := Check("x", o); err == nil {
			t.Errorf("Check with %+v want error", o)
		}
	}
}
