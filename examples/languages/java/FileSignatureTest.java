// SPDX-License-Identifier: Apache-2.0

public final class FileSignatureTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void near(double expected, double actual, double tol, String name) {
        check(Math.abs(expected - actual) <= tol, name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void nearAll(double[] expected, double[] actual, double tol, String name) {
        check(expected.length == actual.length, name + " length");
        for (int i = 0; i < Math.min(expected.length, actual.length); i++) near(expected[i], actual[i], tol, name + "[" + i + "]");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static byte[] hex(String h) {
        byte[] out = new byte[h.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16);
        return out;
    }

    public static void main(String[] args) {
        eq(new FileSignature.FileType("image/png", "png"), FileSignature.detectFileType(hex("89504e470d0a1a0a0000000d49484452")), "detect png");
        eq(new FileSignature.FileType("image/jpeg", "jpg"), FileSignature.detectFileType(hex("ffd8ffe000104a464946")), "detect jpg");
        eq(new FileSignature.FileType("image/gif", "gif"), FileSignature.detectFileType(hex("4749463839610100")), "detect gif");
        eq(new FileSignature.FileType("image/webp", "webp"), FileSignature.detectFileType(hex("52494646240000005745425056503820")), "detect webp");
        eq(new FileSignature.FileType("audio/wav", "wav"), FileSignature.detectFileType(hex("524946462400000057415645666d7420")), "detect wav");
        eq(new FileSignature.FileType("video/x-msvideo", "avi"), FileSignature.detectFileType(hex("5249464624000000415649204c495354")), "detect avi");
        eq(new FileSignature.FileType("image/bmp", "bmp"), FileSignature.detectFileType(hex("424d0000000000000000000000000000")), "detect bmp");
        eq(new FileSignature.FileType("image/x-icon", "ico"), FileSignature.detectFileType(hex("000001000100")), "detect ico");
        eq(new FileSignature.FileType("image/tiff", "tif"), FileSignature.detectFileType(hex("49492a000800")), "detect tif");
        eq(new FileSignature.FileType("image/tiff", "tif"), FileSignature.detectFileType(hex("4d4d002a0008")), "detect tif-be");
        eq(new FileSignature.FileType("application/pdf", "pdf"), FileSignature.detectFileType(hex("255044462d312e370a")), "detect pdf");
        eq(new FileSignature.FileType("application/zip", "zip"), FileSignature.detectFileType(hex("504b03041400")), "detect zip");
        eq(new FileSignature.FileType("application/zip", "zip"), FileSignature.detectFileType(hex("504b0506000000000000000000000000000000000000")), "detect zip-empty");
        eq(new FileSignature.FileType("application/gzip", "gz"), FileSignature.detectFileType(hex("1f8b0800")), "detect gz");
        eq(new FileSignature.FileType("application/x-7z-compressed", "7z"), FileSignature.detectFileType(hex("377abcaf271c0004")), "detect 7z");
        eq(new FileSignature.FileType("application/vnd.rar", "rar"), FileSignature.detectFileType(hex("526172211a070100")), "detect rar");
        eq(new FileSignature.FileType("application/vnd.sqlite3", "sqlite"), FileSignature.detectFileType(hex("53514c69746520666f726d61742033001000")), "detect sqlite");
        eq(new FileSignature.FileType("application/wasm", "wasm"), FileSignature.detectFileType(hex("0061736d01000000")), "detect wasm");
        eq(new FileSignature.FileType("audio/ogg", "ogg"), FileSignature.detectFileType(hex("4f6767530002")), "detect ogg");
        eq(new FileSignature.FileType("audio/flac", "flac"), FileSignature.detectFileType(hex("664c614300000022")), "detect flac");
        eq(new FileSignature.FileType("audio/mpeg", "mp3"), FileSignature.detectFileType(hex("494433040000")), "detect mp3-id3");
        eq(new FileSignature.FileType("audio/mpeg", "mp3"), FileSignature.detectFileType(hex("fffb9064")), "detect mp3-frame");
        eq(new FileSignature.FileType("video/webm", "webm"), FileSignature.detectFileType(hex("1a45dfa39f4286")), "detect webm");
        eq(new FileSignature.FileType("video/mp4", "mp4"), FileSignature.detectFileType(hex("000000206674797069736f6d00000200")), "detect mp4");
        eq(new FileSignature.FileType("video/quicktime", "mov"), FileSignature.detectFileType(hex("00000014667479707174202000000000")), "detect mov");
        eq(new FileSignature.FileType("image/heic", "heic"), FileSignature.detectFileType(hex("00000018667479706865696300000000")), "detect heic");
        eq(new FileSignature.FileType("image/avif", "avif"), FileSignature.detectFileType(hex("0000001c667479706176696600000000")), "detect avif");
        eq(new FileSignature.FileType("audio/mp4", "m4a"), FileSignature.detectFileType(hex("00000020667479704d34412000000000")), "detect m4a");
        eq(new FileSignature.FileType("font/woff", "woff"), FileSignature.detectFileType(hex("774f464600010000")), "detect woff");
        eq(new FileSignature.FileType("font/woff2", "woff2"), FileSignature.detectFileType(hex("774f463200010000")), "detect woff2");
        eq(null, FileSignature.detectFileType(hex("68656c6c6f20776f726c64")), "detect text");
        eq(null, FileSignature.detectFileType(hex("")), "detect empty");
        eq(null, FileSignature.detectFileType(hex("89504e47")), "detect short-png");
        eq(null, FileSignature.detectFileType(hex("424d0000")), "detect bm-short");
        eq(null, FileSignature.detectFileType(hex("ffe10000")), "detect ff-not-mp3");
        eq(null, FileSignature.detectFileType(hex("3c21444f43545950452068746d6c3e")), "detect html");
        eq(true, FileSignature.matchesExtension(hex("89504e470d0a1a0a0000000d49484452"), "a.png"), "extension a.png");
        eq(true, FileSignature.matchesExtension(hex("89504e470d0a1a0a0000000d49484452"), "a.PNG"), "extension a.PNG");
        eq(false, FileSignature.matchesExtension(hex("89504e470d0a1a0a0000000d49484452"), "a.jpg"), "extension a.jpg");
        eq(true, FileSignature.matchesExtension(hex("ffd8ffe000104a464946"), "photo.jpeg"), "extension photo.jpeg");
        eq(true, FileSignature.matchesExtension(hex("504b03041400"), "report.docx"), "extension report.docx");
        eq(true, FileSignature.matchesExtension(hex("504b03041400"), "x.xlsx"), "extension x.xlsx");
        eq(false, FileSignature.matchesExtension(hex("255044462d312e370a"), "x.pdf.exe"), "extension x.pdf.exe");
        eq(true, FileSignature.matchesExtension(hex("00000018667479706865696300000000"), "IMG_1.HEIF"), "extension IMG_1.HEIF");
        eq(false, FileSignature.matchesExtension(hex("68656c6c6f20776f726c64"), "a.txt"), "extension a.txt");
        eq(false, FileSignature.matchesExtension(hex("89504e470d0a1a0a0000000d49484452"), "noext"), "extension noext");
        eq(true, FileSignature.matchesExtension(hex("49492a000800"), "scan.tiff"), "extension scan.tiff");
        eq(true, FileSignature.matchesExtension(hex("494433040000"), "song.mp3"), "extension song.mp3");
        eq(true, FileSignature.matchesExtension(hex("1f8b0800"), "a.tar.gz"), "extension a.tar.gz");

        System.out.println("FileSignatureTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
