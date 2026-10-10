# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from ip_cidr import canonical_ip, cidr_contains, is_public_ip, parse_ip

CANONICAL = [('192.168.1.1', '192.168.1.1'),
 ('2001:DB8:0:0:0:0:0:1', '2001:db8::1'),
 ('2001:db8::0:1', '2001:db8::1'),
 ('::', '::'),
 ('::1', '::1'),
 ('2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'),
 ('2001:0db8:0000:0000:0000:ff00:0042:8329', '2001:db8::ff00:42:8329'),
 ('fe80::1:0:0:0', 'fe80::1:0:0:0'),
 ('::ffff:192.0.2.128', '::ffff:192.0.2.128'),
 ('::ffff:c000:280', '::ffff:192.0.2.128'),
 ('1:0:0:2:0:0:0:3', '1:0:0:2::3'),
 ('64:ff9b::198.51.100.7', '64:ff9b::c633:6407')]
INVALID = ['256.1.1.1',
 '01.2.3.4',
 '1.2.3',
 '1.2.3.4.5',
 '1:2:3:4:5:6:7:8:9',
 '1::2::3',
 '::g',
 'fe80::1%eth0',
 '[::1]',
 '',
 ' 1.2.3.4',
 '1.2.3.4/24',
 '12345::']
CONTAINS = [('10.0.0.0/8', '10.255.1.2', True),
 ('10.0.0.0/8', '11.0.0.1', False),
 ('192.168.1.0/24', '192.168.1.255', True),
 ('0.0.0.0/0', '8.8.8.8', True),
 ('2001:db8::/32', '2001:db8:ffff::1', True),
 ('2001:db8::/32', '2001:db9::1', False),
 ('10.0.0.0/8', '::ffff:10.0.0.1', False),
 ('::/0', '::1', True),
 ('192.168.1.1/32', '192.168.1.1', True)]
INVALID_CIDR = ['10.0.0.1/8', '10.0.0.0/33', '10.0.0.0', '10.0.0.0/08', '2001:db8::/129']
PUBLIC = [('8.8.8.8', True),
 ('10.1.2.3', False),
 ('127.0.0.1', False),
 ('169.254.169.254', False),
 ('100.64.0.1', False),
 ('172.31.255.255', False),
 ('172.32.0.1', True),
 ('192.168.0.10', False),
 ('0.0.0.0', False),
 ('255.255.255.255', False),
 ('224.0.0.1', False),
 ('2606:4700:4700::1111', True),
 ('::1', False),
 ('fd00::1', False),
 ('fe80::1', False),
 ('::ffff:127.0.0.1', False),
 ('::ffff:8.8.8.8', True),
 ('64:ff9b::a00:1', False),
 ('2001:db8::1', False),
 ('ff02::1', False)]


class IpCidrTests(unittest.TestCase):
    def test_canonical(self):
        for text, expected in CANONICAL:
            self.assertEqual(canonical_ip(text), expected, text)

    def test_parse_lengths(self):
        self.assertEqual(parse_ip("10.0.0.1"), bytes([10, 0, 0, 1]))
        self.assertEqual(len(parse_ip("::ffff:1.2.3.4")), 16)

    def test_invalid(self):
        for text in INVALID:
            with self.assertRaises(ValueError, msg=text):
                parse_ip(text)

    def test_contains(self):
        for cidr, ip, expected in CONTAINS:
            self.assertEqual(cidr_contains(cidr, ip), expected, (cidr, ip))

    def test_invalid_cidr(self):
        for cidr in INVALID_CIDR:
            with self.assertRaises(ValueError, msg=cidr):
                cidr_contains(cidr, "10.0.0.1")

    def test_public(self):
        for ip, expected in PUBLIC:
            self.assertEqual(is_public_ip(ip), expected, ip)


if __name__ == "__main__":
    unittest.main()
