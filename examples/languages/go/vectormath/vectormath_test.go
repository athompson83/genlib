// SPDX-License-Identifier: Apache-2.0

package vectormath

import (
	"math"
	"reflect"
	"testing"
)

func near(a, b float64) bool { return math.Abs(a-b) <= 1e-9 }

func TestPairs(t *testing.T) {
	for _, c := range []struct {
		a, b     []float64
		dot, cos float64
	}{
		{[]float64{1.0, 2.0, 3.0}, []float64{4.0, 5.0, 6.0}, 32.0, 0.9746318461970762},
		{[]float64{1.0, 0.0}, []float64{0.0, 1.0}, 0.0, 0.0},
		{[]float64{1.0, 1.0}, []float64{-1.0, -1.0}, -2.0, -0.9999999999999998},
		{[]float64{0.0, 0.0}, []float64{1.0, 2.0}, 0.0, 0.0},
		{[]float64{3.0, 4.0}, []float64{3.0, 4.0}, 25.0, 1.0},
		{[]float64{0.5, -1.5, 2.0}, []float64{2.0, 0.25, -1.0}, -1.375, -0.23969749850222494},
	} {
		if got, err := Dot(c.a, c.b); err != nil || !near(got, c.dot) {
			t.Errorf("Dot(%v, %v) = %v, %v", c.a, c.b, got, err)
		}
		if got, err := Cosine(c.a, c.b); err != nil || !near(got, c.cos) {
			t.Errorf("Cosine(%v, %v) = %v, %v", c.a, c.b, got, err)
		}
	}
}

func TestNorm(t *testing.T) {
	if got, err := Norm([]float64{3.0, 4.0}); err != nil || !near(got, 5.0) {
		t.Errorf("Norm = %v, %v", got, err)
	}
	if got, err := Norm([]float64{0.0, 0.0, 0.0}); err != nil || !near(got, 0.0) {
		t.Errorf("Norm = %v, %v", got, err)
	}
	if got, err := Norm([]float64{1.0, 1.0, 1.0, 1.0}); err != nil || !near(got, 2.0) {
		t.Errorf("Norm = %v, %v", got, err)
	}
	if got, err := Norm([]float64{-2.5}); err != nil || !near(got, 2.5) {
		t.Errorf("Norm = %v, %v", got, err)
	}
	if got, err := Normalize([]float64{3.0, 4.0}); err != nil || len(got) != 2 || !near(got[0], 0.6) || !near(got[1], 0.8) {
		t.Errorf("Normalize = %v, %v", got, err)
	}
	if got, err := Normalize([]float64{0.0, 5.0}); err != nil || len(got) != 2 || !near(got[0], 0.0) || !near(got[1], 1.0) {
		t.Errorf("Normalize = %v, %v", got, err)
	}
	if got, err := Normalize([]float64{1.0, 1.0, 1.0, 1.0}); err != nil || len(got) != 4 || !near(got[0], 0.5) || !near(got[1], 0.5) || !near(got[2], 0.5) || !near(got[3], 0.5) {
		t.Errorf("Normalize = %v, %v", got, err)
	}
}

func TestTopK(t *testing.T) {
	for _, c := range []struct {
		q    []float64
		vs   [][]float64
		k    int
		want []Scored
	}{
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 0, []Scored{}},
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 1, []Scored{{0, 1.0}}},
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 3, []Scored{{0, 1.0}, {1, 0.9949371890224981}, {3, 0.7071067811865476}}},
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 10, []Scored{{0, 1.0}, {1, 0.9949371890224981}, {3, 0.7071067811865476}, {2, 0.0}, {4, -1.0}}},
		{[]float64{0.2, 0.5, 0.1}, [][]float64{[]float64{0.1, 0.4, 0.2}, []float64{0.9, 0.1, 0.0}, []float64{0.2, 0.5, 0.1}, []float64{0.0, 0.0, 1.0}, []float64{0.3, 0.3, 0.3}, []float64{0.21, 0.49, 0.12}}, 3, []Scored{{2, 1.0}, {5, 0.9990003934498585}, {0, 0.956182887467515}}},
	} {
		got, err := TopK(c.q, c.vs, c.k)
		if err != nil || len(got) != len(c.want) {
			t.Fatalf("TopK k=%d = %v, %v", c.k, got, err)
		}
		for i := range got {
			if got[i].Index != c.want[i].Index || !near(got[i].Score, c.want[i].Score) {
				t.Errorf("TopK k=%d [%d] = %v, want %v", c.k, i, got[i], c.want[i])
			}
		}
	}
}

func TestMMR(t *testing.T) {
	for _, c := range []struct {
		q      []float64
		vs     [][]float64
		k      int
		lambda float64
		want   []int
	}{
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 3, 0.5, []int{0, 1, 4}},
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 3, 1.0, []int{0, 1, 3}},
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 3, 0.0, []int{0, 4, 2}},
		{[]float64{1.0, 0.0}, [][]float64{[]float64{1.0, 0.0}, []float64{0.99, 0.1}, []float64{0.0, 1.0}, []float64{0.7, 0.7}, []float64{-1.0, 0.0}}, 5, 0.7, []int{0, 1, 3, 2, 4}},
		{[]float64{0.2, 0.5, 0.1}, [][]float64{[]float64{0.1, 0.4, 0.2}, []float64{0.9, 0.1, 0.0}, []float64{0.2, 0.5, 0.1}, []float64{0.0, 0.0, 1.0}, []float64{0.3, 0.3, 0.3}, []float64{0.21, 0.49, 0.12}}, 3, 0.5, []int{2, 0, 1}},
		{[]float64{0.2, 0.5, 0.1}, [][]float64{[]float64{0.1, 0.4, 0.2}, []float64{0.9, 0.1, 0.0}, []float64{0.2, 0.5, 0.1}, []float64{0.0, 0.0, 1.0}, []float64{0.3, 0.3, 0.3}, []float64{0.21, 0.49, 0.12}}, 4, 0.3, []int{2, 3, 1, 4}},
	} {
		if got, err := MMR(c.q, c.vs, c.k, c.lambda); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("MMR(k=%d, lambda=%v) = %v, %v, want %v", c.k, c.lambda, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	// length mismatch: cosine([1,2],[1,2,3]); empty: dot([],[]); normalize([0,0]); top_k k=-1; mmr lambda=1.5
	if _, err := Cosine([]float64{1, 2}, []float64{1, 2, 3}); err == nil {
		t.Error("length mismatch should fail")
	}
	if _, err := Dot([]float64{}, []float64{}); err == nil {
		t.Error("empty vectors should fail")
	}
	if _, err := Normalize([]float64{0, 0}); err == nil {
		t.Error("zero vector should fail")
	}
	if _, err := TopK([]float64{1}, [][]float64{{1}}, -1); err == nil {
		t.Error("k=-1 should fail")
	}
	if _, err := MMR([]float64{1}, [][]float64{{1}}, 1, 1.5); err == nil {
		t.Error("lambda=1.5 should fail")
	}
}
