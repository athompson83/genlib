// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	selfupdate "github.com/creativeprojects/go-selfupdate"
	applyupdate "github.com/creativeprojects/go-selfupdate/update"
	"gopkg.in/yaml.v3"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const maxUpdateBytes = 256 * 1024 * 1024

// Set by the local release build; renderer input cannot change it.
var releaseVersion = "0.1.0"
var releaseFeed = ""
var releasePublicKey = ""

type trustedSource struct {
	base      *url.URL
	client    *http.Client
	validator *selfupdate.ECDSAValidator
}

func parseFeed(value string) (*url.URL, error) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("trusted HTTPS feed required")
	}
	if !strings.HasSuffix(u.Path, "/") {
		u.Path += "/"
	}
	return u, nil
}
func (s *trustedSource) trusted(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.Host == s.base.Host && u.User == nil && u.RawQuery == "" && u.Fragment == "" && strings.HasPrefix(u.Path, s.base.Path)
}
func readBounded(reader io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("download exceeds configured limit")
	}
	return data, nil
}
func (s *trustedSource) fetch(ctx context.Context, value string, limit int64) ([]byte, error) {
	if !s.trusted(value) {
		return nil, errors.New("untrusted update URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, value, nil)
	if err != nil {
		return nil, err
	}
	response, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("update response rejected")
	}
	return readBounded(response.Body, limit)
}
func (s *trustedSource) ListReleases(ctx context.Context, _ selfupdate.Repository) ([]selfupdate.SourceRelease, error) {
	data, err := s.fetch(ctx, s.base.ResolveReference(&url.URL{Path: "manifest.yaml"}).String(), 1024*1024)
	if err != nil {
		return nil, err
	}
	signature, err := s.fetch(ctx, s.base.ResolveReference(&url.URL{Path: "manifest.yaml.sig"}).String(), 64*1024)
	if err != nil || s.validator == nil {
		return nil, errors.New("signed release manifest required")
	}
	if err = s.validator.Validate("manifest.yaml", data, signature); err != nil {
		return nil, err
	}
	var manifest selfupdate.HttpManifest
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err = decoder.Decode(&manifest); err != nil {
		return nil, err
	}
	if len(manifest.Releases) > 20 {
		return nil, errors.New("too many releases")
	}
	result := make([]selfupdate.SourceRelease, 0, len(manifest.Releases))
	for _, release := range manifest.Releases {
		if release == nil || len(release.Assets) > 20 {
			return nil, errors.New("invalid release manifest")
		}
		for _, asset := range release.Assets {
			if asset == nil || !s.trusted(asset.URL) || len(asset.Name) > 200 || strings.ContainsAny(asset.Name, "/\\") {
				return nil, errors.New("untrusted release asset")
			}
		}
		result = append(result, release)
	}
	return result, nil
}
func (s *trustedSource) DownloadReleaseAsset(ctx context.Context, release *selfupdate.Release, id int64) (io.ReadCloser, error) {
	if release == nil {
		return nil, errors.New("missing release")
	}
	value, limit := "", int64(maxUpdateBytes)
	if id == release.AssetID {
		value = release.AssetURL
	} else if id == release.ValidationAssetID {
		value = release.ValidationAssetURL
		limit = 64 * 1024
	} else {
		return nil, errors.New("unknown asset")
	}
	data, err := s.fetch(ctx, value, limit)
	if err != nil {
		return nil, err
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

type deliverySession struct {
	mu         sync.Mutex
	state      string
	source     *trustedSource
	updater    *selfupdate.Updater
	validator  *selfupdate.ECDSAValidator
	candidate  *selfupdate.Release
	staged     []byte
	executable string
}

func newDelivery(feed, keyPEM string) (*deliverySession, error) {
	// Modifying a signed macOS .app invalidates its bundle signature. Use the
	// separate signed/notarized .app distribution route on macOS, not this profile.
	if runtime.GOOS != "windows" && runtime.GOOS != "linux" {
		return nil, errors.New("single-executable updater supports Windows/Linux")
	}
	base, err := parseFeed(feed)
	if err != nil {
		return nil, err
	}
	block, rest := pem.Decode([]byte(keyPEM))
	if block == nil || len(bytes.TrimSpace(rest)) != 0 {
		return nil, errors.New("one trusted ECDSA public key required")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	public, ok := parsed.(*ecdsa.PublicKey)
	if !ok {
		return nil, errors.New("ECDSA public key required")
	}
	source := &trustedSource{base: base}
	source.client = &http.Client{Timeout: 60 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	validator := &selfupdate.ECDSAValidator{PublicKey: public}
	source.validator = validator
	updater, err := selfupdate.NewUpdater(selfupdate.Config{Source: source, Validator: validator, Prerelease: false, Draft: false})
	if err != nil {
		return nil, err
	}
	executable, err := selfupdate.ExecutablePath()
	if err != nil {
		return nil, err
	}
	return &deliverySession{state: "idle", source: source, updater: updater, validator: validator, executable: executable}, nil
}
func (s *deliverySession) status() UpdateStatus {
	v := ""
	if s.candidate != nil {
		v = s.candidate.Version()
	}
	return UpdateStatus{State: s.state, Version: v}
}
func (s *deliverySession) check(ctx context.Context) (UpdateStatus, error) {
	if !s.mu.TryLock() {
		return UpdateStatus{}, errors.New("update operation in progress")
	}
	defer s.mu.Unlock()
	if s.state == "ready" || s.state == "restarting" {
		return s.status(), errors.New("update already prepared")
	}
	s.state = "checking"
	s.candidate = nil
	s.staged = nil
	release, found, err := s.updater.DetectLatest(ctx, selfupdate.NewRepositorySlug("genlib", "inventory"))
	if err != nil {
		s.state = "failed"
		return s.status(), errors.New("update check failed")
	}
	if !found || release.LessOrEqual(releaseVersion) {
		s.state = "idle"
		return s.status(), nil
	}
	s.candidate = release
	s.state = "available"
	return s.status(), nil
}
func (s *deliverySession) download(ctx context.Context) (UpdateStatus, error) {
	if !s.mu.TryLock() {
		return UpdateStatus{}, errors.New("update operation in progress")
	}
	defer s.mu.Unlock()
	if s.state != "available" || s.candidate == nil {
		return s.status(), errors.New("check for an available update first")
	}
	s.state = "downloading"
	data, err := s.source.fetch(ctx, s.candidate.AssetURL, maxUpdateBytes)
	var signature []byte
	if err == nil {
		signature, err = s.source.fetch(ctx, s.candidate.ValidationAssetURL, 64*1024)
	}
	if err == nil {
		err = s.validator.Validate(s.candidate.AssetName, data, signature)
	}
	var binary io.Reader
	if err == nil {
		binary, err = selfupdate.DecompressCommand(bytes.NewReader(data), s.candidate.AssetName, filepath.Base(s.executable), runtime.GOOS, runtime.GOARCH)
	}
	if err == nil {
		s.staged, err = readBounded(binary, maxUpdateBytes)
	}
	if err != nil {
		s.state = "failed"
		s.staged = nil
		return s.status(), errors.New("update download or signature verification failed")
	}
	s.state = "ready"
	return s.status(), nil
}
func (s *deliverySession) install() (UpdateStatus, error) {
	if !s.mu.TryLock() {
		return UpdateStatus{}, errors.New("update operation in progress")
	}
	defer s.mu.Unlock()
	if s.state != "ready" || len(s.staged) == 0 {
		return s.status(), errors.New("no verified update is ready")
	}
	// Keep verified bytes in memory; no renderer path or editable staging file can
	// substitute the executable between download and the final consent click.
	if err := applyupdate.Apply(bytes.NewReader(s.staged), applyupdate.Options{TargetPath: s.executable}); err != nil {
		s.state = "failed"
		return s.status(), errors.New("verified update could not be installed")
	}
	s.staged = nil
	s.state = "restarting"
	return s.status(), nil
}
func configuredDelivery() *deliverySession {
	feed, key := releaseFeed, ""
	if releasePublicKey != "" {
		data, err := base64.StdEncoding.DecodeString(releasePublicKey)
		if err != nil {
			return nil
		}
		key = string(data)
	}
	if feed == "" {
		feed = os.Getenv("GENLIB_UPDATE_FEED")
	}
	if key == "" {
		key = os.Getenv("GENLIB_UPDATE_PUBLIC_KEY_PEM")
	}
	if feed == "" || key == "" {
		return nil
	}
	session, err := newDelivery(feed, key)
	if err != nil {
		return nil
	}
	return session
}
