# SPDX-License-Identifier: Apache-2.0
import json
import pathlib
import unittest

from webauthn import base64url_to_bytes
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse

import passkeys

FIXTURE = json.loads((pathlib.Path(__file__).parent.parent / "fixtures" / "passkey-es256-none.json").read_text())
RP = passkeys.RelyingParty(rp_id=FIXTURE["rpId"], rp_name="Example", origins=[FIXTURE["origin"]])
USER_ID = base64url_to_bytes(FIXTURE["userId"])


class PasskeyTest(unittest.TestCase):
    def test_registration_options(self):
        options_json, challenge = passkeys.registration_options(RP, USER_ID, "alice@example.com")
        opts = json.loads(options_json)
        self.assertEqual(opts["rp"]["id"], "example.com")
        self.assertEqual(opts["authenticatorSelection"]["residentKey"], "required")
        self.assertEqual(opts["authenticatorSelection"]["userVerification"], "required")
        self.assertGreaterEqual(len(challenge), 16)
        self.assertEqual(base64url_to_bytes(opts["challenge"]), challenge)
        cred = passkeys.StoredCredential(b"\x01" * 16, b"", 0, USER_ID, ["internal", "not-a-transport"])
        excluded = json.loads(passkeys.registration_options(RP, USER_ID, "alice@example.com", [cred])[0])
        self.assertEqual(excluded["excludeCredentials"][0]["transports"], ["internal"])
        _, other = passkeys.registration_options(RP, USER_ID, "alice@example.com")
        self.assertNotEqual(challenge, other)

    def test_authentication_options(self):
        options_json, challenge = passkeys.authentication_options(RP)
        opts = json.loads(options_json)
        self.assertEqual(opts["rpId"], "example.com")
        self.assertEqual(opts["allowCredentials"], [])
        self.assertEqual(base64url_to_bytes(opts["challenge"]), challenge)

    def test_recorded_ceremony(self):
        cred = passkeys.verify_registration(
            RP, FIXTURE["registrationResponse"], base64url_to_bytes(FIXTURE["registrationChallenge"]), USER_ID)
        self.assertEqual(cred.credential_id, base64url_to_bytes(FIXTURE["credentialId"]))
        self.assertEqual(cred.public_key, base64url_to_bytes(FIXTURE["credentialPublicKeyCose"]))
        self.assertEqual(cred.sign_count, 0)
        self.assertEqual(cred.transports, ["internal", "hybrid"])
        cred = passkeys.verify_authentication(
            RP, FIXTURE["authenticationResponse"], base64url_to_bytes(FIXTURE["authenticationChallenge"]), cred)
        self.assertEqual(cred.sign_count, FIXTURE["expectedSignCountAfterAuthentication"])

    def test_rejects_wrong_challenge_and_origin(self):
        with self.assertRaises(InvalidRegistrationResponse):
            passkeys.verify_registration(RP, FIXTURE["registrationResponse"], b"x" * 32, USER_ID)
        bad_rp = passkeys.RelyingParty("example.com", "Example", ["https://evil.example"])
        with self.assertRaises(InvalidRegistrationResponse):
            passkeys.verify_registration(
                bad_rp, FIXTURE["registrationResponse"], base64url_to_bytes(FIXTURE["registrationChallenge"]), USER_ID)
        cred = passkeys.verify_registration(
            RP, FIXTURE["registrationResponse"], base64url_to_bytes(FIXTURE["registrationChallenge"]), USER_ID)
        with self.assertRaises(InvalidAuthenticationResponse):
            passkeys.verify_authentication(RP, FIXTURE["authenticationResponse"], b"y" * 32, cred)

    def test_rejects_sign_count_regression(self):
        cred = passkeys.verify_registration(
            RP, FIXTURE["registrationResponse"], base64url_to_bytes(FIXTURE["registrationChallenge"]), USER_ID)
        cred.sign_count = 5  # stored counter ahead of the authenticator: possible clone
        with self.assertRaises(InvalidAuthenticationResponse):
            passkeys.verify_authentication(
                RP, FIXTURE["authenticationResponse"], base64url_to_bytes(FIXTURE["authenticationChallenge"]), cred)


if __name__ == "__main__":
    unittest.main()
