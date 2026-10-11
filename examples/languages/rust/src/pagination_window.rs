// SPDX-License-Identifier: Apache-2.0

//! Page counts, offsets and the page-number window shown by a pager (the MUI
//! usePagination layout: boundary pages, sibling pages around the current
//! page and gaps between them). Window entries are [`PageItem`] values, with
//! [`PageItem::Gap`] for each ellipsis.

use std::collections::HashSet;
use std::fmt;

/// Out-of-range pagination arguments.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PageError(pub String);

impl fmt::Display for PageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "pagination: {}", self.0)
    }
}

impl std::error::Error for PageError {}

fn err<T>(m: &str) -> Result<T, PageError> {
    Err(PageError(m.to_string()))
}

/// One entry of a page window: a 1-based page number or an ellipsis.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PageItem {
    Page(i64),
    Gap,
}

/// `ceil(total / per_page)`, at least 1; `per_page` is 1..=1000.
pub fn page_count(total: i64, per_page: i64) -> Result<i64, PageError> {
    if total < 0 || !(1..=1000).contains(&per_page) {
        return err("total must be >= 0 and per_page 1..=1000");
    }
    Ok(((total + per_page - 1) / per_page).max(1))
}

/// The zero-based item offset of a 1-based page.
pub fn page_offset(page: i64, per_page: i64) -> Result<i64, PageError> {
    if page < 1 || !(1..=1000).contains(&per_page) {
        return err("page must be >= 1 and per_page 1..=1000");
    }
    Ok((page - 1) * per_page)
}

/// The pages to show for `current` of `total`; `siblings` is 0..=5 and
/// `boundaries` 1..=5.
pub fn page_window(
    current: i64,
    total: i64,
    siblings: i64,
    boundaries: i64,
) -> Result<Vec<PageItem>, PageError> {
    if total < 1
        || !(1..=total).contains(&current)
        || !(0..=5).contains(&siblings)
        || !(1..=5).contains(&boundaries)
    {
        return err("invalid window arguments");
    }
    let span = |a: i64, b: i64| (a..=b).map(PageItem::Page).collect::<Vec<_>>();
    let end_first = (total - boundaries + 1).max(boundaries + 1);
    let end = span(end_first, total);
    let s_start = (current - siblings)
        .min(total - boundaries - siblings * 2 - 1)
        .max(boundaries + 2);
    let end_limit = if end.is_empty() {
        total - 1
    } else {
        end_first - 2
    };
    let s_end = (current + siblings)
        .max(boundaries + siblings * 2 + 2)
        .min(end_limit);
    let mut items = span(1, boundaries.min(total));
    if s_start > boundaries + 2 {
        items.push(PageItem::Gap);
    } else if boundaries + 1 < total - boundaries {
        items.push(PageItem::Page(boundaries + 1));
    }
    items.extend(span(s_start, s_end));
    if s_end < total - boundaries - 1 {
        items.push(PageItem::Gap);
    } else if total - boundaries > boundaries {
        items.push(PageItem::Page(total - boundaries));
    }
    items.extend(end);
    let mut seen = HashSet::new();
    Ok(items
        .into_iter()
        .filter(|x| *x == PageItem::Gap || seen.insert(*x))
        .collect())
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    use PageItem::{Gap, Page};

    #[test]
    fn count_and_offset_vectors() {
        for (t, p, want) in [
            (0, 10, 1),
            (1, 10, 1),
            (10, 10, 1),
            (11, 10, 2),
            (999, 25, 40),
            (5, 1, 5),
        ] {
            assert_eq!(page_count(t, p), Ok(want), "{t} {p}");
        }
        for (t, p) in [(-1, 10), (5, 0), (5, 1001)] {
            assert!(page_count(t, p).is_err(), "{t} {p}");
        }
        for (page, p, want) in [(1, 20, 0), (3, 20, 40)] {
            assert_eq!(page_offset(page, p), Ok(want));
        }
        assert!(page_offset(0, 10).is_err());
    }

    #[test]
    fn window_vectors() {
        for (c, t, s, bd, want) in [
            (1, 1, 1, 1, vec![Page(1)]),
            (1, 2, 1, 1, vec![Page(1), Page(2)]),
            (2, 2, 1, 1, vec![Page(1), Page(2)]),
            (1, 3, 1, 1, vec![Page(1), Page(2), Page(3)]),
            (2, 3, 1, 1, vec![Page(1), Page(2), Page(3)]),
            (3, 3, 1, 1, vec![Page(1), Page(2), Page(3)]),
            (
                1,
                5,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5)],
            ),
            (
                2,
                5,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5)],
            ),
            (
                3,
                5,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5)],
            ),
            (
                4,
                5,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5)],
            ),
            (
                5,
                5,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5)],
            ),
            (
                1,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                2,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                3,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                4,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                5,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                6,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                7,
                7,
                1,
                1,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                ],
            ),
            (
                1,
                8,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(8)],
            ),
            (
                2,
                8,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(8)],
            ),
            (
                3,
                8,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(8)],
            ),
            (
                4,
                8,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(8)],
            ),
            (
                6,
                8,
                1,
                1,
                vec![Page(1), Gap, Page(4), Page(5), Page(6), Page(7), Page(8)],
            ),
            (
                7,
                8,
                1,
                1,
                vec![Page(1), Gap, Page(4), Page(5), Page(6), Page(7), Page(8)],
            ),
            (
                8,
                8,
                1,
                1,
                vec![Page(1), Gap, Page(4), Page(5), Page(6), Page(7), Page(8)],
            ),
            (
                1,
                10,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(10)],
            ),
            (
                2,
                10,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(10)],
            ),
            (
                3,
                10,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(10)],
            ),
            (
                4,
                10,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(10)],
            ),
            (
                5,
                10,
                1,
                1,
                vec![Page(1), Gap, Page(4), Page(5), Page(6), Gap, Page(10)],
            ),
            (
                8,
                10,
                1,
                1,
                vec![Page(1), Gap, Page(6), Page(7), Page(8), Page(9), Page(10)],
            ),
            (
                9,
                10,
                1,
                1,
                vec![Page(1), Gap, Page(6), Page(7), Page(8), Page(9), Page(10)],
            ),
            (
                10,
                10,
                1,
                1,
                vec![Page(1), Gap, Page(6), Page(7), Page(8), Page(9), Page(10)],
            ),
            (
                1,
                20,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(20)],
            ),
            (
                2,
                20,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(20)],
            ),
            (
                3,
                20,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(20)],
            ),
            (
                4,
                20,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(20)],
            ),
            (
                10,
                20,
                1,
                1,
                vec![Page(1), Gap, Page(9), Page(10), Page(11), Gap, Page(20)],
            ),
            (
                18,
                20,
                1,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(16),
                    Page(17),
                    Page(18),
                    Page(19),
                    Page(20),
                ],
            ),
            (
                19,
                20,
                1,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(16),
                    Page(17),
                    Page(18),
                    Page(19),
                    Page(20),
                ],
            ),
            (
                20,
                20,
                1,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(16),
                    Page(17),
                    Page(18),
                    Page(19),
                    Page(20),
                ],
            ),
            (
                1,
                100,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(100)],
            ),
            (
                2,
                100,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(100)],
            ),
            (
                3,
                100,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(100)],
            ),
            (
                4,
                100,
                1,
                1,
                vec![Page(1), Page(2), Page(3), Page(4), Page(5), Gap, Page(100)],
            ),
            (
                50,
                100,
                1,
                1,
                vec![Page(1), Gap, Page(49), Page(50), Page(51), Gap, Page(100)],
            ),
            (
                98,
                100,
                1,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(96),
                    Page(97),
                    Page(98),
                    Page(99),
                    Page(100),
                ],
            ),
            (
                99,
                100,
                1,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(96),
                    Page(97),
                    Page(98),
                    Page(99),
                    Page(100),
                ],
            ),
            (
                100,
                100,
                1,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(96),
                    Page(97),
                    Page(98),
                    Page(99),
                    Page(100),
                ],
            ),
            (
                10,
                20,
                2,
                1,
                vec![
                    Page(1),
                    Gap,
                    Page(8),
                    Page(9),
                    Page(10),
                    Page(11),
                    Page(12),
                    Gap,
                    Page(20),
                ],
            ),
            (10, 20, 0, 1, vec![Page(1), Gap, Page(10), Gap, Page(20)]),
            (
                10,
                20,
                1,
                2,
                vec![
                    Page(1),
                    Page(2),
                    Gap,
                    Page(9),
                    Page(10),
                    Page(11),
                    Gap,
                    Page(19),
                    Page(20),
                ],
            ),
            (
                1,
                20,
                2,
                2,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Page(4),
                    Page(5),
                    Page(6),
                    Page(7),
                    Page(8),
                    Gap,
                    Page(19),
                    Page(20),
                ],
            ),
            (
                20,
                20,
                2,
                2,
                vec![
                    Page(1),
                    Page(2),
                    Gap,
                    Page(13),
                    Page(14),
                    Page(15),
                    Page(16),
                    Page(17),
                    Page(18),
                    Page(19),
                    Page(20),
                ],
            ),
            (
                50,
                100,
                3,
                3,
                vec![
                    Page(1),
                    Page(2),
                    Page(3),
                    Gap,
                    Page(47),
                    Page(48),
                    Page(49),
                    Page(50),
                    Page(51),
                    Page(52),
                    Page(53),
                    Gap,
                    Page(98),
                    Page(99),
                    Page(100),
                ],
            ),
        ] {
            assert_eq!(page_window(c, t, s, bd), Ok(want), "{c} {t} {s} {bd}");
        }
        for (c, t, s, bd) in [
            (0, 10, 1, 1),
            (11, 10, 1, 1),
            (1, 0, 1, 1),
            (1, 10, 6, 1),
            (1, 10, 1, 0),
        ] {
            assert!(page_window(c, t, s, bd).is_err(), "{c} {t} {s} {bd}");
        }
    }
}
