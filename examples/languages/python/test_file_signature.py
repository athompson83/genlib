# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 9 shared vector set; do not edit the literals by hand.
import unittest

from file_signature import detect_file_type, matches_extension

DETECT = [['png', '89504e470d0a1a0a0000000d49484452', ['image/png', 'png']],
 ['jpg', 'ffd8ffe000104a464946', ['image/jpeg', 'jpg']],
 ['gif', '4749463839610100', ['image/gif', 'gif']],
 ['webp', '52494646240000005745425056503820', ['image/webp', 'webp']],
 ['wav', '524946462400000057415645666d7420', ['audio/wav', 'wav']],
 ['avi', '5249464624000000415649204c495354', ['video/x-msvideo', 'avi']],
 ['bmp', '424d0000000000000000000000000000', ['image/bmp', 'bmp']],
 ['ico', '000001000100', ['image/x-icon', 'ico']],
 ['tif', '49492a000800', ['image/tiff', 'tif']],
 ['tif-be', '4d4d002a0008', ['image/tiff', 'tif']],
 ['pdf', '255044462d312e370a', ['application/pdf', 'pdf']],
 ['zip', '504b03041400', ['application/zip', 'zip']],
 ['zip-empty', '504b0506000000000000000000000000000000000000', ['application/zip', 'zip']],
 ['gz', '1f8b0800', ['application/gzip', 'gz']],
 ['7z', '377abcaf271c0004', ['application/x-7z-compressed', '7z']],
 ['rar', '526172211a070100', ['application/vnd.rar', 'rar']],
 ['sqlite', '53514c69746520666f726d61742033001000', ['application/vnd.sqlite3', 'sqlite']],
 ['wasm', '0061736d01000000', ['application/wasm', 'wasm']],
 ['ogg', '4f6767530002', ['audio/ogg', 'ogg']],
 ['flac', '664c614300000022', ['audio/flac', 'flac']],
 ['mp3-id3', '494433040000', ['audio/mpeg', 'mp3']],
 ['mp3-frame', 'fffb9064', ['audio/mpeg', 'mp3']],
 ['webm', '1a45dfa39f4286', ['video/webm', 'webm']],
 ['mp4', '000000206674797069736f6d00000200', ['video/mp4', 'mp4']],
 ['mov', '00000014667479707174202000000000', ['video/quicktime', 'mov']],
 ['heic', '00000018667479706865696300000000', ['image/heic', 'heic']],
 ['avif', '0000001c667479706176696600000000', ['image/avif', 'avif']],
 ['m4a', '00000020667479704d34412000000000', ['audio/mp4', 'm4a']],
 ['woff', '774f464600010000', ['font/woff', 'woff']],
 ['woff2', '774f463200010000', ['font/woff2', 'woff2']],
 ['text', '68656c6c6f20776f726c64', None],
 ['empty', '', None],
 ['short-png', '89504e47', None],
 ['bm-short', '424d0000', None],
 ['ff-not-mp3', 'ffe10000', None],
 ['html', '3c21444f43545950452068746d6c3e', None]]
EXTENSION = [['89504e470d0a1a0a0000000d49484452', 'a.png', True],
 ['89504e470d0a1a0a0000000d49484452', 'a.PNG', True],
 ['89504e470d0a1a0a0000000d49484452', 'a.jpg', False],
 ['ffd8ffe000104a464946', 'photo.jpeg', True],
 ['504b03041400', 'report.docx', True],
 ['504b03041400', 'x.xlsx', True],
 ['255044462d312e370a', 'x.pdf.exe', False],
 ['00000018667479706865696300000000', 'IMG_1.HEIF', True],
 ['68656c6c6f20776f726c64', 'a.txt', False],
 ['89504e470d0a1a0a0000000d49484452', 'noext', False],
 ['49492a000800', 'scan.tiff', True],
 ['494433040000', 'song.mp3', True],
 ['1f8b0800', 'a.tar.gz', True]]


class FileSignatureTest(unittest.TestCase):
    def test_detect(self):
        for name, hex_bytes, expected in DETECT:
            got = detect_file_type(bytes.fromhex(hex_bytes))
            self.assertEqual(list(got) if got else None, expected, name)

    def test_extension(self):
        for hex_bytes, filename, expected in EXTENSION:
            self.assertEqual(matches_extension(bytes.fromhex(hex_bytes), filename), expected, filename)

    def test_reads_only_64_bytes(self):
        self.assertIsNone(detect_file_type(b"\x00" * 64 + b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
