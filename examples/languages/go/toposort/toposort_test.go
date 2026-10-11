// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package toposort

import (
	"errors"
	"reflect"
	"testing"
)

func TestSort(t *testing.T) {
	for _, c := range []struct {
		nodes []string
		edges []Edge
		want  []string
	}{
		{[]string{"a", "b", "c", "d"}, []Edge{{"c", "a"}, {"a", "d"}}, []string{"b", "c", "a", "d"}},
		{[]string{"x"}, []Edge{}, []string{"x"}},
		{[]string{"a", "b", "c"}, []Edge{}, []string{"a", "b", "c"}},
		{[]string{"shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"}, []Edge{{"shirt", "tie"}, {"tie", "jacket"}, {"shirt", "belt"}, {"belt", "jacket"}, {"trousers", "belt"}, {"trousers", "shoes"}, {"socks", "shoes"}}, []string{"shirt", "tie", "trousers", "belt", "jacket", "socks", "shoes", "watch"}},
		{[]string{"a", "b"}, []Edge{{"a", "b"}, {"a", "b"}}, []string{"a", "b"}},
	} {
		if got, err := Sort(c.nodes, c.edges); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Sort(%q, %q) = %q, %v", c.nodes, c.edges, got, err)
		}
	}
}

func TestLevels(t *testing.T) {
	for _, c := range []struct {
		nodes []string
		edges []Edge
		want  [][]string
	}{
		{[]string{"a", "b", "c", "d"}, []Edge{{"c", "a"}, {"a", "d"}}, [][]string{[]string{"b", "c"}, []string{"a"}, []string{"d"}}},
		{[]string{"x"}, []Edge{}, [][]string{[]string{"x"}}},
		{[]string{"a", "b", "c"}, []Edge{}, [][]string{[]string{"a", "b", "c"}}},
		{[]string{"shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"}, []Edge{{"shirt", "tie"}, {"tie", "jacket"}, {"shirt", "belt"}, {"belt", "jacket"}, {"trousers", "belt"}, {"trousers", "shoes"}, {"socks", "shoes"}}, [][]string{[]string{"shirt", "trousers", "socks", "watch"}, []string{"tie", "belt", "shoes"}, []string{"jacket"}}},
		{[]string{"a", "b"}, []Edge{{"a", "b"}, {"a", "b"}}, [][]string{[]string{"a"}, []string{"b"}}},
	} {
		if got, err := Levels(c.nodes, c.edges); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Levels(%q, %q) = %q, %v", c.nodes, c.edges, got, err)
		}
	}
}

func TestCycle(t *testing.T) {
	for _, c := range []struct {
		nodes []string
		edges []Edge
		want  string
	}{
		{[]string{"a", "b", "c"}, []Edge{{"a", "b"}, {"b", "c"}, {"c", "b"}}, "cycle: b -> c -> b"},
		{[]string{"a"}, []Edge{{"a", "a"}}, "cycle: a -> a"},
		{[]string{"p", "q", "r", "s"}, []Edge{{"p", "q"}, {"q", "r"}, {"r", "p"}, {"r", "s"}}, "cycle: p -> q -> r -> p"},
		{[]string{"c", "a", "b"}, []Edge{{"a", "b"}, {"b", "a"}, {"a", "c"}}, "cycle: a -> b -> a"},
		{[]string{"z", "a", "b"}, []Edge{{"a", "z"}, {"a", "b"}, {"b", "a"}}, "cycle: a -> b -> a"},
		{[]string{"s", "x", "y", "d"}, []Edge{{"x", "d"}, {"x", "y"}, {"y", "x"}, {"d", "s"}}, "cycle: x -> y -> x"},
	} {
		_, err := Sort(c.nodes, c.edges)
		var ce *CycleError
		if !errors.As(err, &ce) || err.Error() != c.want {
			t.Errorf("Sort(%q, %q) error = %v, want %q", c.nodes, c.edges, err, c.want)
		}
		if _, err := Levels(c.nodes, c.edges); err == nil || err.Error() != c.want {
			t.Errorf("Levels(%q, %q) error = %v, want %q", c.nodes, c.edges, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, c := range []struct {
		nodes []string
		edges []Edge
	}{
		{[]string{"a"}, []Edge{{"a", "b"}}},
		{[]string{"a", "a"}, []Edge{}},
	} {
		if _, err := Sort(c.nodes, c.edges); !errors.Is(err, ErrInvalid) {
			t.Errorf("Sort(%q, %q) error = %v", c.nodes, c.edges, err)
		}
		if _, err := Levels(c.nodes, c.edges); !errors.Is(err, ErrInvalid) {
			t.Errorf("Levels(%q, %q) error = %v", c.nodes, c.edges, err)
		}
	}
}
