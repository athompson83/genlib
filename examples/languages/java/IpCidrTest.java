// SPDX-License-Identifier: Apache-2.0

/** Wave 6 vectors (shared with every Genlib language) for ip-cidr. */
public final class IpCidrTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq("192.168.1.1", IpCidr.canonicalIp("192.168.1.1"), "canonical " + "192.168.1.1");
        eq("2001:db8::1", IpCidr.canonicalIp("2001:DB8:0:0:0:0:0:1"), "canonical " + "2001:DB8:0:0:0:0:0:1");
        eq("2001:db8::1", IpCidr.canonicalIp("2001:db8::0:1"), "canonical " + "2001:db8::0:1");
        eq("::", IpCidr.canonicalIp("::"), "canonical " + "::");
        eq("::1", IpCidr.canonicalIp("::1"), "canonical " + "::1");
        eq("2001:db8::1:0:0:1", IpCidr.canonicalIp("2001:db8:0:0:1:0:0:1"), "canonical " + "2001:db8:0:0:1:0:0:1");
        eq("2001:db8::ff00:42:8329", IpCidr.canonicalIp("2001:0db8:0000:0000:0000:ff00:0042:8329"), "canonical " + "2001:0db8:0000:0000:0000:ff00:0042:8329");
        eq("fe80::1:0:0:0", IpCidr.canonicalIp("fe80::1:0:0:0"), "canonical " + "fe80::1:0:0:0");
        eq("::ffff:192.0.2.128", IpCidr.canonicalIp("::ffff:192.0.2.128"), "canonical " + "::ffff:192.0.2.128");
        eq("::ffff:192.0.2.128", IpCidr.canonicalIp("::ffff:c000:280"), "canonical " + "::ffff:c000:280");
        eq("1:0:0:2::3", IpCidr.canonicalIp("1:0:0:2:0:0:0:3"), "canonical " + "1:0:0:2:0:0:0:3");
        eq("64:ff9b::c633:6407", IpCidr.canonicalIp("64:ff9b::198.51.100.7"), "canonical " + "64:ff9b::198.51.100.7");
        throwsIae(() -> IpCidr.parseIp("256.1.1.1"), "invalid ip " + "256.1.1.1");
        throwsIae(() -> IpCidr.parseIp("01.2.3.4"), "invalid ip " + "01.2.3.4");
        throwsIae(() -> IpCidr.parseIp("1.2.3"), "invalid ip " + "1.2.3");
        throwsIae(() -> IpCidr.parseIp("1.2.3.4.5"), "invalid ip " + "1.2.3.4.5");
        throwsIae(() -> IpCidr.parseIp("1:2:3:4:5:6:7:8:9"), "invalid ip " + "1:2:3:4:5:6:7:8:9");
        throwsIae(() -> IpCidr.parseIp("1::2::3"), "invalid ip " + "1::2::3");
        throwsIae(() -> IpCidr.parseIp("::g"), "invalid ip " + "::g");
        throwsIae(() -> IpCidr.parseIp("fe80::1%eth0"), "invalid ip " + "fe80::1%eth0");
        throwsIae(() -> IpCidr.parseIp("[::1]"), "invalid ip " + "[::1]");
        throwsIae(() -> IpCidr.parseIp(""), "invalid ip " + "");
        throwsIae(() -> IpCidr.parseIp(" 1.2.3.4"), "invalid ip " + " 1.2.3.4");
        throwsIae(() -> IpCidr.parseIp("1.2.3.4/24"), "invalid ip " + "1.2.3.4/24");
        throwsIae(() -> IpCidr.parseIp("12345::"), "invalid ip " + "12345::");
        eq(true, IpCidr.cidrContains("10.0.0.0/8", "10.255.1.2"), "contains " + "10.0.0.0/8" + " " + "10.255.1.2");
        eq(false, IpCidr.cidrContains("10.0.0.0/8", "11.0.0.1"), "contains " + "10.0.0.0/8" + " " + "11.0.0.1");
        eq(true, IpCidr.cidrContains("192.168.1.0/24", "192.168.1.255"), "contains " + "192.168.1.0/24" + " " + "192.168.1.255");
        eq(true, IpCidr.cidrContains("0.0.0.0/0", "8.8.8.8"), "contains " + "0.0.0.0/0" + " " + "8.8.8.8");
        eq(true, IpCidr.cidrContains("2001:db8::/32", "2001:db8:ffff::1"), "contains " + "2001:db8::/32" + " " + "2001:db8:ffff::1");
        eq(false, IpCidr.cidrContains("2001:db8::/32", "2001:db9::1"), "contains " + "2001:db8::/32" + " " + "2001:db9::1");
        eq(false, IpCidr.cidrContains("10.0.0.0/8", "::ffff:10.0.0.1"), "contains " + "10.0.0.0/8" + " " + "::ffff:10.0.0.1");
        eq(true, IpCidr.cidrContains("::/0", "::1"), "contains " + "::/0" + " " + "::1");
        eq(true, IpCidr.cidrContains("192.168.1.1/32", "192.168.1.1"), "contains " + "192.168.1.1/32" + " " + "192.168.1.1");
        throwsIae(() -> IpCidr.cidrContains("10.0.0.1/8", "10.0.0.1"), "invalid cidr " + "10.0.0.1/8");
        throwsIae(() -> IpCidr.cidrContains("10.0.0.0/33", "10.0.0.1"), "invalid cidr " + "10.0.0.0/33");
        throwsIae(() -> IpCidr.cidrContains("10.0.0.0", "10.0.0.1"), "invalid cidr " + "10.0.0.0");
        throwsIae(() -> IpCidr.cidrContains("10.0.0.0/08", "10.0.0.1"), "invalid cidr " + "10.0.0.0/08");
        throwsIae(() -> IpCidr.cidrContains("2001:db8::/129", "10.0.0.1"), "invalid cidr " + "2001:db8::/129");
        eq(true, IpCidr.isPublicIp("8.8.8.8"), "public " + "8.8.8.8");
        eq(false, IpCidr.isPublicIp("10.1.2.3"), "public " + "10.1.2.3");
        eq(false, IpCidr.isPublicIp("127.0.0.1"), "public " + "127.0.0.1");
        eq(false, IpCidr.isPublicIp("169.254.169.254"), "public " + "169.254.169.254");
        eq(false, IpCidr.isPublicIp("100.64.0.1"), "public " + "100.64.0.1");
        eq(false, IpCidr.isPublicIp("172.31.255.255"), "public " + "172.31.255.255");
        eq(true, IpCidr.isPublicIp("172.32.0.1"), "public " + "172.32.0.1");
        eq(false, IpCidr.isPublicIp("192.168.0.10"), "public " + "192.168.0.10");
        eq(false, IpCidr.isPublicIp("0.0.0.0"), "public " + "0.0.0.0");
        eq(false, IpCidr.isPublicIp("255.255.255.255"), "public " + "255.255.255.255");
        eq(false, IpCidr.isPublicIp("224.0.0.1"), "public " + "224.0.0.1");
        eq(true, IpCidr.isPublicIp("2606:4700:4700::1111"), "public " + "2606:4700:4700::1111");
        eq(false, IpCidr.isPublicIp("::1"), "public " + "::1");
        eq(false, IpCidr.isPublicIp("fd00::1"), "public " + "fd00::1");
        eq(false, IpCidr.isPublicIp("fe80::1"), "public " + "fe80::1");
        eq(false, IpCidr.isPublicIp("::ffff:127.0.0.1"), "public " + "::ffff:127.0.0.1");
        eq(true, IpCidr.isPublicIp("::ffff:8.8.8.8"), "public " + "::ffff:8.8.8.8");
        eq(false, IpCidr.isPublicIp("64:ff9b::a00:1"), "public " + "64:ff9b::a00:1");
        eq(false, IpCidr.isPublicIp("2001:db8::1"), "public " + "2001:db8::1");
        eq(false, IpCidr.isPublicIp("ff02::1"), "public " + "ff02::1");
        eq(16, IpCidr.parseIp("::ffff:1.2.3.4").length, "mapped length");

        System.out.println("IpCidrTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
