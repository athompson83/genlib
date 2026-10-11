// SPDX-License-Identifier: Apache-2.0
package inventory

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"

	"connectrpc.com/connect"
	inventoryv1 "dev.genlib/inventory-connect/generated/genlib/inventory/v1"
	"dev.genlib/inventory-connect/generated/genlib/inventory/v1/inventoryv1connect"
)

const (
	RequestMaxBytes  = 64 * 1024
	ResponseMaxBytes = 128 * 1024
)

type Authorize func(context.Context, http.Header) error

// NewHandler implements the generated service. The mandatory authorization gate
// runs before decoding a message; the application still owns HTTP/TLS deployment,
// identity, per-user policy, timeouts and persistence.
func NewHandler(repository Repository, authorize Authorize) (http.Handler, error) {
	if repository == nil || authorize == nil {
		return nil, errors.New("repository and authorization callback are required")
	}
	path, handler := inventoryv1connect.NewInventoryServiceHandler(
		&service{repository: repository},
		connect.WithReadMaxBytes(RequestMaxBytes),
		connect.WithSendMaxBytes(ResponseMaxBytes),
		connect.WithRequestGate(func(ctx context.Context, _ connect.Spec, _ connect.Peer, headers http.Header) (context.Context, error) {
			if err := authorize(ctx, headers); err != nil {
				return ctx, rpcError(err)
			}
			return ctx, nil
		}),
	)
	mux := http.NewServeMux()
	mux.Handle(path, handler)
	return mux, nil
}

// FixtureAuthorization is only for local fixtures. Real applications inject
// their own session validation and authorization callback into NewHandler.
func FixtureAuthorization(expectedToken string) Authorize {
	return func(ctx context.Context, headers http.Header) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if expectedToken == "" || subtle.ConstantTimeCompare([]byte(headers.Get("Authorization")), []byte("Bearer "+expectedToken)) != 1 {
			return connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
		}
		return nil
	}
}

type service struct{ repository Repository }

func (s *service) CreateItem(ctx context.Context, request *connect.Request[inventoryv1.CreateItemRequest]) (*connect.Response[inventoryv1.CreateItemResponse], error) {
	title, err := NormalizeTitle(request.Msg.Title)
	if err != nil {
		return nil, rpcError(err)
	}
	item, err := s.repository.Create(ctx, title)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(&inventoryv1.CreateItemResponse{Item: protoItem(item)}), nil
}

func (s *service) GetItem(ctx context.Context, request *connect.Request[inventoryv1.GetItemRequest]) (*connect.Response[inventoryv1.GetItemResponse], error) {
	item, err := s.repository.Get(ctx, request.Msg.Id)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(&inventoryv1.GetItemResponse{Item: protoItem(item)}), nil
}

func (s *service) ListItems(ctx context.Context, request *connect.Request[inventoryv1.ListItemsRequest]) (*connect.Response[inventoryv1.ListItemsResponse], error) {
	cursor, pageSize := request.Msg.Cursor, request.Msg.PageSize
	if pageSize == 0 {
		pageSize = 20
	}
	if err := validatePagination(cursor, pageSize); err != nil {
		return nil, rpcError(err)
	}
	page, err := s.repository.List(ctx, cursor, pageSize)
	if err != nil {
		return nil, rpcError(err)
	}
	items := make([]*inventoryv1.Item, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, protoItem(item))
	}
	return connect.NewResponse(&inventoryv1.ListItemsResponse{Items: items, NextCursor: page.NextCursor}), nil
}

func protoItem(item Item) *inventoryv1.Item {
	return &inventoryv1.Item{Id: item.ID, Title: item.Title, Completed: item.Completed}
}

func rpcError(err error) error {
	var rpc *connect.Error
	if errors.As(err, &rpc) {
		return rpc
	}
	switch {
	case errors.Is(err, context.Canceled):
		return connect.NewError(connect.CodeCanceled, context.Canceled)
	case errors.Is(err, context.DeadlineExceeded):
		return connect.NewError(connect.CodeDeadlineExceeded, context.DeadlineExceeded)
	case errors.Is(err, ErrNotFound):
		return connect.NewError(connect.CodeNotFound, ErrNotFound)
	case errors.Is(err, ErrCapacity):
		return connect.NewError(connect.CodeResourceExhausted, ErrCapacity)
	case errors.Is(err, ErrInvalidTitle):
		return connect.NewError(connect.CodeInvalidArgument, ErrInvalidTitle)
	case errors.Is(err, ErrInvalidPagination):
		return connect.NewError(connect.CodeInvalidArgument, ErrInvalidPagination)
	default:
		// Database and authorization internals must not become public RPC messages.
		return connect.NewError(connect.CodeInternal, errors.New("inventory operation failed"))
	}
}
