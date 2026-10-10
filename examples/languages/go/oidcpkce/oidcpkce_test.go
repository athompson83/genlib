// SPDX-License-Identifier: Apache-2.0

package oidcpkce

import (
	"errors"
	"strings"
	"testing"
)

const rfcChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

func TestCodeChallengeRFC7636(t *testing.T) {
	if got := CodeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"); got != rfcChallenge {
		t.Fatalf("got %q", got)
	}
}

func baseRequest(endpoint string) AuthRequest {
	return AuthRequest{
		AuthorizationEndpoint: endpoint, ClientID: "app 1", RedirectURI: "https://app.example.com/cb",
		Scope: []string{"openid", "email"}, State: "s1", Nonce: "n1", CodeChallenge: rfcChallenge,
	}
}

func TestBuildAuthorizationURL(t *testing.T) {
	got, err := BuildAuthorizationURL(baseRequest("https://id.example.com/authorize"))
	want := "https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256"
	if err != nil || got != want {
		t.Fatalf("got %q err %v", got, err)
	}
	if _, err := BuildAuthorizationURL(baseRequest("http://id.example.com/authorize")); err == nil {
		t.Fatal("accepted non-https endpoint")
	}
	if _, err := BuildAuthorizationURL(baseRequest("http://localhost:8080/authorize")); err != nil {
		t.Fatalf("rejected localhost: %v", err)
	}
	r := baseRequest("https://id.example.com/authorize?tenant=a")
	r.Scope = []string{"openid email"}
	r.ExtraParams = []Param{{"prompt", "login"}}
	got, err = BuildAuthorizationURL(r)
	if err != nil || !strings.HasPrefix(got, "https://id.example.com/authorize?tenant=a&response_type=code&") || !strings.HasSuffix(got, "&code_challenge_method=S256&prompt=login") || !strings.Contains(got, "scope=openid%20email") {
		t.Fatalf("got %q err %v", got, err)
	}
	r.Scope = []string{"email"}
	if _, err := BuildAuthorizationURL(r); err == nil {
		t.Fatal("accepted scope without openid")
	}
}

func TestParseCallback(t *testing.T) {
	code, err := ParseCallback("https://app.example.com/cb?code=abc&state=s1", "s1")
	if err != nil || code != "abc" {
		t.Fatalf("got %q err %v", code, err)
	}
	if _, err := ParseCallback("https://app.example.com/cb?code=abc&state=s1", "s2"); !errors.Is(err, ErrStateMismatch) || err.Error() != "state_mismatch" {
		t.Fatalf("want state_mismatch, got %v", err)
	}
	_, err = ParseCallback("https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", "s1")
	var ae *AuthorizationError
	if !errors.As(err, &ae) || ae.Code != "access_denied" || ae.Description != "User denied" {
		t.Fatalf("got %v", err)
	}
	if _, err := ParseCallback("https://app.example.com/cb?state=s1", "s1"); !errors.Is(err, ErrMissingCode) {
		t.Fatalf("want missing code, got %v", err)
	}
}

func TestTokenRequestBody(t *testing.T) {
	got, err := TokenRequestBody(TokenRequest{Code: "c d", RedirectURI: "https://app.example.com/cb", ClientID: "app", CodeVerifier: "v"})
	want := "grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v"
	if err != nil || got != want {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestGenerateCodeVerifier(t *testing.T) {
	v, err := GenerateCodeVerifier(64)
	if err != nil || len(v) != 64 {
		t.Fatalf("len %d err %v", len(v), err)
	}
	for _, c := range v {
		if !strings.ContainsRune(unreserved, c) {
			t.Fatalf("invalid char %q", c)
		}
	}
	for _, n := range []int{42, 129} {
		if _, err := GenerateCodeVerifier(n); err == nil {
			t.Fatalf("accepted length %d", n)
		}
	}
	tok, err := RandomToken(0)
	if err != nil || len(tok) != 43 || strings.ContainsAny(tok, "+/=") {
		t.Fatalf("token %q err %v", tok, err)
	}
}
