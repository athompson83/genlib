// SPDX-License-Identifier: Apache-2.0
// The fixture command serves loopback only or checks a loopback fixture. Tokens
// come from the public shared test cases; it never reads application credentials.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	inventory "dev.genlib/inventory-connect"
	"dev.genlib/inventory-connect/generated/genlib/inventory/v1/inventoryv1connect"
	"dev.genlib/inventory-connect/internal/conformance"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 2 || (os.Args[1] != "serve" && os.Args[1] != "check") {
		return errors.New("usage: inventory-fixture serve|check --fixture tests/conformance.json [--base-url http://127.0.0.1:port]")
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ContinueOnError)
	fixturePath := flags.String("fixture", "tests/conformance.json", "shared conformance JSON path")
	baseURL := flags.String("base-url", "", "loopback fixture URL for check")
	if err := flags.Parse(os.Args[2:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	fixture, err := conformance.Load(*fixturePath)
	if err != nil {
		return err
	}
	if os.Args[1] == "serve" {
		if *baseURL != "" {
			return errors.New("serve chooses its own ephemeral loopback port")
		}
		return serve(fixture)
	}
	base, err := url.Parse(*baseURL)
	if err != nil || base.Scheme != "http" || (base.Hostname() != "127.0.0.1" && base.Hostname() != "::1") || base.Port() == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" || (base.Path != "" && base.Path != "/") {
		return errors.New("check requires an explicit HTTP loopback fixture URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	result, err := conformance.Run(ctx, func(token string) (inventoryv1connect.InventoryServiceClient, error) {
		return inventory.NewClient(inventory.ClientOptions{
			BaseURL: *baseURL,
			SessionToken: func(context.Context) (string, error) {
				return token, nil
			},
		})
	}, fixture)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func serve(fixture conformance.Fixture) error {
	handler, err := inventory.NewHandler(inventory.NewMemoryRepository(), inventory.FixtureAuthorization(fixture.Token))
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second,
		IdleTimeout: 15 * time.Second, MaxHeaderBytes: 8 * 1024,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if server.Shutdown(shutdown) != nil {
			_ = server.Close()
		}
	}()
	if err := json.NewEncoder(os.Stdout).Encode(map[string]string{"baseUrl": "http://" + listener.Addr().String()}); err != nil {
		stop()
		<-shutdownDone
		return err
	}
	err = server.Serve(listener)
	stop()
	<-shutdownDone
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
