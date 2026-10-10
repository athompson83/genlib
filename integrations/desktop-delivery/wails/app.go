// SPDX-License-Identifier: Apache-2.0
package main

import (
	"errors"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const maxTextBytes = 256 * 1024

type TextSelection struct {
	Name     string `json:"name"`
	Contents string `json:"contents"`
}
type SessionStatus struct {
	Present bool `json:"present"`
}
type UpdateStatus struct {
	State   string `json:"state"`
	Version string `json:"version,omitempty"`
}

// Only these capabilities are bound to the renderer. Native implementations keep
// paths, credential service/account, update URLs and signing keys private.
type NativeCapabilities interface {
	PickText() (*TextSelection, error)
	SaveSession(string) error
	HasSession() (bool, error)
	ClearSession() error
	CheckUpdate() (UpdateStatus, error)
	DownloadUpdate() (UpdateStatus, error)
	RestartUpdate() (UpdateStatus, error)
}
type App struct{ native NativeCapabilities }

func (a *App) NormalizeTitle(value string) (string, error) {
	title := strings.TrimSpace(value)
	if utf8.RuneCountInString(title) < 1 || utf8.RuneCountInString(title) > 200 {
		return "", errors.New("title must contain 1 to 200 characters")
	}
	return title, nil
}
func validateToken(value string) error {
	if value == "" || len(value) > 2048 || !utf8.ValidString(value) || strings.ContainsAny(value, "\r\n\x00") {
		return errors.New("a single-line token of at most 2048 UTF-8 bytes is required")
	}
	return nil
}
func decodeText(name string, data []byte) (*TextSelection, error) {
	ext := strings.ToLower(filepath.Ext(name))
	if len(name) > 200 || name == "" || strings.ContainsAny(name, "/\\\x00") || (ext != ".txt" && ext != ".md" && ext != ".json") {
		return nil, errors.New("unsupported text file")
	}
	if len(data) > maxTextBytes || !utf8.Valid(data) || strings.ContainsRune(string(data), '\x00') {
		return nil, errors.New("invalid UTF-8 text or file exceeds 256 KiB")
	}
	return &TextSelection{Name: name, Contents: string(data)}, nil
}
func (a *App) PickText() (*TextSelection, error) {
	if a.native == nil {
		return nil, errors.New("native host unavailable")
	}
	result, err := a.native.PickText()
	if err != nil {
		return nil, errors.New("text selection failed")
	}
	return result, nil
}
func (a *App) SaveSession(value string) (SessionStatus, error) {
	if err := validateToken(value); err != nil {
		return SessionStatus{}, err
	}
	if a.native == nil {
		return SessionStatus{}, errors.New("native host unavailable")
	}
	if err := a.native.SaveSession(value); err != nil {
		return SessionStatus{}, errors.New("OS secure storage is unavailable")
	}
	return SessionStatus{Present: true}, nil
}
func (a *App) SessionStatus() (SessionStatus, error) {
	if a.native == nil {
		return SessionStatus{}, errors.New("native host unavailable")
	}
	present, err := a.native.HasSession()
	if err != nil {
		return SessionStatus{}, errors.New("OS secure storage is unavailable")
	}
	return SessionStatus{Present: present}, nil
}
func (a *App) ClearSession() (SessionStatus, error) {
	if a.native == nil {
		return SessionStatus{}, errors.New("native host unavailable")
	}
	if err := a.native.ClearSession(); err != nil {
		return SessionStatus{}, errors.New("OS secure storage is unavailable")
	}
	return SessionStatus{}, nil
}
func (a *App) CheckUpdate() (UpdateStatus, error) {
	if a.native == nil {
		return UpdateStatus{}, errors.New("native host unavailable")
	}
	return a.native.CheckUpdate()
}
func (a *App) DownloadUpdate() (UpdateStatus, error) {
	if a.native == nil {
		return UpdateStatus{}, errors.New("native host unavailable")
	}
	return a.native.DownloadUpdate()
}
func (a *App) RestartUpdate() (UpdateStatus, error) {
	if a.native == nil {
		return UpdateStatus{}, errors.New("native host unavailable")
	}
	return a.native.RestartUpdate()
}
