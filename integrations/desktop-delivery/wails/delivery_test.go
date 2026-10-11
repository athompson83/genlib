// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	selfupdate "github.com/creativeprojects/go-selfupdate"
	"gopkg.in/yaml.v3"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestTrustedUpdateURLs(t *testing.T) {
	for _, value := range []string{"http://example.invalid/", "https://user:pass@example.invalid/", "https://example.invalid/?key=x", "https://example.invalid/#frag"} {
		if _, err := parseFeed(value); err == nil {
			t.Fatal("untrusted feed accepted")
		}
	}
	base, _ := parseFeed("https://updates.example.invalid/app/")
	source := trustedSource{base: base}
	for _, value := range []string{"https://other.invalid/app/release", "https://updates.example.invalid/outside/release", "http://updates.example.invalid/app/release"} {
		if source.trusted(value) {
			t.Fatal("untrusted artifact accepted")
		}
	}
	if _, err := readBounded(strings.NewReader("oversized"), 3); err == nil {
		t.Fatal("size limit ignored")
	}
}
func TestSignedUpdateHasSeparateCheckDownloadAndInstall(t *testing.T) {
	if runtime.GOOS != "linux" && runtime.GOOS != "windows" {
		t.Skip("single-executable delivery profile")
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pub, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	sign := func(data []byte) []byte {
		sum := sha256.Sum256(data)
		signature, err := ecdsa.SignASN1(rand.Reader, key, sum[:])
		if err != nil {
			t.Fatal(err)
		}
		return signature
	}
	payload := []byte("verified replacement fixture; never executed")
	name := "genlib-inventory_" + runtime.GOOS + "_" + runtime.GOARCH
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	files := map[string][]byte{}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, ok := files[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(data)
	}))
	defer server.Close()
	manifest := selfupdate.HttpManifest{LastReleaseID: 1, LastAssetID: 2, Releases: []*selfupdate.HttpRelease{{ID: 1, TagName: "v0.2.0", Name: "0.2.0", PublishedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Assets: []*selfupdate.HttpAsset{{ID: 1, Name: name, URL: server.URL + "/" + name, Size: len(payload)}, {ID: 2, Name: name + ".sig", URL: server.URL + "/" + name + ".sig", Size: 72}}}}}
	metadata, err := yaml.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	files["/manifest.yaml"] = metadata
	files["/manifest.yaml.sig"] = sign(metadata)
	files["/"+name] = payload
	files["/"+name+".sig"] = sign(payload)
	session, err := newDelivery(server.URL+"/", string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pub})))
	if err != nil {
		t.Fatal(err)
	}
	session.source.client = server.Client()
	session.source.client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	target := filepath.Join(t.TempDir(), "genlib-inventory")
	if runtime.GOOS == "windows" {
		target += ".exe"
	}
	if err = os.WriteFile(target, []byte("old fixture"), 0700); err != nil {
		t.Fatal(err)
	}
	session.executable = target
	if _, err = session.install(); err == nil {
		t.Fatal("install before download accepted")
	}
	if _, err = session.download(context.Background()); err == nil {
		t.Fatal("download without check accepted")
	}
	status, err := session.check(context.Background())
	if err != nil || status.State != "available" {
		t.Fatalf("check: %#v %v", status, err)
	}
	status, err = session.download(context.Background())
	if err != nil || status.State != "ready" {
		t.Fatalf("download: %#v %v", status, err)
	}
	current, _ := os.ReadFile(target)
	if string(current) != "old fixture" {
		t.Fatal("download installed without final consent")
	}
	if _, err = session.check(context.Background()); err == nil {
		t.Fatal("recheck discarded staged update")
	}
	if _, err = session.install(); err != nil {
		t.Fatal(err)
	}
	current, _ = os.ReadFile(target)
	if string(current) != string(payload) {
		t.Fatal("verified fixture was not installed")
	}
	// A valid announcement with tampered executable bytes must never become ready.
	session.state = "idle"
	session.candidate = nil
	files["/"+name] = append(append([]byte{}, payload...), []byte("tampered")...)
	if _, err = session.check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err = session.download(context.Background()); err == nil {
		t.Fatal("tampered artifact became ready")
	}
	if _, err = session.install(); err == nil {
		t.Fatal("tampered artifact installed")
	}
	// An inflated version without a new metadata signature is rejected before selection.
	files["/manifest.yaml"] = []byte(strings.ReplaceAll(string(metadata), "0.2.0", "9.0.0"))
	if _, err = session.check(context.Background()); err == nil {
		t.Fatal("forged release version accepted")
	}
	// The test never launches the synthetic executable or changes the running test binary.
}
func TestTamperedMetadataAndArtifactFailBeforeInstall(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	validator := &selfupdate.ECDSAValidator{PublicKey: &key.PublicKey}
	original := []byte("release metadata or executable")
	hash := sha256.Sum256(original)
	signature, _ := ecdsa.SignASN1(rand.Reader, key, hash[:])
	if err := validator.Validate("fixture", original, signature); err != nil {
		t.Fatal(err)
	}
	if err := validator.Validate("fixture", append(original, []byte("tampered version")...), signature); err == nil {
		t.Fatal("tampering accepted")
	}
}
