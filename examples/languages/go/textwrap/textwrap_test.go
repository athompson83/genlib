// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package textwrap

import (
	"errors"
	"testing"
)

func TestWrapText(t *testing.T) {
	for _, c := range []struct {
		text  string
		width int
		want  string
	}{
		{"The quick brown fox jumps over the lazy dog", 1, "T\nh\ne\nq\nu\ni\nc\nk\nb\nr\no\nw\nn\nf\no\nx\nj\nu\nm\np\ns\no\nv\ne\nr\nt\nh\ne\nl\na\nz\ny\nd\no\ng"},
		{"The quick brown fox jumps over the lazy dog", 5, "The\nquick\nbrown\nfox\njumps\nover\nthe\nlazy\ndog"},
		{"The quick brown fox jumps over the lazy dog", 10, "The quick\nbrown fox\njumps over\nthe lazy\ndog"},
		{"The quick brown fox jumps over the lazy dog", 20, "The quick brown fox\njumps over the lazy\ndog"},
		{"a  b\t\tc", 1, "a\nb\nc"},
		{"a  b\t\tc", 5, "a b c"},
		{"a  b\t\tc", 10, "a b c"},
		{"a  b\t\tc", 20, "a b c"},
		{"supercalifragilisticexpialidocious word", 1, "s\nu\np\ne\nr\nc\na\nl\ni\nf\nr\na\ng\ni\nl\ni\ns\nt\ni\nc\ne\nx\np\ni\na\nl\ni\nd\no\nc\ni\no\nu\ns\nw\no\nr\nd"},
		{"supercalifragilisticexpialidocious word", 5, "super\ncalif\nragil\nistic\nexpia\nlidoc\nious\nword"},
		{"supercalifragilisticexpialidocious word", 10, "supercalif\nragilistic\nexpialidoc\nious word"},
		{"supercalifragilisticexpialidocious word", 20, "supercalifragilistic\nexpialidocious word"},
		{"line one\nline two is longer than ten\n\nend", 1, "l\ni\nn\ne\no\nn\ne\nl\ni\nn\ne\nt\nw\no\ni\ns\nl\no\nn\ng\ne\nr\nt\nh\na\nn\nt\ne\nn\n\ne\nn\nd"},
		{"line one\nline two is longer than ten\n\nend", 5, "line\none\nline\ntwo\nis\nlonge\nr\nthan\nten\n\nend"},
		{"line one\nline two is longer than ten\n\nend", 10, "line one\nline two\nis longer\nthan ten\n\nend"},
		{"line one\nline two is longer than ten\n\nend", 20, "line one\nline two is longer\nthan ten\n\nend"},
		{"caf\u00e9 \U0001f600\U0001f600\U0001f600 na\u00efve", 1, "c\na\nf\n\u00e9\n\U0001f600\n\U0001f600\n\U0001f600\nn\na\n\u00ef\nv\ne"},
		{"caf\u00e9 \U0001f600\U0001f600\U0001f600 na\u00efve", 5, "caf\u00e9\n\U0001f600\U0001f600\U0001f600\nna\u00efve"},
		{"caf\u00e9 \U0001f600\U0001f600\U0001f600 na\u00efve", 10, "caf\u00e9 \U0001f600\U0001f600\U0001f600\nna\u00efve"},
		{"caf\u00e9 \U0001f600\U0001f600\U0001f600 na\u00efve", 20, "caf\u00e9 \U0001f600\U0001f600\U0001f600 na\u00efve"},
		{"trailing   ", 1, "t\nr\na\ni\nl\ni\nn\ng"},
		{"trailing   ", 5, "trail\ning"},
		{"trailing   ", 10, "trailing"},
		{"trailing   ", 20, "trailing"},
		{"", 1, ""},
		{"", 5, ""},
		{"", 10, ""},
		{"", 20, ""},
		{"crlf\r\nand\rcr", 1, "c\nr\nl\nf\na\nn\nd\nc\nr"},
		{"crlf\r\nand\rcr", 5, "crlf\nand\ncr"},
		{"crlf\r\nand\rcr", 10, "crlf\nand\ncr"},
		{"crlf\r\nand\rcr", 20, "crlf\nand\ncr"},
	} {
		if got, err := WrapText(c.text, c.width); err != nil || got != c.want {
			t.Errorf("WrapText(%q, %d) = %q, %v; want %q", c.text, c.width, got, err, c.want)
		}
	}
	for _, w := range []int{0} {
		if _, err := WrapText("x", w); !errors.Is(err, ErrWidth) {
			t.Errorf("WrapText width %d should fail", w)
		}
	}
}

func TestTruncateText(t *testing.T) {
	for _, c := range []struct {
		text     string
		maxLen   int
		ellipsis string
		want     string
	}{
		{"The quick brown fox jumps", 15, "\u2026", "The quick\u2026"},
		{"The quick brown fox jumps", 100, "\u2026", "The quick brown fox jumps"},
		{"Supercalifragilistic", 10, "\u2026", "Supercali\u2026"},
		{"Hello world", 8, "...", "Hello..."},
		{"Hi there you", 12, "\u2026", "Hi there you"},
		{"a b c d e f g", 6, "\u2026", "a b\u2026"},
		{"\U0001f600\U0001f600\U0001f600\U0001f600", 3, "\u2026", "\U0001f600\U0001f600\u2026"},
		{"abc", 3, "...", "abc"},
		{"abcd", 3, "...", "..."},
	} {
		if got, err := TruncateText(c.text, c.maxLen, c.ellipsis); err != nil || got != c.want {
			t.Errorf("TruncateText(%q, %d) = %q, %v; want %q", c.text, c.maxLen, got, err, c.want)
		}
	}
	for _, c := range []struct {
		text     string
		maxLen   int
		ellipsis string
	}{{"long text", 2, "..."}, {"long text", 0, ""}} {
		if _, err := TruncateText(c.text, c.maxLen, c.ellipsis); !errors.Is(err, ErrWidth) {
			t.Errorf("TruncateText(%q, %d) should fail", c.text, c.maxLen)
		}
	}
}
