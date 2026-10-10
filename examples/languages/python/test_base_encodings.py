# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from base_encodings import (base32_decode, base32_encode, base58_decode, base58_encode,
                            base64url_decode, base64url_encode)

# [hex input, rfc4648 padded, hex alphabet padded, rfc4648 unpadded]
BASE32 = [['', '', '', ''],
 ['66', 'MY======', 'CO======', 'MY'],
 ['666f', 'MZXQ====', 'CPNG====', 'MZXQ'],
 ['666f6f', 'MZXW6===', 'CPNMU===', 'MZXW6'],
 ['666f6f62', 'MZXW6YQ=', 'CPNMUOG=', 'MZXW6YQ'],
 ['666f6f6261', 'MZXW6YTB', 'CPNMUOJ1', 'MZXW6YTB'],
 ['666f6f626172', 'MZXW6YTBOI======', 'CPNMUOJ1E8======', 'MZXW6YTBOI']]
BASE32_CASE_INSENSITIVE = [['mzxw6ytboi======', '666f6f626172']]
# [text, padding]: decoding must fail
BASE32_INVALID = [['MZXW6YT', True],
 ['MZXW6YR=', True],
 ['MZ======', True],
 ['MZXW6YTB1=======', True],
 ['MZXR====', True],
 ['MZXW6===', False]]
BASE58 = [['', ''],
 ['48656c6c6f20576f726c6421', '2NEpo7TZRRrLZSi2U'],
 ['0000287fb4cd', '11233QC4'],
 ['00', '1'],
 ['0000', '11'],
 ['ff', '5Q'],
 ['00eb15231dfceb60925886b67d065299925915aeb172c06647', '1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L']]
BASE58_INVALID = ['0OIl', 'abc0', 'I']
BASE64URL = [['', ''],
 ['66', 'Zg'],
 ['666f', 'Zm8'],
 ['666f6f', 'Zm9v'],
 ['666f6f62', 'Zm9vYg'],
 ['666f6f6261', 'Zm9vYmE'],
 ['666f6f626172', 'Zm9vYmFy'],
 ['fbff', '-_8'],
 ['000102030405', 'AAECAwQF']]
BASE64URL_INVALID = ['Zg==', 'Zh', 'a', '+/', 'Zm9v!']


class BaseEncodingsTest(unittest.TestCase):
    def test_base32(self):
        for hex_in, padded, hex_padded, unpadded in BASE32:
            data = bytes.fromhex(hex_in)
            self.assertEqual(base32_encode(data), padded)
            self.assertEqual(base32_encode(data, "hex"), hex_padded)
            self.assertEqual(base32_encode(data, padding=False), unpadded)
            self.assertEqual(base32_decode(padded), data)
            self.assertEqual(base32_decode(hex_padded, "hex"), data)
            self.assertEqual(base32_decode(unpadded, padding=False), data)
        for text, hex_out in BASE32_CASE_INSENSITIVE:
            self.assertEqual(base32_decode(text), bytes.fromhex(hex_out))
        for text, padding in BASE32_INVALID:
            with self.assertRaises(ValueError, msg=text):
                base32_decode(text, padding=padding)
        with self.assertRaises(ValueError):
            base32_encode(b"x", "base32hex")

    def test_base58(self):
        for hex_in, text in BASE58:
            self.assertEqual(base58_encode(bytes.fromhex(hex_in)), text)
            self.assertEqual(base58_decode(text), bytes.fromhex(hex_in))
        for text in BASE58_INVALID:
            with self.assertRaises(ValueError, msg=text):
                base58_decode(text)

    def test_base64url(self):
        for hex_in, text in BASE64URL:
            self.assertEqual(base64url_encode(bytes.fromhex(hex_in)), text)
            self.assertEqual(base64url_decode(text), bytes.fromhex(hex_in))
        for text in BASE64URL_INVALID:
            with self.assertRaises(ValueError, msg=text):
                base64url_decode(text)


if __name__ == "__main__":
    unittest.main()
