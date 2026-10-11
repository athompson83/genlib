# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from pii_mask import PiiError, mask_card, mask_email, mask_middle, mask_phone, redact

EMAIL = [
    ['jane.doe@example.com', 'j*******@example.com'],
    ['a@b.co', 'a***@b.co'],
    ['ab@x.io', 'a***@x.io'],
    ['émile@ex.fr', 'é****@ex.fr'],
]
PHONE = [
    ['+1 (415) 555-0123', '+1 (***) ***-0123'],
    ['+44 20 7946 0958', '+44 ** **** 0958'],
    ['0612345678', '******5678'],
    ['555-0123-99', '***-**23-99'],
]
CARD = [
    ['4111 1111 1111 1111', '**** **** **** 1111'],
    ['4111-1111-1111-1111', '****-****-****-1111'],
    ['378282246310005', '***********0005'],
    ['6011000990139424', '************9424'],
]
MIDDLE = [
    ['secret-token', 2, 2, 'se********en'],
    ['abc', 1, 1, 'a*c'],
    ['ab', 1, 1, '**'],
    ['password', 0, 0, '********'],
    ['héllo', 1, 0, 'h****'],
]
REDACT = [
    ['contact jane@example.com today', 'contact j***@example.com today'],
    ['card 4111 1111 1111 1111 exp', 'card **** **** **** 1111 exp'],
    ['order 1234 5678 9012 3456 ok', 'order 1234 5678 9012 3456 ok'],
    ['two a@b.io, c.d@e.org', 'two a***@b.io, c***@e.org'],
    ['id 4111111111111111x', 'id ************1111x'],
]
INVALID_EMAIL = [
    'nope',
    'a@b@c',
    '@x.com',
    'x@',
]
INVALID_PHONE = [
    '123',
    '+1 55',
]
INVALID_CARD = [
    '4111',
    '4111 1111 1111 1111 1111 1',
    '4111a1111111111',
]


class PiiMaskTest(unittest.TestCase):
    def test_masks(self):
        for text, expected in EMAIL:
            self.assertEqual(mask_email(text), expected, text)
        for text, expected in PHONE:
            self.assertEqual(mask_phone(text), expected, text)
        for text, expected in CARD:
            self.assertEqual(mask_card(text), expected, text)
        for text, start, end, expected in MIDDLE:
            self.assertEqual(mask_middle(text, start, end), expected, text)

    def test_redact(self):
        for text, expected in REDACT:
            self.assertEqual(redact(text), expected, text)
        self.assertEqual(redact("a@b.io 4111111111111111", ("email",)), "a***@b.io 4111111111111111")

    def test_invalid(self):
        for fn, cases in ((mask_email, INVALID_EMAIL), (mask_phone, INVALID_PHONE), (mask_card, INVALID_CARD)):
            for text in cases:
                with self.assertRaises(PiiError, msg=text):
                    fn(text)
        for args in (("x", -1, 1), ("x", 1, 1, "**")):
            with self.assertRaises(PiiError):
                mask_middle(*args)
        with self.assertRaises(PiiError):
            redact("x", ("phone",))


if __name__ == "__main__":
    unittest.main()
