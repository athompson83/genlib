// SPDX-License-Identifier: Apache-2.0
package inventory

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"
)

var (
	ErrNotFound          = errors.New("item not found")
	ErrCapacity          = errors.New("fixture item limit reached")
	ErrInvalidTitle      = errors.New("title must contain 1 to 200 characters")
	ErrInvalidPagination = errors.New("invalid pagination")
)

type Item struct {
	ID        string
	Title     string
	Completed bool
}

type Page struct {
	Items      []Item
	NextCursor int32
}

// Repository is the application-owned persistence boundary. Implementations must
// respect cancellation and return ErrNotFound for a missing item. MemoryRepository
// is a bounded, process-local fixture, independent of the separate sqlc profile.
type Repository interface {
	Create(context.Context, string) (Item, error)
	Get(context.Context, string) (Item, error)
	List(context.Context, int32, int32) (Page, error)
}

// NormalizeTitle matches ECMAScript String.trim and counts Unicode code points,
// preserving the existing TypeScript contract across the two generated bindings.
func NormalizeTitle(raw string) (string, error) {
	title := strings.TrimFunc(raw, func(r rune) bool {
		return (unicode.IsSpace(r) && r != '\u0085') || r == '\ufeff'
	})
	if title == "" || !utf8.ValidString(title) || utf8.RuneCountInString(title) > 200 {
		return "", ErrInvalidTitle
	}
	return title, nil
}

func validatePagination(cursor, pageSize int32) error {
	if cursor < 0 || pageSize < 1 || pageSize > 100 {
		return ErrInvalidPagination
	}
	return nil
}

type MemoryRepository struct {
	mu    sync.RWMutex
	items map[string]Item
	order []string
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{items: make(map[string]Item)}
}

func (r *MemoryRepository) Create(ctx context.Context, rawTitle string) (Item, error) {
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}
	title, err := NormalizeTitle(rawTitle)
	if err != nil {
		return Item{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}
	if len(r.items) >= 1000 {
		return Item{}, ErrCapacity
	}
	item := Item{ID: rand.Text(), Title: title}
	r.items[item.ID] = item
	r.order = append(r.order, item.ID)
	return item, nil
}

func (r *MemoryRepository) Get(ctx context.Context, id string) (Item, error) {
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}
	item, ok := r.items[id]
	if !ok {
		return Item{}, ErrNotFound
	}
	return item, nil
}

func (r *MemoryRepository) List(ctx context.Context, cursor, pageSize int32) (Page, error) {
	if err := ctx.Err(); err != nil {
		return Page{}, err
	}
	if err := validatePagination(cursor, pageSize); err != nil {
		return Page{}, err
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	if err := ctx.Err(); err != nil {
		return Page{}, err
	}
	// Clamp before adding the page size, including for a maximum int32 cursor.
	start := min(int(cursor), len(r.order))
	end := min(start+int(pageSize), len(r.order))
	page := Page{Items: make([]Item, 0, end-start)}
	for _, id := range r.order[start:end] {
		page.Items = append(page.Items, r.items[id])
	}
	if end < len(r.order) {
		page.NextCursor = int32(end)
	}
	return page, nil
}
