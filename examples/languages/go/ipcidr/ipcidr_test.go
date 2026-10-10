// SPDX-License-Identifier: Apache-2.0

package ipcidr

import "testing"

func TestCanonical(t *testing.T) {
	for _, c := range [][2]string{
		{"192.168.1.1", "192.168.1.1"},
		{"2001:DB8:0:0:0:0:0:1", "2001:db8::1"},
		{"2001:db8::0:1", "2001:db8::1"},
		{"::", "::"},
		{"::1", "::1"},
		{"2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"},
		{"2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"},
		{"fe80::1:0:0:0", "fe80::1:0:0:0"},
		{"::ffff:192.0.2.128", "::ffff:192.0.2.128"},
		{"::ffff:c000:280", "::ffff:192.0.2.128"},
		{"1:0:0:2:0:0:0:3", "1:0:0:2::3"},
		{"64:ff9b::198.51.100.7", "64:ff9b::c633:6407"},
	} {
		got, err := CanonicalIP(c[0])
		if err != nil || got != c[1] {
			t.Errorf("CanonicalIP(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1:2:3:4:5:6:7:8:9", "1::2::3", "::g", "fe80::1%eth0", "[::1]", "", " 1.2.3.4", "1.2.3.4/24", "12345::"} {
		if b, err := ParseIP(s); err == nil {
			t.Errorf("ParseIP(%q) = %v, want error", s, b)
		}
	}
}

func TestContains(t *testing.T) {
	for _, c := range []struct {
		cidr, ip string
		want     bool
	}{
		{"10.0.0.0/8", "10.255.1.2", true},
		{"10.0.0.0/8", "11.0.0.1", false},
		{"192.168.1.0/24", "192.168.1.255", true},
		{"0.0.0.0/0", "8.8.8.8", true},
		{"2001:db8::/32", "2001:db8:ffff::1", true},
		{"2001:db8::/32", "2001:db9::1", false},
		{"10.0.0.0/8", "::ffff:10.0.0.1", false},
		{"::/0", "::1", true},
		{"192.168.1.1/32", "192.168.1.1", true},
	} {
		got, err := CIDRContains(c.cidr, c.ip)
		if err != nil || got != c.want {
			t.Errorf("CIDRContains(%q, %q) = %v, %v", c.cidr, c.ip, got, err)
		}
	}
	for _, c := range []string{"10.0.0.1/8", "10.0.0.0/33", "10.0.0.0", "10.0.0.0/08", "2001:db8::/129"} {
		if _, err := CIDRContains(c, "10.0.0.1"); err == nil {
			t.Errorf("CIDRContains(%q) accepted a malformed CIDR", c)
		}
	}
}

func TestPublic(t *testing.T) {
	for _, c := range []struct {
		ip   string
		want bool
	}{
		{"8.8.8.8", true}, {"10.1.2.3", false}, {"127.0.0.1", false}, {"169.254.169.254", false},
		{"100.64.0.1", false}, {"172.31.255.255", false}, {"172.32.0.1", true}, {"192.168.0.10", false},
		{"0.0.0.0", false}, {"255.255.255.255", false}, {"224.0.0.1", false}, {"2606:4700:4700::1111", true},
		{"::1", false}, {"fd00::1", false}, {"fe80::1", false}, {"::ffff:127.0.0.1", false},
		{"::ffff:8.8.8.8", true}, {"64:ff9b::a00:1", false}, {"2001:db8::1", false}, {"ff02::1", false},
	} {
		if got := IsPublicIP(c.ip); got != c.want {
			t.Errorf("IsPublicIP(%q) = %v", c.ip, got)
		}
	}
	if IsPublicIP("not an ip") {
		t.Error("unparseable input must not be public")
	}
}
