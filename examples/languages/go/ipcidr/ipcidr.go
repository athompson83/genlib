// SPDX-License-Identifier: Apache-2.0

// Package ipcidr parses IPv4/IPv6 text by hand (identical results on every
// platform), formats RFC 5952 canonical text, tests CIDR membership and
// classifies addresses for SSRF guards.
//
// SSRF use: resolve the hostname yourself, check EVERY resolved address with
// IsPublicIP, then connect to that checked address (no second DNS lookup),
// and repeat the check after every redirect.
package ipcidr

import (
	"errors"
	"strconv"
	"strings"
)

var errIP = errors.New("ipcidr: invalid IP address")

func decimal(p string, max int) (int, bool) {
	if p == "" || len(p) > 3 || (len(p) > 1 && p[0] == '0') {
		return 0, false
	}
	n := 0
	for i := 0; i < len(p); i++ {
		if p[i] < '0' || p[i] > '9' {
			return 0, false
		}
		n = n*10 + int(p[i]-'0')
	}
	return n, n <= max
}

func parseV4(s string) ([]byte, error) {
	parts := strings.Split(s, ".")
	if len(parts) != 4 {
		return nil, errIP
	}
	out := make([]byte, 4)
	for i, p := range parts {
		n, ok := decimal(p, 255)
		if !ok {
			return nil, errIP
		}
		out[i] = byte(n)
	}
	return out, nil
}

func hexGroups(x string) ([]uint16, error) {
	if x == "" {
		return nil, nil
	}
	var out []uint16
	for _, h := range strings.Split(x, ":") {
		if h == "" || len(h) > 4 {
			return nil, errIP
		}
		n, err := strconv.ParseUint(h, 16, 16)
		if err != nil || strings.ContainsAny(h, "+-xX_") {
			return nil, errIP
		}
		out = append(out, uint16(n))
	}
	return out, nil
}

func parseV6(s string) ([]byte, error) {
	if strings.Count(s, "::") > 1 || s == "" {
		return nil, errIP
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' || c == ':' || c == '.') {
			return nil, errIP
		}
	}
	var tail []byte
	if strings.Contains(s, ".") {
		i := strings.LastIndex(s, ":")
		t, err := parseV4(s[i+1:])
		if err != nil {
			return nil, err
		}
		tail = t
		if i >= 1 && s[i-1] == ':' {
			s = s[:i+1]
		} else {
			s = s[:i]
		}
	}
	need := 8
	if tail != nil {
		need = 6
	}
	var g []uint16
	if strings.Contains(s, "::") {
		ab := strings.SplitN(s, "::", 2)
		ga, err := hexGroups(ab[0])
		if err != nil {
			return nil, err
		}
		gb, err := hexGroups(ab[1])
		if err != nil {
			return nil, err
		}
		if len(ga)+len(gb) > need-1 {
			return nil, errIP
		}
		g = append(g, ga...)
		g = append(g, make([]uint16, need-len(ga)-len(gb))...)
		g = append(g, gb...)
	} else {
		var err error
		if g, err = hexGroups(s); err != nil {
			return nil, err
		}
		if len(g) != need {
			return nil, errIP
		}
	}
	out := make([]byte, 0, 16)
	for _, x := range g {
		out = append(out, byte(x>>8), byte(x))
	}
	return append(out, tail...), nil
}

// ParseIP returns 4 bytes for IPv4 or 16 bytes for IPv6 text. Zone ids,
// brackets, whitespace and CIDR suffixes are rejected.
func ParseIP(text string) ([]byte, error) {
	if strings.Contains(text, ":") {
		return parseV6(text)
	}
	return parseV4(text)
}

func isMapped(b []byte) bool {
	for i := 0; i < 10; i++ {
		if b[i] != 0 {
			return false
		}
	}
	return b[10] == 0xff && b[11] == 0xff
}

func v4Text(b []byte) string {
	return strconv.Itoa(int(b[0])) + "." + strconv.Itoa(int(b[1])) + "." + strconv.Itoa(int(b[2])) + "." + strconv.Itoa(int(b[3]))
}

// FormatIP writes 4 or 16 bytes as canonical text (RFC 5952 for IPv6).
func FormatIP(b []byte) string {
	if len(b) == 4 {
		return v4Text(b)
	}
	if isMapped(b) {
		return "::ffff:" + v4Text(b[12:])
	}
	g := make([]string, 8)
	zero := make([]bool, 8)
	for i := 0; i < 8; i++ {
		v := uint16(b[2*i])<<8 | uint16(b[2*i+1])
		g[i] = strconv.FormatUint(uint64(v), 16)
		zero[i] = v == 0
	}
	best, bl := -1, 1
	for i := 0; i < 8; {
		if !zero[i] {
			i++
			continue
		}
		j := i
		for j < 8 && zero[j] {
			j++
		}
		if j-i > bl {
			best, bl = i, j-i
		}
		i = j
	}
	if best < 0 {
		return strings.Join(g, ":")
	}
	return strings.Join(g[:best], ":") + "::" + strings.Join(g[best+bl:], ":")
}

// CanonicalIP returns the canonical text of an IP address.
func CanonicalIP(text string) (string, error) {
	b, err := ParseIP(text)
	if err != nil {
		return "", err
	}
	return FormatIP(b), nil
}

func parseCIDR(cidr string) ([]byte, int, error) {
	if strings.Count(cidr, "/") != 1 {
		return nil, 0, errors.New("ipcidr: CIDR must be address/prefix")
	}
	i := strings.Index(cidr, "/")
	b, err := ParseIP(cidr[:i])
	if err != nil {
		return nil, 0, err
	}
	p, ok := decimal(cidr[i+1:], len(b)*8)
	if !ok {
		return nil, 0, errors.New("ipcidr: invalid prefix length")
	}
	for bit := p; bit < len(b)*8; bit++ {
		if b[bit/8]&(0x80>>uint(bit%8)) != 0 {
			return nil, 0, errors.New("ipcidr: CIDR has host bits set")
		}
	}
	return b, p, nil
}

func prefixEqual(a, b []byte, p int) bool {
	for bit := 0; bit < p; bit++ {
		m := byte(0x80 >> uint(bit%8))
		if a[bit/8]&m != b[bit/8]&m {
			return false
		}
	}
	return true
}

// CIDRContains reports whether ip lies inside cidr. Different families never
// match. Malformed CIDRs (or host bits set) and malformed IPs are errors.
func CIDRContains(cidr, ip string) (bool, error) {
	b, p, err := parseCIDR(cidr)
	if err != nil {
		return false, err
	}
	x, err := ParseIP(ip)
	if err != nil {
		return false, err
	}
	return len(x) == len(b) && prefixEqual(x, b, p), nil
}

type block struct {
	addr []byte
	bits int
}

func mustBlocks(list []string) []block {
	out := make([]block, len(list))
	for i, c := range list {
		b, p, err := parseCIDR(c)
		if err != nil {
			panic(err)
		}
		out[i] = block{b, p}
	}
	return out
}

var (
	v4Special = mustBlocks([]string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"})
	v6Special = mustBlocks([]string{"::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "ff00::/8"})
	nat64     = []byte{0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0}
)

// IsPublicIP reports whether ip is a globally routable address outside every
// special-purpose range. IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96)
// addresses are judged by their embedded IPv4. Unparseable input is false.
func IsPublicIP(ip string) bool {
	b, err := ParseIP(ip)
	if err != nil {
		return false
	}
	if len(b) == 16 && (isMapped(b) || string(b[:12]) == string(nat64)) {
		b = b[12:]
	}
	list := v6Special
	if len(b) == 4 {
		list = v4Special
	}
	for _, s := range list {
		if len(s.addr) == len(b) && prefixEqual(b, s.addr, s.bits) {
			return false
		}
	}
	return true
}
