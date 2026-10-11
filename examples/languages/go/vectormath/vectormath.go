// SPDX-License-Identifier: Apache-2.0

// Package vectormath provides vector math for embeddings: dot product, norm,
// cosine similarity, normalization, brute-force top-k search and maximal
// marginal relevance (MMR) re-ranking. Sums run plainly left to right.
package vectormath

import (
	"errors"
	"math"
	"sort"
)

func check(a, b []float64) error {
	if len(a) != len(b) {
		return errors.New("vectormath: vectors must have the same length")
	}
	if len(a) == 0 {
		return errors.New("vectormath: vectors must not be empty")
	}
	return nil
}

func dot(a, b []float64) float64 {
	s := 0.0
	for i := range a {
		s += a[i] * b[i]
	}
	return s
}

// Dot returns the dot product of two equal-length, non-empty vectors.
func Dot(a, b []float64) (float64, error) {
	if err := check(a, b); err != nil {
		return 0, err
	}
	return dot(a, b), nil
}

// Norm returns the Euclidean length of a non-empty vector.
func Norm(a []float64) (float64, error) {
	if len(a) == 0 {
		return 0, errors.New("vectormath: vectors must not be empty")
	}
	return math.Sqrt(dot(a, a)), nil
}

// Cosine returns the cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros.
func Cosine(a, b []float64) (float64, error) {
	if err := check(a, b); err != nil {
		return 0, err
	}
	na, nb := math.Sqrt(dot(a, a)), math.Sqrt(dot(b, b))
	if na == 0 || nb == 0 {
		return 0, nil
	}
	return math.Max(-1, math.Min(1, dot(a, b)/(na*nb))), nil
}

// Normalize returns the unit vector in the direction of a; a zero vector is an error.
func Normalize(a []float64) ([]float64, error) {
	n, err := Norm(a)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, errors.New("vectormath: cannot normalize a zero vector")
	}
	out := make([]float64, len(a))
	for i, x := range a {
		out[i] = x / n
	}
	return out, nil
}

// Scored is a vector index with its cosine similarity to the query.
type Scored struct {
	Index int
	Score float64
}

// TopK returns the k most cosine-similar vectors, best first; ties keep the lower index.
func TopK(query []float64, vectors [][]float64, k int) ([]Scored, error) {
	if k < 0 {
		return nil, errors.New("vectormath: k must be >= 0")
	}
	scored := make([]Scored, len(vectors))
	for i, v := range vectors {
		c, err := Cosine(query, v)
		if err != nil {
			return nil, err
		}
		scored[i] = Scored{i, c}
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].Score != scored[j].Score {
			return scored[i].Score > scored[j].Score
		}
		return scored[i].Index < scored[j].Index
	})
	if k < len(scored) {
		scored = scored[:k]
	}
	return scored, nil
}

// MMR picks up to k indices one by one maximizing lambda*cos(query, v) - (1-lambda)*max cos(v, picked); ties keep the lower index.
func MMR(query []float64, vectors [][]float64, k int, lambda float64) ([]int, error) {
	if k < 0 {
		return nil, errors.New("vectormath: k must be >= 0")
	}
	if !(lambda >= 0 && lambda <= 1) {
		return nil, errors.New("vectormath: lambda must be in [0, 1]")
	}
	rel := make([]float64, len(vectors))
	for i, v := range vectors {
		c, err := Cosine(query, v)
		if err != nil {
			return nil, err
		}
		rel[i] = c
	}
	want := k
	if len(vectors) < want {
		want = len(vectors)
	}
	picked := []int{}
	used := make([]bool, len(vectors))
	for len(picked) < want {
		best, bestScore := -1, 0.0
		for i := range vectors {
			if used[i] {
				continue
			}
			red := 0.0
			for n, j := range picked {
				c, err := Cosine(vectors[i], vectors[j])
				if err != nil {
					return nil, err
				}
				if n == 0 || c > red {
					red = c
				}
			}
			s := lambda*rel[i] - (1-lambda)*red
			if best < 0 || s > bestScore {
				best, bestScore = i, s
			}
		}
		used[best] = true
		picked = append(picked, best)
	}
	return picked, nil
}
