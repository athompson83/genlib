// SPDX-License-Identifier: Apache-2.0

package chunking

import (
	"reflect"
	"testing"
)

func TestCases(t *testing.T) {
	for i, c := range []struct {
		text         string
		max, overlap int
		want         []string
	}{
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 60, 0, []string{"First paragraph. It has two sentences.", "Second paragraph is a bit longer and keeps going.", "Another sentence here! And a question?\n\nThird."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 40, 15, []string{"First paragraph. It has two sentences.", "Second paragraph is a bit longer and", "bit longer and keeps going.", "keeps going. Another sentence here!", "And a question?\n\nThird."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 0, []string{"First para", "graph. It", "has two se", "ntences.", "Second", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "a question", "?\n\nThird."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 4, []string{"First para", "paragraph.", "aph. It", "It has", "has two se", "sentences.", "ces.", ".\n\nSecond", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "And a ques", "question?", "on?", "n?\n\nThird."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 4, 0, []string{"Firs", "t pa", "ragr", "aph.", "It", "has", "two", "sent", "ence", "s.", "Seco", "nd p", "arag", "raph", "is", "a", "bit", "long", "er", "and", "keep", "s go", "ing.", "Ano", "ther", "sen", "tenc", "e he", "re!", "And", "a qu", "esti", "on?", "Thi", "rd."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 9, 4, []string{"First par", "paragraph", "raph. It", "It has", "has two s", "sentences", "nces.", "Second", "paragraph", "raph is", "is a", "a bit", "longer", "and", "keeps", "going.", "Another", "sentence", "here!", "And a que", "question?", "ion?", "?\n\nThird."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 1, 0, []string{"F", "i", "r", "s", "t", "p", "a", "r", "a", "g", "r", "a", "p", "h", ".", "I", "t", "h", "a", "s", "t", "w", "o", "s", "e", "n", "t", "e", "n", "c", "e", "s", ".", "S", "e", "c", "o", "n", "d", "p", "a", "r", "a", "g", "r", "a", "p", "h", "i", "s", "a", "b", "i", "t", "l", "o", "n", "g", "e", "r", "a", "n", "d", "k", "e", "e", "p", "s", "g", "o", "i", "n", "g", ".", "A", "n", "o", "t", "h", "e", "r", "s", "e", "n", "t", "e", "n", "c", "e", "h", "e", "r", "e", "!", "A", "n", "d", "a", "q", "u", "e", "s", "t", "i", "o", "n", "?", "T", "h", "i", "r", "d", "."}},
		{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 200, 50, []string{"First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird."}},
		{"abcdefghij", 60, 0, []string{"abcdefghij"}},
		{"abcdefghij", 40, 15, []string{"abcdefghij"}},
		{"abcdefghij", 10, 0, []string{"abcdefghij"}},
		{"abcdefghij", 10, 4, []string{"abcdefghij"}},
		{"abcdefghij", 4, 0, []string{"abcd", "efgh", "ij"}},
		{"abcdefghij", 9, 4, []string{"abcdefghi", "fghij"}},
		{"abcdefghij", 1, 0, []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j"}},
		{"abcdefghij", 200, 50, []string{"abcdefghij"}},
		{"one two three four five", 60, 0, []string{"one two three four five"}},
		{"one two three four five", 40, 15, []string{"one two three four five"}},
		{"one two three four five", 10, 0, []string{"one two", "three", "four five"}},
		{"one two three four five", 10, 4, []string{"one two", "two three", "four five"}},
		{"one two three four five", 4, 0, []string{"one", "two", "thre", "e fo", "ur", "five"}},
		{"one two three four five", 9, 4, []string{"one two", "three", "four five"}},
		{"one two three four five", 1, 0, []string{"o", "n", "e", "t", "w", "o", "t", "h", "r", "e", "e", "f", "o", "u", "r", "f", "i", "v", "e"}},
		{"one two three four five", 200, 50, []string{"one two three four five"}},
		{"A. B. C.", 60, 0, []string{"A. B. C."}},
		{"A. B. C.", 40, 15, []string{"A. B. C."}},
		{"A. B. C.", 10, 0, []string{"A. B. C."}},
		{"A. B. C.", 10, 4, []string{"A. B. C."}},
		{"A. B. C.", 4, 0, []string{"A.", "B.", "C."}},
		{"A. B. C.", 9, 4, []string{"A. B. C."}},
		{"A. B. C.", 1, 0, []string{"A", ".", "B", ".", "C", "."}},
		{"A. B. C.", 200, 50, []string{"A. B. C."}},
		{"  \n\n  ", 60, 0, []string{}},
		{"  \n\n  ", 40, 15, []string{}},
		{"  \n\n  ", 10, 0, []string{}},
		{"  \n\n  ", 10, 4, []string{}},
		{"  \n\n  ", 4, 0, []string{}},
		{"  \n\n  ", 9, 4, []string{}},
		{"  \n\n  ", 1, 0, []string{}},
		{"  \n\n  ", 200, 50, []string{}},
		{"", 60, 0, []string{}},
		{"", 40, 15, []string{}},
		{"", 10, 0, []string{}},
		{"", 10, 4, []string{}},
		{"", 4, 0, []string{}},
		{"", 9, 4, []string{}},
		{"", 1, 0, []string{}},
		{"", 200, 50, []string{}},
		{"Line one\nLine two\nLine three\nLine four", 60, 0, []string{"Line one\nLine two\nLine three\nLine four"}},
		{"Line one\nLine two\nLine three\nLine four", 40, 15, []string{"Line one\nLine two\nLine three\nLine four"}},
		{"Line one\nLine two\nLine three\nLine four", 10, 0, []string{"Line one", "Line two", "Line", "three", "Line four"}},
		{"Line one\nLine two\nLine three\nLine four", 10, 4, []string{"Line one", "Line two", "Line", "three", "Line four"}},
		{"Line one\nLine two\nLine three\nLine four", 4, 0, []string{"Line", "one", "Line", "two", "Line", "thr", "ee\nL", "ine", "four"}},
		{"Line one\nLine two\nLine three\nLine four", 9, 4, []string{"Line one", "Line two", "Line", "three", "Line four"}},
		{"Line one\nLine two\nLine three\nLine four", 1, 0, []string{"L", "i", "n", "e", "o", "n", "e", "L", "i", "n", "e", "t", "w", "o", "L", "i", "n", "e", "t", "h", "r", "e", "e", "L", "i", "n", "e", "f", "o", "u", "r"}},
		{"Line one\nLine two\nLine three\nLine four", 200, 50, []string{"Line one\nLine two\nLine three\nLine four"}},
		{"Short.", 60, 0, []string{"Short."}},
		{"Short.", 40, 15, []string{"Short."}},
		{"Short.", 10, 0, []string{"Short."}},
		{"Short.", 10, 4, []string{"Short."}},
		{"Short.", 4, 0, []string{"Shor", "t."}},
		{"Short.", 9, 4, []string{"Short."}},
		{"Short.", 1, 0, []string{"S", "h", "o", "r", "t", "."}},
		{"Short.", 200, 50, []string{"Short."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 60, 0, []string{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 40, 15, []string{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 10, 0, []string{"Caf\u00e9", "na\u00efve", "r\u00e9sum\u00e9 \u2014", "\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002", "End."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 10, 4, []string{"Caf\u00e9", "na\u00efve", "r\u00e9sum\u00e9 \u2014", "\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002", "End."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 4, 0, []string{"Caf\u00e9", "na\u00ef", "ve r", "\u00e9sum", "\u00e9 \u2014", "\u65e5\u672c\u8a9e\u306e", "\u30c6\u30ad\u30b9\u30c8", "\u3002", "End."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 9, 4, []string{"Caf\u00e9", "na\u00efve", "r\u00e9sum\u00e9 \u2014", "\u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9", "\u306e\u30c6\u30ad\u30b9\u30c8\u3002", "\u30b9\u30c8\u3002 End."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 1, 0, []string{"C", "a", "f", "\u00e9", "n", "a", "\u00ef", "v", "e", "r", "\u00e9", "s", "u", "m", "\u00e9", "\u2014", "\u65e5", "\u672c", "\u8a9e", "\u306e", "\u30c6", "\u30ad", "\u30b9", "\u30c8", "\u3002", "E", "n", "d", "."}},
		{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End.", 200, 50, []string{"Caf\u00e9 na\u00efve r\u00e9sum\u00e9 \u2014 \u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3002 End."}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 60, 0, []string{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 40, 15, []string{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 0, []string{"xxxxxxxxxx", "xxxxxxxxxx", "xxxxx", "yyyyy"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 4, []string{"xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxx", "xxx yyyyy"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 4, 0, []string{"xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "x yy", "yyy"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 9, 4, []string{"xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxx", "xxx yyyyy"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 1, 0, []string{"x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y"}},
		{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 200, 50, []string{"xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"}},
		{"Mr. Smith went. Then? Yes! Done.", 60, 0, []string{"Mr. Smith went. Then? Yes! Done."}},
		{"Mr. Smith went. Then? Yes! Done.", 40, 15, []string{"Mr. Smith went. Then? Yes! Done."}},
		{"Mr. Smith went. Then? Yes! Done.", 10, 0, []string{"Mr. Smith", "went.", "Then?", "Yes! Done."}},
		{"Mr. Smith went. Then? Yes! Done.", 10, 4, []string{"Mr. Smith", "went.", "Then?", "Yes! Done."}},
		{"Mr. Smith went. Then? Yes! Done.", 4, 0, []string{"Mr.", "Smit", "h we", "nt.", "Then", "? Ye", "s! D", "one."}},
		{"Mr. Smith went. Then? Yes! Done.", 9, 4, []string{"Mr.", "Smith", "went.", "Then?", "Yes!", "Done."}},
		{"Mr. Smith went. Then? Yes! Done.", 1, 0, []string{"M", "r", ".", "S", "m", "i", "t", "h", "w", "e", "n", "t", ".", "T", "h", "e", "n", "?", "Y", "e", "s", "!", "D", "o", "n", "e", "."}},
		{"Mr. Smith went. Then? Yes! Done.", 200, 50, []string{"Mr. Smith went. Then? Yes! Done."}},
	} {
		got, err := ChunkText(c.text, c.max, c.overlap)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("case %d ChunkText(%q, %d, %d) = %q, %v, want %q", i, c.text, c.max, c.overlap, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	if _, err := ChunkText("x", 0, 0); err == nil {
		t.Error("ChunkText(0, 0) should fail")
	}
	if _, err := ChunkText("x", 5, 5); err == nil {
		t.Error("ChunkText(5, 5) should fail")
	}
	if _, err := ChunkText("x", 5, -1); err == nil {
		t.Error("ChunkText(5, -1) should fail")
	}
	if _, err := ChunkText("x", -3, 0); err == nil {
		t.Error("ChunkText(-3, 0) should fail")
	}
}
