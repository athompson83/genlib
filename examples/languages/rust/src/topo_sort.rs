// SPDX-License-Identifier: Apache-2.0

//! Deterministic topological sort (Kahn's algorithm): among ready nodes the one
//! earliest in `nodes` goes first. `topo_levels` groups nodes that can run in
//! parallel. A cycle is reported as "cycle: a -> b -> a": remaining nodes with no
//! remaining outgoing edge are dropped (repeatedly), then the walk starts at the
//! first remaining node and follows its first remaining outgoing edge until a
//! node repeats.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::fmt;

/// A cycle (`message` is "cycle: a -> b -> a") or an invalid graph (duplicate or unknown node).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TopoError {
    pub cycle: bool,
    pub message: String,
}

impl fmt::Display for TopoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for TopoError {}

struct Graph {
    out: Vec<Vec<usize>>,
    indeg: Vec<usize>,
}

fn build<S: AsRef<str>>(nodes: &[S], edges: &[(S, S)]) -> Result<Graph, TopoError> {
    let invalid = |m: String| TopoError { cycle: false, message: m };
    let mut idx = HashMap::new();
    for (i, n) in nodes.iter().enumerate() {
        if idx.insert(n.as_ref(), i).is_some() {
            return Err(invalid(format!("duplicate node {}", n.as_ref())));
        }
    }
    let mut g = Graph { out: vec![Vec::new(); nodes.len()], indeg: vec![0; nodes.len()] };
    for (a, b) in edges {
        match (idx.get(a.as_ref()), idx.get(b.as_ref())) {
            (Some(&x), Some(&y)) => {
                g.out[x].push(y);
                g.indeg[y] += 1;
            }
            _ => return Err(invalid(format!("unknown node in edge {} -> {}", a.as_ref(), b.as_ref()))),
        }
    }
    Ok(g)
}

fn cycle<S: AsRef<str>>(nodes: &[S], g: &Graph, mut remaining: Vec<bool>) -> TopoError {
    let mut changed = true;
    while changed {
        changed = false;
        for n in 0..nodes.len() {
            if remaining[n] && !g.out[n].iter().any(|&b| remaining[b]) {
                remaining[n] = false;
                changed = true;
            }
        }
    }
    let start = remaining.iter().position(|&r| r).expect("a cycle remains");
    let mut path = vec![start];
    let mut seen = HashMap::from([(start, 0usize)]);
    let mut cur = start;
    loop {
        let next = *g.out[cur].iter().find(|&&b| remaining[b]).expect("every remaining node has an edge");
        if let Some(&at) = seen.get(&next) {
            let names: Vec<&str> = path[at..].iter().chain([next].iter()).map(|&n| nodes[n].as_ref()).collect();
            return TopoError { cycle: true, message: format!("cycle: {}", names.join(" -> ")) };
        }
        seen.insert(next, path.len());
        path.push(next);
        cur = next;
    }
}

/// Returns the nodes in dependency order, breaking ties by position in `nodes`; edges are (before, after).
pub fn topo_sort<S: AsRef<str>>(nodes: &[S], edges: &[(S, S)]) -> Result<Vec<String>, TopoError> {
    let mut g = build(nodes, edges)?;
    let mut heap: BinaryHeap<Reverse<usize>> = (0..nodes.len()).filter(|&i| g.indeg[i] == 0).map(Reverse).collect();
    let mut order = Vec::new();
    let mut done = vec![false; nodes.len()];
    while let Some(Reverse(n)) = heap.pop() {
        order.push(nodes[n].as_ref().to_string());
        done[n] = true;
        for k in 0..g.out[n].len() {
            let b = g.out[n][k];
            g.indeg[b] -= 1;
            if g.indeg[b] == 0 {
                heap.push(Reverse(b));
            }
        }
    }
    if order.len() < nodes.len() {
        return Err(cycle(nodes, &g, done.iter().map(|d| !d).collect()));
    }
    Ok(order)
}

/// Groups nodes into parallel stages: each level holds nodes whose prerequisites are all in earlier levels, in `nodes` order.
pub fn topo_levels<S: AsRef<str>>(nodes: &[S], edges: &[(S, S)]) -> Result<Vec<Vec<String>>, TopoError> {
    let mut g = build(nodes, edges)?;
    let mut level: Vec<usize> = (0..nodes.len()).filter(|&i| g.indeg[i] == 0).collect();
    let mut levels = Vec::new();
    let mut done = 0;
    while !level.is_empty() {
        levels.push(level.iter().map(|&n| nodes[n].as_ref().to_string()).collect());
        done += level.len();
        let mut next = Vec::new();
        for &n in &level {
            for k in 0..g.out[n].len() {
                let b = g.out[n][k];
                g.indeg[b] -= 1;
                if g.indeg[b] == 0 {
                    next.push(b);
                }
            }
        }
        next.sort_unstable();
        level = next;
    }
    if done < nodes.len() {
        let remaining = g.indeg.iter().map(|&d| d > 0).collect();
        return Err(cycle(nodes, &g, remaining));
    }
    Ok(levels)
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn sort_vectors() {
        let cases: &[(&[&str], &[(&str, &str)], &[&str])] = &[
            (&["a", "b", "c", "d"], &[("c", "a"), ("a", "d")], &["b", "c", "a", "d"]),
            (&["x"], &[], &["x"]),
            (&["a", "b", "c"], &[], &["a", "b", "c"]),
            (&["shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"], &[("shirt", "tie"), ("tie", "jacket"), ("shirt", "belt"), ("belt", "jacket"), ("trousers", "belt"), ("trousers", "shoes"), ("socks", "shoes")], &["shirt", "tie", "trousers", "belt", "jacket", "socks", "shoes", "watch"]),
            (&["a", "b"], &[("a", "b"), ("a", "b")], &["a", "b"]),
        ];
        for &(nodes, edges, want) in cases {
            assert_eq!(topo_sort(nodes, edges).unwrap(), want, "{nodes:?}");
        }
    }

    #[test]
    fn levels_vectors() {
        let cases: &[(&[&str], &[(&str, &str)], &[&[&str]])] = &[
            (&["a", "b", "c", "d"], &[("c", "a"), ("a", "d")], &[&["b", "c"], &["a"], &["d"]]),
            (&["x"], &[], &[&["x"]]),
            (&["a", "b", "c"], &[], &[&["a", "b", "c"]]),
            (&["shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"], &[("shirt", "tie"), ("tie", "jacket"), ("shirt", "belt"), ("belt", "jacket"), ("trousers", "belt"), ("trousers", "shoes"), ("socks", "shoes")], &[&["shirt", "trousers", "socks", "watch"], &["tie", "belt", "shoes"], &["jacket"]]),
            (&["a", "b"], &[("a", "b"), ("a", "b")], &[&["a"], &["b"]]),
        ];
        for &(nodes, edges, want) in cases {
            let got = topo_levels(nodes, edges).unwrap();
            let want: Vec<Vec<String>> = want.iter().map(|l| l.iter().map(|s| s.to_string()).collect()).collect();
            assert_eq!(got, want, "{nodes:?}");
        }
    }

    #[test]
    fn cycle_vectors() {
        let cases: &[(&[&str], &[(&str, &str)], &str)] = &[
            (&["a", "b", "c"], &[("a", "b"), ("b", "c"), ("c", "b")], "cycle: b -> c -> b"),
            (&["a"], &[("a", "a")], "cycle: a -> a"),
            (&["p", "q", "r", "s"], &[("p", "q"), ("q", "r"), ("r", "p"), ("r", "s")], "cycle: p -> q -> r -> p"),
            (&["c", "a", "b"], &[("a", "b"), ("b", "a"), ("a", "c")], "cycle: a -> b -> a"),
            (&["z", "a", "b"], &[("a", "z"), ("a", "b"), ("b", "a")], "cycle: a -> b -> a"),
            (&["s", "x", "y", "d"], &[("x", "d"), ("x", "y"), ("y", "x"), ("d", "s")], "cycle: x -> y -> x"),
        ];
        for &(nodes, edges, want) in cases {
            let e = topo_sort(nodes, edges).unwrap_err();
            assert!(e.cycle);
            assert_eq!(e.to_string(), want);
            assert_eq!(topo_levels(nodes, edges).unwrap_err().message, want);
        }
    }

    #[test]
    fn invalid_vectors() {
        let cases: &[(&[&str], &[(&str, &str)])] = &[(&["a"], &[("a", "b")]), (&["a", "a"], &[])];
        for &(nodes, edges) in cases {
            assert!(!topo_sort(nodes, edges).unwrap_err().cycle);
            assert!(!topo_levels(nodes, edges).unwrap_err().cycle);
        }
    }
}
