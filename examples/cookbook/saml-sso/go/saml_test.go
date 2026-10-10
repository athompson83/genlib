// SPDX-License-Identifier: Apache-2.0
package samlsp

import (
	"bytes"
	"compress/flate"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"fmt"
	"io"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"
)

const (
	acs   = "https://sp.example.test/saml/acs"
	spID  = "https://sp.example.test/metadata"
	idpID = "https://idp.example.test/metadata"
)

type idpKey struct {
	key  *rsa.PrivateKey
	cert *x509.Certificate
}

func (k idpKey) GetKeyPair() (*rsa.PrivateKey, []byte, error) { return k.key, k.cert.Raw, nil }

func newIdP(t *testing.T) idpKey {
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Test IdP"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tpl, tpl, &k.PublicKey, k)
	if err != nil {
		t.Fatal(err)
	}
	c, _ := x509.ParseCertificate(der)
	return idpKey{k, c}
}

type opts struct {
	irt, audience, recipient, destination, nameID string
	notOnOrAfter                                  time.Time
}

func iso(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }

func buildSigned(t *testing.T, k idpKey, o opts) string {
	set := func(p *string, d string) {
		if *p == "" {
			*p = d
		}
	}
	set(&o.audience, spID)
	set(&o.recipient, acs)
	set(&o.destination, acs)
	set(&o.nameID, "alice@example.test")
	if o.notOnOrAfter.IsZero() {
		o.notOnOrAfter = time.Now().Add(5 * time.Minute)
	}
	now := time.Now()
	assertion := fmt.Sprintf(`<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a%d" Version="2.0" IssueInstant="%s"><saml:Issuer>%s</saml:Issuer>`+
		`<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">%s</saml:NameID>`+
		`<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="%s" Recipient="%s" InResponseTo="%s"/></saml:SubjectConfirmation></saml:Subject>`+
		`<saml:Conditions NotBefore="%s" NotOnOrAfter="%s"><saml:AudienceRestriction><saml:Audience>%s</saml:Audience></saml:AudienceRestriction></saml:Conditions>`+
		`<saml:AuthnStatement AuthnInstant="%s"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`,
		now.UnixNano(), iso(now), idpID, o.nameID, iso(o.notOnOrAfter), o.recipient, o.irt, iso(now.Add(-time.Minute)), iso(o.notOnOrAfter), o.audience, iso(now))
	doc := etree.NewDocument()
	if err := doc.ReadFromString(assertion); err != nil {
		t.Fatal(err)
	}
	ctx := dsig.NewDefaultSigningContext(k)
	ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
	if err := ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod); err != nil {
		t.Fatal(err)
	}
	signed, err := ctx.SignEnveloped(doc.Root())
	if err != nil {
		t.Fatal(err)
	}
	// schema order: Signature goes right after Issuer
	// (goxmldsig appends it last without setting the parent pointer, so detach by slicing.)
	sig := signed.Child[len(signed.Child)-1]
	signed.Child = signed.Child[:len(signed.Child)-1]
	signed.InsertChildAt(1, sig)

	resp := etree.NewDocument()
	_ = resp.ReadFromString(fmt.Sprintf(`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r%d" Version="2.0" IssueInstant="%s" Destination="%s" InResponseTo="%s"><saml:Issuer>%s</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status></samlp:Response>`,
		now.UnixNano(), iso(now), o.destination, o.irt, idpID))
	resp.Root().AddChild(signed)
	out, _ := resp.WriteToString()
	return base64.StdEncoding.EncodeToString([]byte(out))
}

func TestSAML(t *testing.T) {
	idp, other := newIdP(t), newIdP(t)
	sp, err := New(Config{SPEntityID: spID, ACSURL: acs, IDPEntityID: idpID, IDPSSOURL: "https://idp.example.test/sso", IDPCerts: []*x509.Certificate{idp.cert}})
	if err != nil {
		t.Fatal(err)
	}
	if md, err := sp.Metadata(); err != nil || !bytes.Contains(md, []byte("AssertionConsumerService")) {
		t.Fatalf("metadata: %v", err)
	}
	login := func() string {
		u, id, err := sp.LoginRedirect("rs-1")
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(u.String(), "https://idp.example.test/sso?") {
			t.Fatalf("bad redirect %s", u)
		}
		raw, _ := base64.StdEncoding.DecodeString(u.Query().Get("SAMLRequest"))
		xml, _ := io.ReadAll(flate.NewReader(bytes.NewReader(raw)))
		if !bytes.Contains(xml, []byte("AuthnRequest")) || !bytes.Contains(xml, []byte(`AssertionConsumerServiceURL="`+acs+`"`)) || !bytes.Contains(xml, []byte(id)) {
			t.Fatalf("unexpected AuthnRequest: %s", xml)
		}
		return id
	}

	id := login()
	a, err := sp.ParseACS(buildSigned(t, idp, opts{irt: id}), []string{id})
	if err != nil {
		t.Fatalf("valid response rejected: %v", err)
	}
	if a.Subject.NameID.Value != "alice@example.test" {
		t.Fatalf("name id %q", a.Subject.NameID.Value)
	}
	if _, err := sp.ParseACS(buildSigned(t, idp, opts{irt: id}), nil); err != ErrNoPendingRequest {
		t.Errorf("replay/unsolicited: %v", err)
	}

	cases := map[string]func(id string) string{
		"audience":    func(id string) string { return buildSigned(t, idp, opts{irt: id, audience: "https://other-sp"}) },
		"recipient":   func(id string) string { return buildSigned(t, idp, opts{irt: id, recipient: "https://evil/acs"}) },
		"destination": func(id string) string { return buildSigned(t, idp, opts{irt: id, destination: "https://evil/acs"}) },
		"expired": func(id string) string {
			return buildSigned(t, idp, opts{irt: id, notOnOrAfter: time.Now().Add(-10 * time.Minute)})
		},
		"untrusted":    func(id string) string { return buildSigned(t, other, opts{irt: id}) },
		"inResponseTo": func(id string) string { return buildSigned(t, idp, opts{irt: "_other"}) },
		"tampered": func(id string) string {
			raw, _ := base64.StdEncoding.DecodeString(buildSigned(t, idp, opts{irt: id}))
			return base64.StdEncoding.EncodeToString(bytes.Replace(raw, []byte("alice@"), []byte("admin@"), 1))
		},
	}
	for name, mk := range cases {
		id := login()
		if _, err := sp.ParseACS(mk(id), []string{id}); err == nil {
			t.Errorf("%s: expected rejection", name)
		} else {
			t.Logf("%s rejected: %v", name, err)
		}
	}
}
