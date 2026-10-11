// SPDX-License-Identifier: Apache-2.0

// Package toposort orders nodes so that every edge [before, after] is respected,
// using Kahn's algorithm where the ready node earliest in the node list goes
// first. Levels groups nodes that can run in parallel. A cycle is reported as
// "cycle: a -> b -> a", found by walking from the first remaining node along its
// first remaining outgoing edge until a node repeats.
package toposort

import (
	"container/heap"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Edge is a [before, after] pair.
type Edge [2]string

// CycleError reports one cycle; Path starts and ends with the same node.
type CycleError struct {
	Path []string
}

func (e *CycleError) Error() string { return "cycle: " + strings.Join(e.Path, " -> ") }

// ErrInvalid is wrapped by duplicate-node and unknown-node errors.
var ErrInvalid = errors.New("toposort: invalid graph")

type graph struct {
	idx   map[string]int
	out   [][]int
	indeg []int
}

func build(nodes []string, edges []Edge) (*graph, error) {
	g := &graph{idx: map[string]int{}, out: make([][]int, len(nodes)), indeg: make([]int, len(nodes))}
	for i, n := range nodes {
		if _, dup := g.idx[n]; dup {
			return nil, fmt.Errorf("%w: duplicate node %q", ErrInvalid, n)
		}
		g.idx[n] = i
	}
	for _, e := range edges {
		a, okA := g.idx[e[0]]
		b, okB := g.idx[e[1]]
		if !okA || !okB {
			return nil, fmt.Errorf("%w: unknown node in edge %s -> %s", ErrInvalid, e[0], e[1])
		}
		g.out[a] = append(g.out[a], b)
		g.indeg[b]++
	}
	return g, nil
}

// cycle walks the remaining subgraph; nodes that cannot reach a cycle are pruned first so the walk never dead-ends.
func (g *graph) cycle(nodes []string, remaining []bool) error {
	for changed := true; changed; {
		changed = false
		for n := range nodes {
			if !remaining[n] {
				continue
			}
			live := false
			for _, b := range g.out[n] {
				if remaining[b] {
					live = true
					break
				}
			}
			if !live {
				remaining[n], changed = false, true
			}
		}
	}
	start := 0
	for !remaining[start] {
		start++
	}
	path, seen, cur := []int{start}, map[int]int{start: 0}, start
	for {
		next := -1
		for _, b := range g.out[cur] {
			if remaining[b] {
				next = b
				break
			}
		}
		if at, ok := seen[next]; ok {
			names := []string{}
			for _, n := range append(path[at:], next) {
				names = append(names, nodes[n])
			}
			return &CycleError{names}
		}
		seen[next] = len(path)
		path = append(path, next)
		cur = next
	}
}

type intHeap []int

func (h intHeap) Len() int            { return len(h) }
func (h intHeap) Less(i, j int) bool  { return h[i] < h[j] }
func (h intHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *intHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *intHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

// Sort returns the nodes in dependency order, breaking ties by position in nodes.
func Sort(nodes []string, edges []Edge) ([]string, error) {
	g, err := build(nodes, edges)
	if err != nil {
		return nil, err
	}
	h := &intHeap{}
	for i := range nodes {
		if g.indeg[i] == 0 {
			*h = append(*h, i)
		}
	}
	heap.Init(h)
	order := []string{}
	done := make([]bool, len(nodes))
	for h.Len() > 0 {
		n := heap.Pop(h).(int)
		order = append(order, nodes[n])
		done[n] = true
		for _, b := range g.out[n] {
			g.indeg[b]--
			if g.indeg[b] == 0 {
				heap.Push(h, b)
			}
		}
	}
	if len(order) < len(nodes) {
		remaining := make([]bool, len(nodes))
		for i := range remaining {
			remaining[i] = !done[i]
		}
		return nil, g.cycle(nodes, remaining)
	}
	return order, nil
}

// Levels groups nodes into parallel stages: each level holds the nodes whose prerequisites are all in earlier levels, in nodes order.
func Levels(nodes []string, edges []Edge) ([][]string, error) {
	g, err := build(nodes, edges)
	if err != nil {
		return nil, err
	}
	var level []int
	for i := range nodes {
		if g.indeg[i] == 0 {
			level = append(level, i)
		}
	}
	levels := [][]string{}
	done := 0
	for len(level) > 0 {
		names := make([]string, len(level))
		for k, n := range level {
			names[k] = nodes[n]
		}
		levels = append(levels, names)
		done += len(level)
		var next []int
		for _, n := range level {
			for _, b := range g.out[n] {
				g.indeg[b]--
				if g.indeg[b] == 0 {
					next = append(next, b)
				}
			}
		}
		sort.Ints(next)
		level = next
	}
	if done < len(nodes) {
		remaining := make([]bool, len(nodes))
		for i := range remaining {
			remaining[i] = g.indeg[i] > 0
		}
		return nil, g.cycle(nodes, remaining)
	}
	return levels, nil
}
