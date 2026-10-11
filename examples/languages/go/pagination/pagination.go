// SPDX-License-Identifier: Apache-2.0

// Package pagination computes page counts, offsets and the page-number window
// shown by a pager (the MUI usePagination layout: boundary pages, sibling
// pages around the current page and gaps between them).
package pagination

import "errors"

// ErrPage is returned for out-of-range pagination arguments.
var ErrPage = errors.New("pagination: invalid arguments")

// Gap marks an ellipsis in a PageWindow result; real pages start at 1.
const Gap = 0

// PageCount returns ceil(total/perPage), at least 1; perPage is 1..1000.
func PageCount(total, perPage int) (int, error) {
	if total < 0 || perPage < 1 || perPage > 1000 {
		return 0, ErrPage
	}
	n := (total + perPage - 1) / perPage
	if n < 1 {
		n = 1
	}
	return n, nil
}

// PageOffset returns the zero-based item offset of a 1-based page.
func PageOffset(page, perPage int) (int, error) {
	if page < 1 || perPage < 1 || perPage > 1000 {
		return 0, ErrPage
	}
	return (page - 1) * perPage, nil
}

func span(a, b int) []int {
	var out []int
	for i := a; i <= b; i++ {
		out = append(out, i)
	}
	return out
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// PageWindow returns the pages to show for current of total pages, using
// Gap (0) for each ellipsis; siblings is 0..5 and boundaries 1..5.
func PageWindow(current, total, siblings, boundaries int) ([]int, error) {
	if total < 1 || current < 1 || current > total || siblings < 0 || siblings > 5 || boundaries < 1 || boundaries > 5 {
		return nil, ErrPage
	}
	start := span(1, minInt(boundaries, total))
	end := span(maxInt(total-boundaries+1, boundaries+1), total)
	sStart := maxInt(minInt(current-siblings, total-boundaries-siblings*2-1), boundaries+2)
	endLimit := total - 1
	if len(end) > 0 {
		endLimit = end[0] - 2
	}
	sEnd := minInt(maxInt(current+siblings, boundaries+siblings*2+2), endLimit)
	items := append([]int(nil), start...)
	if sStart > boundaries+2 {
		items = append(items, Gap)
	} else if boundaries+1 < total-boundaries {
		items = append(items, boundaries+1)
	}
	items = append(items, span(sStart, sEnd)...)
	if sEnd < total-boundaries-1 {
		items = append(items, Gap)
	} else if total-boundaries > boundaries {
		items = append(items, total-boundaries)
	}
	items = append(items, end...)
	seen := map[int]bool{}
	out := []int{}
	for _, x := range items {
		if x == Gap || !seen[x] {
			out = append(out, x)
		}
		if x != Gap {
			seen[x] = true
		}
	}
	return out, nil
}
