# SPDX-License-Identifier: Apache-2.0
"""Local-only test: self-signed IdP cert; signed Response built in-process with python3-saml's signer."""
import base64
import datetime as dt
import re
import unittest
import uuid
import zlib
from urllib.parse import parse_qs, urlparse

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from onelogin.saml2.utils import OneLogin_Saml2_Utils

from saml_sp import SamlError, SpConfig, login_redirect, process_acs

ACS, SP, IDP = "https://sp.example.test/saml/acs", "https://sp.example.test/metadata", "https://idp.example.test/metadata"


def make_idp():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test IdP")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(hours=1))
            .not_valid_after(now + dt.timedelta(days=1)).sign(key, hashes.SHA256()))
    key_pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    return key_pem, cert.public_bytes(serialization.Encoding.PEM).decode()


def iso(sec):
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=sec)).strftime("%Y-%m-%dT%H:%M:%SZ")


def response(key_pem, cert_pem, irt, audience=SP, recipient=ACS, destination=ACS, not_on_or_after=None, name_id="alice@example.test"):
    noa = not_on_or_after or iso(300)
    aid = "_a" + uuid.uuid4().hex
    assertion = (
        f'<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{aid}" Version="2.0" IssueInstant="{iso(0)}">'
        f"<saml:Issuer>{IDP}</saml:Issuer><saml:Subject>"
        f'<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">{name_id}</saml:NameID>'
        f'<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="{noa}" Recipient="{recipient}" InResponseTo="{irt}"/></saml:SubjectConfirmation></saml:Subject>'
        f'<saml:Conditions NotBefore="{iso(-60)}" NotOnOrAfter="{noa}"><saml:AudienceRestriction><saml:Audience>{audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>'
        f'<saml:AuthnStatement AuthnInstant="{iso(0)}" SessionIndex="{aid}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>'
        "</saml:Assertion>")
    signed = OneLogin_Saml2_Utils.add_sign(assertion, key_pem, cert_pem)
    signed = signed.decode() if isinstance(signed, bytes) else signed
    signed = re.sub(r"^<\?xml[^>]*\?>\s*", "", signed)
    xml = (f'<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r{uuid.uuid4().hex}" Version="2.0" IssueInstant="{iso(0)}" Destination="{destination}" InResponseTo="{irt}">'
           f'<saml:Issuer>{IDP}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>'
           f"{signed}</samlp:Response>")
    return base64.b64encode(xml.encode()).decode()


class SamlTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key, cls.cert = make_idp()
        cls.other_key, cls.other_cert = make_idp()
        cls.cfg = SpConfig(SP, ACS, IDP, "https://idp.example.test/sso", cls.cert)
        cls.session = {}

    def login(self):
        url, rid = login_redirect(self.cfg, "rs-1")
        self.assertTrue(url.startswith("https://idp.example.test/sso?"))
        req = zlib.decompress(base64.b64decode(parse_qs(urlparse(url).query)["SAMLRequest"][0]), -15).decode()
        self.assertIn("AuthnRequest", req)
        self.assertIn(f'AssertionConsumerServiceURL="{ACS}"', req)
        self.assertIn(f'ID="{rid}"', req)
        self.session["rid"] = rid
        return rid

    def acs(self, resp):
        return process_acs(self.cfg, resp, self.session.pop("rid", None))

    def test_valid_and_replay(self):
        rid = self.login()
        resp = response(self.key, self.cert, rid)
        self.assertEqual(self.acs(resp)["name_id"], "alice@example.test")
        with self.assertRaises(SamlError):  # request ID consumed
            self.acs(resp)

    def test_rejections(self):
        cases = {
            "audience": (dict(audience="https://other-sp"), "audience"),
            "recipient": (dict(recipient="https://evil/acs"), "SubjectConfirmation"),
            "destination": (dict(destination="https://evil/acs"), "received at"),
            "expired": (dict(not_on_or_after=iso(-600)), "expired"),
        }
        for name, (kw, needle) in cases.items():
            with self.subTest(name), self.assertRaisesRegex(SamlError, f"(?i){needle}"):
                rid = self.login()
                self.acs(response(self.key, self.cert, rid, **kw))
        with self.subTest("untrusted signer"), self.assertRaisesRegex(SamlError, "(?i)signature"):
            rid = self.login()
            self.acs(response(self.other_key, self.other_cert, rid))
        with self.subTest("tampered"), self.assertRaisesRegex(SamlError, "(?i)signature|digest|reference"):
            rid = self.login()
            raw = base64.b64decode(response(self.key, self.cert, rid)).decode().replace("alice@", "admin@")
            self.acs(base64.b64encode(raw.encode()).decode())
        with self.subTest("wrong InResponseTo"), self.assertRaisesRegex(SamlError, "(?i)InResponseTo"):
            self.login()
            self.acs(response(self.key, self.cert, "_other"))


if __name__ == "__main__":
    unittest.main()
