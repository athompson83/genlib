// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"errors"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	keyring "github.com/zalando/go-keyring"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

const vaultService = "dev.genlib.inventory"
const vaultAccount = "fixture-session"

type desktopNative struct {
	ctx      context.Context
	vault    sync.Mutex
	picker   sync.Mutex
	delivery *deliverySession
}

func (n *desktopNative) PickText() (*TextSelection, error) {
	if !n.picker.TryLock() {
		return nil, errors.New("file selection already open")
	}
	defer n.picker.Unlock()
	path, err := wruntime.OpenFileDialog(n.ctx, wruntime.OpenDialogOptions{Title: "Choose a text fixture", Filters: []wruntime.FileFilter{{DisplayName: "Text fixtures", Pattern: "*.txt;*.md;*.json"}}})
	if err != nil || path == "" {
		return nil, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxTextBytes {
		return nil, errors.New("invalid text file")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxTextBytes+1))
	if err != nil {
		return nil, err
	}
	return decodeText(filepath.Base(path), data)
}
func (n *desktopNative) SaveSession(value string) error {
	n.vault.Lock()
	defer n.vault.Unlock()
	return keyring.Set(vaultService, vaultAccount, value)
}
func (n *desktopNative) HasSession() (bool, error) {
	n.vault.Lock()
	defer n.vault.Unlock()
	value, err := keyring.Get(vaultService, vaultAccount)
	if errors.Is(err, keyring.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err = validateToken(value); err != nil {
		return false, err
	}
	return true, nil
}
func (n *desktopNative) ClearSession() error {
	n.vault.Lock()
	defer n.vault.Unlock()
	err := keyring.Delete(vaultService, vaultAccount)
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}
func (n *desktopNative) CheckUpdate() (UpdateStatus, error) {
	if n.delivery == nil {
		return UpdateStatus{}, errors.New("trusted feed, public key and packaged host required")
	}
	return n.delivery.check(n.ctx)
}
func (n *desktopNative) DownloadUpdate() (UpdateStatus, error) {
	if n.delivery == nil {
		return UpdateStatus{}, errors.New("update profile not configured")
	}
	return n.delivery.download(n.ctx)
}
func (n *desktopNative) RestartUpdate() (UpdateStatus, error) {
	if n.delivery == nil {
		return UpdateStatus{}, errors.New("update profile not configured")
	}
	result, err := n.delivery.install()
	if err != nil {
		return result, err
	}
	// No renderer-supplied executable, arguments or environment. Start the verified
	// replacement, then quit the old process only after process creation succeeds.
	command := exec.Command(n.delivery.executable)
	if err = command.Start(); err != nil {
		return UpdateStatus{State: "failed"}, errors.New("updated application could not restart")
	}
	_ = command.Process.Release()
	wruntime.Quit(n.ctx)
	return result, nil
}
