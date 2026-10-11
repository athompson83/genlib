// SPDX-License-Identifier: Apache-2.0
package inventory_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"connectrpc.com/connect"
	inventory "dev.genlib/inventory-connect"
	inventoryv1 "dev.genlib/inventory-connect/generated/genlib/inventory/v1"
	"dev.genlib/inventory-connect/generated/genlib/inventory/v1/inventoryv1connect"
	"dev.genlib/inventory-connect/internal/conformance"
)

func serverFor(t *testing.T, repository inventory.Repository, token string) *httptest.Server {
	t.Helper()
	handler, err := inventory.NewHandler(repository, inventory.FixtureAuthorization(token))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server
}

func clientFor(t *testing.T, baseURL, token string) inventoryv1connect.InventoryServiceClient {
	t.Helper()
	client, err := inventory.NewClient(inventory.ClientOptions{
		BaseURL: baseURL, SessionToken: func(context.Context) (string, error) { return token, nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestGeneratedGoClientAndServerSharedConformance(t *testing.T) {
	fixture, err := conformance.Load("../tests/conformance.json")
	if err != nil {
		t.Fatal(err)
	}
	server := serverFor(t, inventory.NewMemoryRepository(), fixture.Token)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	result, err := conformance.Run(ctx, func(token string) (inventoryv1connect.InventoryServiceClient, error) {
		return clientFor(t, server.URL, token), nil
	}, fixture)
	if err != nil {
		t.Fatal(err)
	}
	if result.Created != len(fixture.Create) || result.Pages != len(fixture.Pages) || result.Errors != len(fixture.Errors) {
		t.Fatalf("not all shared cases ran: %+v", result)
	}
}

func TestAuthorizationPrecedesDecodeAndBodyLimit(t *testing.T) {
	repository := inventory.NewMemoryRepository()
	server := serverFor(t, repository, "test-token")
	for _, example := range []struct{ name, token, body, code string }{
		{"malformed unauthenticated message", "wrong", "{not-json", "unauthenticated"},
		{"oversized authorized message", "test-token", `{"title":"` + strings.Repeat("x", inventory.RequestMaxBytes) + `"}`, "resource_exhausted"},
	} {
		t.Run(example.name, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodPost, server.URL+inventoryv1connect.InventoryServiceCreateItemProcedure, strings.NewReader(example.body))
			if err != nil {
				t.Fatal(err)
			}
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Connect-Protocol-Version", "1")
			request.Header.Set("Authorization", "Bearer "+example.token)
			response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			var failure struct{ Code string }
			if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&failure); err != nil {
				t.Fatal(err)
			}
			if failure.Code != example.code {
				t.Fatalf("expected %s, got HTTP %d / %s", example.code, response.StatusCode, failure.Code)
			}
		})
	}
	page, err := repository.List(context.Background(), 0, 100)
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("rejected messages reached storage: %v", err)
	}
}

type failedRepository struct{ inventory.Repository }

func (failedRepository) Create(context.Context, string) (inventory.Item, error) {
	return inventory.Item{}, errors.New("private database connection details")
}

func TestRepositoryErrorsAreTypedWithoutLeakingInternals(t *testing.T) {
	server := serverFor(t, failedRepository{inventory.NewMemoryRepository()}, "test-token")
	client := clientFor(t, server.URL, "test-token")
	_, err := client.CreateItem(context.Background(), connect.NewRequest(&inventoryv1.CreateItemRequest{Title: "One"}))
	if connect.CodeOf(err) != connect.CodeInternal || strings.Contains(err.Error(), "private database") {
		t.Fatalf("unexpected public repository error: %v", err)
	}
}

type rejectingTransport struct{ calls atomic.Int32 }

func (transport *rejectingTransport) Do(*http.Request) (*http.Response, error) {
	transport.calls.Add(1)
	return nil, errors.New("unexpected transport call")
}

func TestSessionFailureCancellationAndDeadlinePreventTransport(t *testing.T) {
	transport := &rejectingTransport{}
	for _, example := range []struct {
		name    string
		token   func(context.Context) (string, error)
		code    connect.Code
		cancel  bool
		timeout time.Duration
	}{
		{"session failure", func(context.Context) (string, error) { return "", errors.New("private credential source") }, connect.CodeUnauthenticated, false, time.Second},
		{"already canceled", func(context.Context) (string, error) { t.Error("canceled callback ran"); return "token", nil }, connect.CodeCanceled, true, time.Second},
		{"callback deadline", func(ctx context.Context) (string, error) { <-ctx.Done(); return "", ctx.Err() }, connect.CodeDeadlineExceeded, false, 20 * time.Millisecond},
	} {
		t.Run(example.name, func(t *testing.T) {
			client, err := inventory.NewClient(inventory.ClientOptions{BaseURL: "http://127.0.0.1:1", SessionToken: example.token, HTTPClient: transport, Timeout: example.timeout})
			if err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if example.cancel {
				cancel()
			}
			_, err = client.ListItems(ctx, connect.NewRequest(&inventoryv1.ListItemsRequest{}))
			if connect.CodeOf(err) != example.code || strings.Contains(err.Error(), "private credential") {
				t.Fatalf("expected %s, received %v", example.code, err)
			}
		})
	}
	if transport.calls.Load() != 0 {
		t.Fatal("failed authentication or cancellation reached the HTTP transport")
	}
}

func TestDefaultClientRejectsCredentialBearingRedirect(t *testing.T) {
	var redirected atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { redirected.Add(1) }))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, target.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()
	client := clientFor(t, origin.URL, "public-test-token")
	_, err := client.ListItems(context.Background(), connect.NewRequest(&inventoryv1.ListItemsRequest{}))
	if err == nil || redirected.Load() != 0 {
		t.Fatal("the default client must reject redirects instead of forwarding a session token")
	}
}

func TestMemoryRepositoryConcurrentCancellationAndCopies(t *testing.T) {
	repository := inventory.NewMemoryRepository()
	ctx := context.Background()
	var group sync.WaitGroup
	for range 20 {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := repository.Create(ctx, "item"); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()
	page, err := repository.List(ctx, 0, 100)
	if err != nil || len(page.Items) != 20 {
		t.Fatalf("concurrent inserts were lost: %v", err)
	}
	first := page.Items[0]
	page.Items[0].Title = "changed by caller"
	fetched, err := repository.Get(ctx, first.ID)
	if err != nil || fetched != first {
		t.Fatal("a returned slice allowed the caller to mutate stored data")
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := repository.Create(canceled, "not inserted"); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation: %v", err)
	}
	if _, err := inventory.NormalizeTitle(strings.Repeat("🧭", 200)); err != nil {
		t.Fatalf("the title limit counts Unicode code points: %v", err)
	}
	if title, err := inventory.NormalizeTitle("\u0085item\u0085"); err != nil || title != "\u0085item\u0085" {
		t.Fatal("Go trimming must preserve characters that ECMAScript trim preserves")
	}
	for range 980 {
		if _, err := repository.Create(ctx, "item"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := repository.Create(ctx, "over capacity"); !errors.Is(err, inventory.ErrCapacity) {
		t.Fatalf("expected bounded fixture capacity: %v", err)
	}
}
