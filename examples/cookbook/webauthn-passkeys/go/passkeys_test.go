// SPDX-License-Identifier: Apache-2.0

package passkeys

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/go-webauthn/webauthn/webauthn"
)

type fixture struct {
	RPID, Origin, UserID, CredentialID, CredentialPublicKeyCose string
	RegistrationChallenge, AuthenticationChallenge              string
	RegistrationResponse, AuthenticationResponse                json.RawMessage
	ExpectedSignCountAfterAuthentication                        uint32
}

func load(t *testing.T) (fixture, *RP, *Account) {
	t.Helper()
	raw, err := os.ReadFile("../fixtures/passkey-es256-none.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx fixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	rp, err := New(fx.RPID, "Example", []string{fx.Origin})
	if err != nil {
		t.Fatal(err)
	}
	uid, _ := base64.RawURLEncoding.DecodeString(fx.UserID)
	return fx, rp, &Account{ID: uid, Name: "alice@example.com"}
}

func b64(s string) []byte { b, _ := base64.RawURLEncoding.DecodeString(s); return b }

func TestConfigValidation(t *testing.T) {
	if _, err := New("", "Example", []string{"https://example.com"}); err == nil {
		t.Fatal("expected error for empty RP ID")
	}
	if _, err := New("example.com", "Example", nil); err == nil {
		t.Fatal("expected error for missing origins")
	}
	if _, err := New("https://example.com/", "Example", []string{"https://example.com"}); err == nil {
		t.Fatal("expected error for an RP ID that is not a domain")
	}
}

func TestOptions(t *testing.T) {
	_, rp, acct := load(t)
	c1, s1, err := rp.RegistrationOptions(acct)
	if err != nil {
		t.Fatal(err)
	}
	_, s2, _ := rp.RegistrationOptions(acct)
	if c1.Response.RelyingParty.ID != "example.com" || s1.Challenge == s2.Challenge || len(b64(s1.Challenge)) < 16 {
		t.Fatalf("bad options %+v", c1.Response)
	}
	if c1.Response.AuthenticatorSelection.UserVerification != "required" || s1.UserVerification != "required" {
		t.Fatal("user verification not required")
	}
	a, s3, err := rp.AuthenticationOptions()
	if err != nil || a.Response.RelyingPartyID != "example.com" || len(a.Response.AllowedCredentials) != 0 || s3.Challenge == "" {
		t.Fatalf("bad assertion options: %v", err)
	}
}

func TestRecordedCeremony(t *testing.T) {
	fx, rp, acct := load(t)
	_, session, _ := rp.RegistrationOptions(acct)
	session.Challenge = fx.RegistrationChallenge // the recorded response answers this challenge
	cred, err := rp.VerifyRegistration(acct, *session, fx.RegistrationResponse)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(cred.ID, b64(fx.CredentialID)) || !bytes.Equal(cred.PublicKey, b64(fx.CredentialPublicKeyCose)) || cred.Authenticator.SignCount != 0 {
		t.Fatalf("unexpected credential %+v", cred)
	}
	acct.Credentials = append(acct.Credentials, *cred)

	_, login, _ := rp.AuthenticationOptions()
	login.Challenge = fx.AuthenticationChallenge
	lookup := func(rawID, handle []byte) (*Account, error) {
		if bytes.Equal(handle, acct.ID) {
			return acct, nil
		}
		return nil, errors.New("unknown user")
	}
	got, updated, err := rp.VerifyAuthentication(lookup, *login, fx.AuthenticationResponse)
	if err != nil {
		t.Fatal(err)
	}
	if got != acct || updated.Authenticator.SignCount != fx.ExpectedSignCountAfterAuthentication {
		t.Fatalf("sign count %d", updated.Authenticator.SignCount)
	}
}

func TestRejections(t *testing.T) {
	fx, rp, acct := load(t)
	_, session, _ := rp.RegistrationOptions(acct)
	if _, err := rp.VerifyRegistration(acct, *session, fx.RegistrationResponse); err == nil {
		t.Fatal("accepted response for a different challenge")
	}
	evil, _ := New("example.com", "Example", []string{"https://evil.example"})
	session.Challenge = fx.RegistrationChallenge
	if _, err := evil.VerifyRegistration(acct, *session, fx.RegistrationResponse); err == nil {
		t.Fatal("accepted wrong origin")
	}
	cred, err := rp.VerifyRegistration(acct, *session, fx.RegistrationResponse)
	if err != nil {
		t.Fatal(err)
	}
	cred.Authenticator.SignCount = 5
	acct.Credentials = []webauthn.Credential{*cred}
	lookup := func(_, _ []byte) (*Account, error) { return acct, nil }
	_, login, _ := rp.AuthenticationOptions()
	if _, _, err := rp.VerifyAuthentication(lookup, *login, fx.AuthenticationResponse); err == nil {
		t.Fatal("accepted wrong challenge")
	}
	login.Challenge = fx.AuthenticationChallenge
	if _, _, err := rp.VerifyAuthentication(lookup, *login, fx.AuthenticationResponse); !errors.Is(err, ErrPossibleClone) {
		t.Fatalf("expected clone rejection, got %v", err)
	}
}
