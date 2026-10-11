// SPDX-License-Identifier: Apache-2.0
// Package conformance runs the same repository-owned cases as the TypeScript
// client tests. It is a fixture helper, not part of the service implementation.
package conformance

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"connectrpc.com/connect"
	inventoryv1 "dev.genlib/inventory-connect/generated/genlib/inventory/v1"
	"dev.genlib/inventory-connect/generated/genlib/inventory/v1/inventoryv1connect"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

type Fixture struct {
	Version int    `json:"version"`
	Token   string `json:"token"`
	Create  []struct {
		Title         string `json:"title"`
		ExpectedTitle string `json:"expectedTitle"`
	} `json:"create"`
	Pages []struct {
		Cursor     int32 `json:"cursor"`
		PageSize   int32 `json:"pageSize"`
		Indices    []int `json:"indices"`
		NextCursor int32 `json:"nextCursor"`
	} `json:"pages"`
	Errors []struct {
		Name    string          `json:"name"`
		Method  string          `json:"method"`
		Token   *string         `json:"token,omitempty"`
		Request json.RawMessage `json:"request"`
		Code    string          `json:"code"`
	} `json:"errors"`
}

type Result struct {
	Created int `json:"created"`
	Pages   int `json:"pages"`
	Errors  int `json:"errors"`
}

type ClientFactory func(token string) (inventoryv1connect.InventoryServiceClient, error)

func Load(path string) (Fixture, error) {
	file, err := os.Open(path)
	if err != nil {
		return Fixture{}, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
	decoder.DisallowUnknownFields()
	var fixture Fixture
	if err := decoder.Decode(&fixture); err != nil {
		return Fixture{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return Fixture{}, fmt.Errorf("expected one conformance fixture JSON document")
	}
	if fixture.Version != 1 || fixture.Token == "" || len(fixture.Create) == 0 || len(fixture.Pages) == 0 || len(fixture.Errors) == 0 {
		return Fixture{}, fmt.Errorf("unsupported or incomplete conformance fixture")
	}
	return fixture, nil
}

// Run requires an empty fixture repository. Every request uses generated Go
// request/response types and the generated Connect client, including errors.
func Run(ctx context.Context, clients ClientFactory, fixture Fixture) (Result, error) {
	client, err := clients(fixture.Token)
	if err != nil {
		return Result{}, err
	}
	initial, err := client.ListItems(ctx, connect.NewRequest(&inventoryv1.ListItemsRequest{}))
	if err != nil || len(initial.Msg.GetItems()) != 0 || initial.Msg.GetNextCursor() != 0 {
		return Result{}, fmt.Errorf("expected an empty fixture repository: %v", err)
	}
	items := make([]*inventoryv1.Item, 0, len(fixture.Create))
	ids := make(map[string]bool)
	for index, example := range fixture.Create {
		created, err := client.CreateItem(ctx, connect.NewRequest(&inventoryv1.CreateItemRequest{Title: example.Title}))
		if err != nil {
			return Result{}, fmt.Errorf("create %d: %w", index, err)
		}
		item := created.Msg.GetItem()
		if item.GetId() == "" || ids[item.GetId()] || item.GetTitle() != example.ExpectedTitle || item.GetCompleted() {
			return Result{}, fmt.Errorf("create %d returned an unexpected item", index)
		}
		ids[item.Id] = true
		items = append(items, item)
		fetched, err := client.GetItem(ctx, connect.NewRequest(&inventoryv1.GetItemRequest{Id: item.Id}))
		if err != nil || !proto.Equal(item, fetched.Msg.GetItem()) {
			return Result{}, fmt.Errorf("get %d did not round-trip the created item: %v", index, err)
		}
	}
	for index, example := range fixture.Pages {
		page, err := client.ListItems(ctx, connect.NewRequest(&inventoryv1.ListItemsRequest{Cursor: example.Cursor, PageSize: example.PageSize}))
		if err != nil {
			return Result{}, fmt.Errorf("page %d: %w", index, err)
		}
		if len(page.Msg.Items) != len(example.Indices) || page.Msg.NextCursor != example.NextCursor {
			return Result{}, fmt.Errorf("page %d returned unexpected pagination", index)
		}
		for position, itemIndex := range example.Indices {
			if itemIndex < 0 || itemIndex >= len(items) || !proto.Equal(page.Msg.Items[position], items[itemIndex]) {
				return Result{}, fmt.Errorf("page %d returned unexpected item order", index)
			}
		}
	}
	for _, example := range fixture.Errors {
		token := fixture.Token
		if example.Token != nil {
			token = *example.Token
		}
		errorClient, err := clients(token)
		if err != nil {
			return Result{}, err
		}
		var rpcErr error
		switch example.Method {
		case "createItem":
			request := &inventoryv1.CreateItemRequest{}
			if err := protojson.Unmarshal(example.Request, request); err != nil {
				return Result{}, err
			}
			_, rpcErr = errorClient.CreateItem(ctx, connect.NewRequest(request))
		case "getItem":
			request := &inventoryv1.GetItemRequest{}
			if err := protojson.Unmarshal(example.Request, request); err != nil {
				return Result{}, err
			}
			_, rpcErr = errorClient.GetItem(ctx, connect.NewRequest(request))
		case "listItems":
			request := &inventoryv1.ListItemsRequest{}
			if err := protojson.Unmarshal(example.Request, request); err != nil {
				return Result{}, err
			}
			_, rpcErr = errorClient.ListItems(ctx, connect.NewRequest(request))
		default:
			return Result{}, fmt.Errorf("unknown fixture method %q", example.Method)
		}
		if rpcErr == nil || connect.CodeOf(rpcErr).String() != example.Code {
			return Result{}, fmt.Errorf("%s: expected %s, received %v", example.Name, example.Code, rpcErr)
		}
	}
	final, err := client.ListItems(ctx, connect.NewRequest(&inventoryv1.ListItemsRequest{PageSize: 100}))
	if err != nil || len(final.Msg.GetItems()) != len(items) {
		return Result{}, fmt.Errorf("rejected requests changed fixture storage: %v", err)
	}
	for index, item := range final.Msg.Items {
		if !proto.Equal(item, items[index]) {
			return Result{}, fmt.Errorf("rejected requests changed fixture item %d", index)
		}
	}
	return Result{Created: len(items), Pages: len(fixture.Pages), Errors: len(fixture.Errors)}, nil
}
