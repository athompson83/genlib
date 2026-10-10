// SPDX-License-Identifier: Apache-2.0
package inventory

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"connectrpc.com/connect"
	"dev.genlib/inventory-connect/generated/genlib/inventory/v1/inventoryv1connect"
)

type ClientOptions struct {
	BaseURL      string
	SessionToken func(context.Context) (string, error)
	HTTPClient   connect.HTTPClient
	// Timeout defaults to five seconds. Session callbacks must honor its context.
	Timeout time.Duration
}

// NewClient wraps the generated client without replacing its protobuf codec or
// error handling. BaseURL is application configuration, never an untrusted URL.
// Injected HTTP clients must honor context cancellation and prevent credential-
// bearing redirects. The default client rejects redirects; this adapter adds no
// retry policy.
func NewClient(options ClientOptions) (inventoryv1connect.InventoryServiceClient, error) {
	base, err := url.Parse(options.BaseURL)
	if err != nil || base.Host == "" || (base.Scheme != "http" && base.Scheme != "https") || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("base URL must be an absolute HTTP(S) service URL without credentials, query or fragment")
	}
	if options.SessionToken == nil || options.Timeout < 0 {
		return nil, errors.New("session callback is required and timeout must not be negative")
	}
	if options.Timeout == 0 {
		options.Timeout = 5 * time.Second
	}
	if options.HTTPClient == nil {
		options.HTTPClient = &http.Client{
			Timeout: options.Timeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	authentication := connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
			ctx, cancel := context.WithTimeout(ctx, options.Timeout)
			defer cancel()
			if err := ctx.Err(); err != nil {
				return nil, rpcError(err)
			}
			token, err := options.SessionToken(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return nil, rpcError(ctx.Err())
				}
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("session token unavailable"))
			}
			if token != "" {
				request.Header().Set("Authorization", "Bearer "+token)
			} else {
				request.Header().Del("Authorization")
			}
			return next(ctx, request)
		}
	})
	return inventoryv1connect.NewInventoryServiceClient(
		options.HTTPClient,
		strings.TrimRight(options.BaseURL, "/"),
		connect.WithReadMaxBytes(ResponseMaxBytes),
		connect.WithSendMaxBytes(RequestMaxBytes),
		connect.WithInterceptors(authentication),
	), nil
}
