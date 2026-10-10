// SPDX-License-Identifier: Apache-2.0
// Checks for sse, text-chunking, vector-math, circuit-breaker, business-days, natural-sort, file-signature and color.
// Vector literals are generated from the shared wave 9 vectors.json (JSON null = nil; hex strings are byte inputs).
// Strings are compared as Unicode scalars because Swift String equality treats canonically equivalent text as equal.
import GenlibSwift

private let sseParseVectors: [(String, [SseEvent], Int?)] = [
    ("data: YHOO\ndata: +2\ndata: 10\n\n", [SseEvent(event: "message", data: "YHOO\n+2\n10", id: "")], nil),
    (": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n", [SseEvent(event: "message", data: "first event", id: "1"), SseEvent(event: "message", data: "second event", id: "")], nil),
    ("data\n\ndata\ndata\n\ndata:", [SseEvent(event: "message", data: "", id: ""), SseEvent(event: "message", data: "\n", id: "")], nil),
    ("data:test\n\ndata: test\n\n", [SseEvent(event: "message", data: "test", id: ""), SseEvent(event: "message", data: "test", id: "")], nil),
    ("event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n", [SseEvent(event: "add", data: "73857293", id: ""), SseEvent(event: "remove", data: "2153", id: ""), SseEvent(event: "add", data: "113411", id: "")], nil),
    ("\u{FEFF}data: bom\n\n", [SseEvent(event: "message", data: "bom", id: "")], nil),
    ("data: a\r\ndata: b\r\rdata: c\n\n", [SseEvent(event: "message", data: "a\nb", id: ""), SseEvent(event: "message", data: "c", id: "")], nil),
    ("id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n", [SseEvent(event: "message", data: "x", id: "7"), SseEvent(event: "message", data: "y", id: "7"), SseEvent(event: "message", data: "z", id: "")], nil),
    ("id: a\u{0}b\ndata: nul\n\n", [SseEvent(event: "message", data: "nul", id: "")], nil),
    ("retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n", [SseEvent(event: "message", data: "r", id: ""), SseEvent(event: "message", data: "s", id: "")], 1500),
    ("event\ndata: e\n\n", [SseEvent(event: "message", data: "e", id: "")], nil),
    ("unknown: q\ndata: u\n\n", [SseEvent(event: "message", data: "u", id: "")], nil),
    (":\n:comment\ndata: ok\n\n", [SseEvent(event: "message", data: "ok", id: "")], nil),
    ("data: no blank line at end", [], nil),
]
private let sseChunkedVectors: [([String], [SseEvent])] = [
    (["data: YHO", "O\ndata: +2\n", "data", ": 10\n\n"], [SseEvent(event: "message", data: "YHOO\n+2\n10", id: "")]),
    ([": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n"], [SseEvent(event: "message", data: "first event", id: "1"), SseEvent(event: "message", data: "second event", id: "")]),
    (["da", "ta\n\nda", "ta\ndata", "\n\ndata:"], [SseEvent(event: "message", data: "", id: ""), SseEvent(event: "message", data: "\n", id: "")]),
    (["data", ":t", "est\n\nd", "ata: test\n\n"], [SseEvent(event: "message", data: "test", id: ""), SseEvent(event: "message", data: "test", id: "")]),
    (["event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n"], [SseEvent(event: "add", data: "73857293", id: ""), SseEvent(event: "remove", data: "2153", id: ""), SseEvent(event: "add", data: "113411", id: "")]),
    (["\u{FEFF}d", "at", "a: bo", "m\n\n"], [SseEvent(event: "message", data: "bom", id: "")]),
    (["d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n"], [SseEvent(event: "message", data: "a\nb", id: ""), SseEvent(event: "message", data: "c", id: "")]),
    (["id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n"], [SseEvent(event: "message", data: "x", id: "7"), SseEvent(event: "message", data: "y", id: "7"), SseEvent(event: "message", data: "z", id: "")]),
    (["id:", " a\u{0}", "b\ndata:", " nul\n\n"], [SseEvent(event: "message", data: "nul", id: "")]),
    (["r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n"], [SseEvent(event: "message", data: "r", id: ""), SseEvent(event: "message", data: "s", id: "")]),
]
private let sseFormatVectors: [(String, String?, String?, Int?, String)] = [
    ("hello", nil, nil, nil, "data: hello\n\n"),
    ("a\nb\r\nc", "update", "42", nil, "event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n"),
    ("", nil, nil, 3000, "retry: 3000\ndata: \n\n"),
    ("{\"x\":1}", "json", "", nil, "event: json\nid: \ndata: {\"x\":1}\n\n"),
]
private let sseFormatInvalid: [(String, String?, String?, Int?)] = [
    ("x", "a\nb", nil, nil),
    ("x", nil, "a\rb", nil),
    ("x", nil, "a\u{0}", nil),
    ("x", nil, nil, -1),
]
private let sseCommentVectors: [(String, String)] = [("", ":\n\n"), ("ping", ": ping\n\n")]
private let chunkVectors: [(String, Int, Int, [String])] = [
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 60, 0, ["First paragraph. It has two sentences.", "Second paragraph is a bit longer and keeps going.", "Another sentence here! And a question?\n\nThird."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 40, 15, ["First paragraph. It has two sentences.", "Second paragraph is a bit longer and", "bit longer and keeps going.", "keeps going. Another sentence here!", "And a question?\n\nThird."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 0, ["First para", "graph. It", "has two se", "ntences.", "Second", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "a question", "?\n\nThird."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 4, ["First para", "paragraph.", "aph. It", "It has", "has two se", "sentences.", "ces.", ".\n\nSecond", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "And a ques", "question?", "on?", "n?\n\nThird."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 4, 0, ["Firs", "t pa", "ragr", "aph.", "It", "has", "two", "sent", "ence", "s.", "Seco", "nd p", "arag", "raph", "is", "a", "bit", "long", "er", "and", "keep", "s go", "ing.", "Ano", "ther", "sen", "tenc", "e he", "re!", "And", "a qu", "esti", "on?", "Thi", "rd."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 9, 4, ["First par", "paragraph", "raph. It", "It has", "has two s", "sentences", "nces.", "Second", "paragraph", "raph is", "is a", "a bit", "longer", "and", "keeps", "going.", "Another", "sentence", "here!", "And a que", "question?", "ion?", "?\n\nThird."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 1, 0, ["F", "i", "r", "s", "t", "p", "a", "r", "a", "g", "r", "a", "p", "h", ".", "I", "t", "h", "a", "s", "t", "w", "o", "s", "e", "n", "t", "e", "n", "c", "e", "s", ".", "S", "e", "c", "o", "n", "d", "p", "a", "r", "a", "g", "r", "a", "p", "h", "i", "s", "a", "b", "i", "t", "l", "o", "n", "g", "e", "r", "a", "n", "d", "k", "e", "e", "p", "s", "g", "o", "i", "n", "g", ".", "A", "n", "o", "t", "h", "e", "r", "s", "e", "n", "t", "e", "n", "c", "e", "h", "e", "r", "e", "!", "A", "n", "d", "a", "q", "u", "e", "s", "t", "i", "o", "n", "?", "T", "h", "i", "r", "d", "."]),
    ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 200, 50, ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird."]),
    ("abcdefghij", 60, 0, ["abcdefghij"]),
    ("abcdefghij", 40, 15, ["abcdefghij"]),
    ("abcdefghij", 10, 0, ["abcdefghij"]),
    ("abcdefghij", 10, 4, ["abcdefghij"]),
    ("abcdefghij", 4, 0, ["abcd", "efgh", "ij"]),
    ("abcdefghij", 9, 4, ["abcdefghi", "fghij"]),
    ("abcdefghij", 1, 0, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]),
    ("abcdefghij", 200, 50, ["abcdefghij"]),
    ("one two three four five", 60, 0, ["one two three four five"]),
    ("one two three four five", 40, 15, ["one two three four five"]),
    ("one two three four five", 10, 0, ["one two", "three", "four five"]),
    ("one two three four five", 10, 4, ["one two", "two three", "four five"]),
    ("one two three four five", 4, 0, ["one", "two", "thre", "e fo", "ur", "five"]),
    ("one two three four five", 9, 4, ["one two", "three", "four five"]),
    ("one two three four five", 1, 0, ["o", "n", "e", "t", "w", "o", "t", "h", "r", "e", "e", "f", "o", "u", "r", "f", "i", "v", "e"]),
    ("one two three four five", 200, 50, ["one two three four five"]),
    ("A. B. C.", 60, 0, ["A. B. C."]),
    ("A. B. C.", 40, 15, ["A. B. C."]),
    ("A. B. C.", 10, 0, ["A. B. C."]),
    ("A. B. C.", 10, 4, ["A. B. C."]),
    ("A. B. C.", 4, 0, ["A.", "B.", "C."]),
    ("A. B. C.", 9, 4, ["A. B. C."]),
    ("A. B. C.", 1, 0, ["A", ".", "B", ".", "C", "."]),
    ("A. B. C.", 200, 50, ["A. B. C."]),
    ("  \n\n  ", 60, 0, []),
    ("  \n\n  ", 40, 15, []),
    ("  \n\n  ", 10, 0, []),
    ("  \n\n  ", 10, 4, []),
    ("  \n\n  ", 4, 0, []),
    ("  \n\n  ", 9, 4, []),
    ("  \n\n  ", 1, 0, []),
    ("  \n\n  ", 200, 50, []),
    ("", 60, 0, []),
    ("", 40, 15, []),
    ("", 10, 0, []),
    ("", 10, 4, []),
    ("", 4, 0, []),
    ("", 9, 4, []),
    ("", 1, 0, []),
    ("", 200, 50, []),
    ("Line one\nLine two\nLine three\nLine four", 60, 0, ["Line one\nLine two\nLine three\nLine four"]),
    ("Line one\nLine two\nLine three\nLine four", 40, 15, ["Line one\nLine two\nLine three\nLine four"]),
    ("Line one\nLine two\nLine three\nLine four", 10, 0, ["Line one", "Line two", "Line", "three", "Line four"]),
    ("Line one\nLine two\nLine three\nLine four", 10, 4, ["Line one", "Line two", "Line", "three", "Line four"]),
    ("Line one\nLine two\nLine three\nLine four", 4, 0, ["Line", "one", "Line", "two", "Line", "thr", "ee\nL", "ine", "four"]),
    ("Line one\nLine two\nLine three\nLine four", 9, 4, ["Line one", "Line two", "Line", "three", "Line four"]),
    ("Line one\nLine two\nLine three\nLine four", 1, 0, ["L", "i", "n", "e", "o", "n", "e", "L", "i", "n", "e", "t", "w", "o", "L", "i", "n", "e", "t", "h", "r", "e", "e", "L", "i", "n", "e", "f", "o", "u", "r"]),
    ("Line one\nLine two\nLine three\nLine four", 200, 50, ["Line one\nLine two\nLine three\nLine four"]),
    ("Short.", 60, 0, ["Short."]),
    ("Short.", 40, 15, ["Short."]),
    ("Short.", 10, 0, ["Short."]),
    ("Short.", 10, 4, ["Short."]),
    ("Short.", 4, 0, ["Shor", "t."]),
    ("Short.", 9, 4, ["Short."]),
    ("Short.", 1, 0, ["S", "h", "o", "r", "t", "."]),
    ("Short.", 200, 50, ["Short."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 60, 0, ["Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 40, 15, ["Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 10, 0, ["Caf\u{E9}", "na\u{EF}ve", "r\u{E9}sum\u{E9} \u{2014}", "\u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002}", "End."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 10, 4, ["Caf\u{E9}", "na\u{EF}ve", "r\u{E9}sum\u{E9} \u{2014}", "\u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002}", "End."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 4, 0, ["Caf\u{E9}", "na\u{EF}", "ve r", "\u{E9}sum", "\u{E9} \u{2014}", "\u{65E5}\u{672C}\u{8A9E}\u{306E}", "\u{30C6}\u{30AD}\u{30B9}\u{30C8}", "\u{3002}", "End."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 9, 4, ["Caf\u{E9}", "na\u{EF}ve", "r\u{E9}sum\u{E9} \u{2014}", "\u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}", "\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002}", "\u{30B9}\u{30C8}\u{3002} End."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 1, 0, ["C", "a", "f", "\u{E9}", "n", "a", "\u{EF}", "v", "e", "r", "\u{E9}", "s", "u", "m", "\u{E9}", "\u{2014}", "\u{65E5}", "\u{672C}", "\u{8A9E}", "\u{306E}", "\u{30C6}", "\u{30AD}", "\u{30B9}", "\u{30C8}", "\u{3002}", "E", "n", "d", "."]),
    ("Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.", 200, 50, ["Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End."]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 60, 0, ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 40, 15, ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 0, ["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx", "yyyyy"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 4, ["xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxx", "xxx yyyyy"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 4, 0, ["xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "x yy", "yyy"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 9, 4, ["xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxx", "xxx yyyyy"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 1, 0, ["x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y"]),
    ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 200, 50, ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]),
    ("Mr. Smith went. Then? Yes! Done.", 60, 0, ["Mr. Smith went. Then? Yes! Done."]),
    ("Mr. Smith went. Then? Yes! Done.", 40, 15, ["Mr. Smith went. Then? Yes! Done."]),
    ("Mr. Smith went. Then? Yes! Done.", 10, 0, ["Mr. Smith", "went.", "Then?", "Yes! Done."]),
    ("Mr. Smith went. Then? Yes! Done.", 10, 4, ["Mr. Smith", "went.", "Then?", "Yes! Done."]),
    ("Mr. Smith went. Then? Yes! Done.", 4, 0, ["Mr.", "Smit", "h we", "nt.", "Then", "? Ye", "s! D", "one."]),
    ("Mr. Smith went. Then? Yes! Done.", 9, 4, ["Mr.", "Smith", "went.", "Then?", "Yes!", "Done."]),
    ("Mr. Smith went. Then? Yes! Done.", 1, 0, ["M", "r", ".", "S", "m", "i", "t", "h", "w", "e", "n", "t", ".", "T", "h", "e", "n", "?", "Y", "e", "s", "!", "D", "o", "n", "e", "."]),
    ("Mr. Smith went. Then? Yes! Done.", 200, 50, ["Mr. Smith went. Then? Yes! Done."]),
]
private let chunkInvalid: [(String, Int, Int)] = [("x", 0, 0), ("x", 5, 5), ("x", 5, -1), ("x", -3, 0)]
private let vectorPairs: [([Double], [Double], Double, Double)] = [
    ([1.0, 2.0, 3.0], [4.0, 5.0, 6.0], 32.0, 0.9746318461970762),
    ([1.0, 0.0], [0.0, 1.0], 0.0, 0.0),
    ([1.0, 1.0], [-1.0, -1.0], -2.0, -0.9999999999999998),
    ([0.0, 0.0], [1.0, 2.0], 0.0, 0.0),
    ([3.0, 4.0], [3.0, 4.0], 25.0, 1.0),
    ([0.5, -1.5, 2.0], [2.0, 0.25, -1.0], -1.375, -0.23969749850222494),
]
private let vectorNorms: [([Double], Double)] = [([3.0, 4.0], 5.0), ([0.0, 0.0, 0.0], 0.0), ([1.0, 1.0, 1.0, 1.0], 2.0), ([-2.5], 2.5)]
private let vectorNormalize: [([Double], [Double])] = [([3.0, 4.0], [0.6, 0.8]), ([0.0, 5.0], [0.0, 1.0]), ([1.0, 1.0, 1.0, 1.0], [0.5, 0.5, 0.5, 0.5])]
private let vectorTopK: [([Double], [[Double]], Int, [(Int, Double)])] = [
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 0, []),
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 1, [(0, 1.0)]),
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 3, [(0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476)]),
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 10, [(0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476), (2, 0.0), (4, -1.0)]),
    ([0.2, 0.5, 0.1], [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]], 3, [(2, 1.0), (5, 0.9990003934498585), (0, 0.956182887467515)]),
]
private let vectorMmr: [([Double], [[Double]], Int, Double, [Int])] = [
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 3, 0.5, [0, 1, 4]),
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 3, 1.0, [0, 1, 3]),
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 3, 0.0, [0, 4, 2]),
    ([1.0, 0.0], [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0], [0.7, 0.7], [-1.0, 0.0]], 5, 0.7, [0, 1, 3, 2, 4]),
    ([0.2, 0.5, 0.1], [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]], 3, 0.5, [2, 0, 1]),
    ([0.2, 0.5, 0.1], [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]], 4, 0.3, [2, 3, 1, 4]),
]
private let breakerScripts: [((Int, Int64, Int), [(String, Int64, String?)])] = [
    ((2, 1000, 1), [("allow", 0, "true"), ("failure", 0, nil), ("state", 0, "closed"), ("failure", 10, nil), ("state", 10, "open"), ("allow", 500, "false"), ("retry_after", 500, "510"), ("state", 1010, "half_open"), ("allow", 1010, "true"), ("allow", 1011, "false"), ("success", 1020, nil), ("state", 1020, "closed"), ("allow", 1021, "true")]),
    ((3, 500, 2), [("failure", 0, nil), ("success", 1, nil), ("failure", 2, nil), ("failure", 3, nil), ("state", 3, "closed"), ("failure", 4, nil), ("state", 4, "open"), ("state", 503, "open"), ("allow", 504, "true"), ("allow", 505, "true"), ("allow", 506, "false"), ("failure", 507, nil), ("state", 507, "open"), ("retry_after", 600, "407"), ("state", 1007, "half_open"), ("allow", 1008, "true"), ("success", 1009, nil), ("state", 1009, "closed")]),
    ((1, 0, 1), [("failure", 5, nil), ("state", 5, "half_open"), ("allow", 5, "true"), ("allow", 5, "false"), ("failure", 6, nil), ("state", 6, "half_open"), ("allow", 6, "true")]),
]
private let breakerInvalid: [(Int, Int64, Int)] = [(0, 1000, 1), (1, -1, 1), (1, 1000, 0)]
private let bizIs: [(String, [String], [String], Bool)] = [
    ("2026-10-10", [], ["SA", "SU"], false),
    ("2026-10-12", [], ["SA", "SU"], true),
    ("2026-12-25", ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], false),
    ("2026-10-16", [], ["FR", "SA"], false),
]
private let bizAdd: [(String, Int, [String], [String], String)] = [
    ("2026-10-09", 1, [], ["SA", "SU"], "2026-10-12"),
    ("2026-10-12", -1, [], ["SA", "SU"], "2026-10-09"),
    ("2026-10-10", 0, [], ["SA", "SU"], "2026-10-12"),
    ("2026-10-12", 0, [], ["SA", "SU"], "2026-10-12"),
    ("2026-12-23", 3, ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], "2026-12-30"),
    ("2026-12-31", -5, ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], "2026-12-22"),
    ("2028-02-28", 1, [], ["SA", "SU"], "2028-02-29"),
    ("2026-10-14", 10, [], ["FR", "SA"], "2026-10-28"),
    ("2026-01-01", 260, [], ["SA", "SU"], "2026-12-31"),
    ("2026-10-11", 0, [], [], "2026-10-11"),
]
private let bizBetween: [(String, String, [String], [String], Int)] = [
    ("2026-10-01", "2026-11-01", ["2026-10-12"], ["SA", "SU"], 21),
    ("2026-11-01", "2026-10-01", [], ["SA", "SU"], -22),
    ("2026-10-12", "2026-10-12", [], ["SA", "SU"], 0),
    ("2026-12-21", "2027-01-04", ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], 7),
    ("2026-01-01", "2027-01-01", [], ["SA", "SU"], 261),
    ("2026-10-01", "2026-10-31", [], ["FR", "SA"], 21),
    ("2026-10-10", "2026-10-12", ["2026-10-11"], ["SA", "SU"], 0),
]
private let bizInvalid: [(String, Int)] = [("2026-02-30", 1), ("2026-1-01", 1), ("2026-01-01", 100001)]
private let natSorted: [([String], [String])] = [
    (["file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1"], ["", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10"]),
    (["v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10"], ["v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0"]),
    (["img12.png", "img10.png", "IMG2.png", "img1.png"], ["img1.png", "IMG2.png", "img10.png", "img12.png"]),
    (["a0", "a00", "a000", "a", "a1", "a01"], ["a", "a0", "a00", "a000", "a1", "a01"]),
    (["\u{C4}", "Z", "a", "z", "_x", "1x"], ["1x", "_x", "a", "Z", "z", "\u{C4}"]),
]
private let natCompare: [(String, String, Int)] = [("a2", "a10", -1), ("a10", "a2", 1), ("abc", "ABC", 1), ("x01", "x1", 1), ("x1", "x1", 0), ("", "a", -1), ("a", "1", 1), ("99999999999999999999", "100000000000000000000", -1)]
private let sigDetect: [(String, String, String?, String?)] = [
    ("png", "89504e470d0a1a0a0000000d49484452", "image/png", "png"),
    ("jpg", "ffd8ffe000104a464946", "image/jpeg", "jpg"),
    ("gif", "4749463839610100", "image/gif", "gif"),
    ("webp", "52494646240000005745425056503820", "image/webp", "webp"),
    ("wav", "524946462400000057415645666d7420", "audio/wav", "wav"),
    ("avi", "5249464624000000415649204c495354", "video/x-msvideo", "avi"),
    ("bmp", "424d0000000000000000000000000000", "image/bmp", "bmp"),
    ("ico", "000001000100", "image/x-icon", "ico"),
    ("tif", "49492a000800", "image/tiff", "tif"),
    ("tif-be", "4d4d002a0008", "image/tiff", "tif"),
    ("pdf", "255044462d312e370a", "application/pdf", "pdf"),
    ("zip", "504b03041400", "application/zip", "zip"),
    ("zip-empty", "504b0506000000000000000000000000000000000000", "application/zip", "zip"),
    ("gz", "1f8b0800", "application/gzip", "gz"),
    ("7z", "377abcaf271c0004", "application/x-7z-compressed", "7z"),
    ("rar", "526172211a070100", "application/vnd.rar", "rar"),
    ("sqlite", "53514c69746520666f726d61742033001000", "application/vnd.sqlite3", "sqlite"),
    ("wasm", "0061736d01000000", "application/wasm", "wasm"),
    ("ogg", "4f6767530002", "audio/ogg", "ogg"),
    ("flac", "664c614300000022", "audio/flac", "flac"),
    ("mp3-id3", "494433040000", "audio/mpeg", "mp3"),
    ("mp3-frame", "fffb9064", "audio/mpeg", "mp3"),
    ("webm", "1a45dfa39f4286", "video/webm", "webm"),
    ("mp4", "000000206674797069736f6d00000200", "video/mp4", "mp4"),
    ("mov", "00000014667479707174202000000000", "video/quicktime", "mov"),
    ("heic", "00000018667479706865696300000000", "image/heic", "heic"),
    ("avif", "0000001c667479706176696600000000", "image/avif", "avif"),
    ("m4a", "00000020667479704d34412000000000", "audio/mp4", "m4a"),
    ("woff", "774f464600010000", "font/woff", "woff"),
    ("woff2", "774f463200010000", "font/woff2", "woff2"),
    ("text", "68656c6c6f20776f726c64", nil, nil),
    ("empty", "", nil, nil),
    ("short-png", "89504e47", nil, nil),
    ("bm-short", "424d0000", nil, nil),
    ("ff-not-mp3", "ffe10000", nil, nil),
    ("html", "3c21444f43545950452068746d6c3e", nil, nil),
]
private let sigExtension: [(String, String, Bool)] = [
    ("89504e470d0a1a0a0000000d49484452", "a.png", true),
    ("89504e470d0a1a0a0000000d49484452", "a.PNG", true),
    ("89504e470d0a1a0a0000000d49484452", "a.jpg", false),
    ("ffd8ffe000104a464946", "photo.jpeg", true),
    ("504b03041400", "report.docx", true),
    ("504b03041400", "x.xlsx", true),
    ("255044462d312e370a", "x.pdf.exe", false),
    ("00000018667479706865696300000000", "IMG_1.HEIF", true),
    ("68656c6c6f20776f726c64", "a.txt", false),
    ("89504e470d0a1a0a0000000d49484452", "noext", false),
    ("49492a000800", "scan.tiff", true),
    ("494433040000", "song.mp3", true),
    ("1f8b0800", "a.tar.gz", true),
]
private let colorHex: [(String, [Double], String)] = [
    ("#000", [0.0, 0.0, 0.0, 1.0], "#000000"),
    ("#fff", [1.0, 1.0, 1.0, 1.0], "#ffffff"),
    ("#f00", [1.0, 0.0, 0.0, 1.0], "#ff0000"),
    ("#0f8", [0.0, 1.0, 0.5333333333333333, 1.0], "#00ff88"),
    ("#336699", [0.2, 0.4, 0.6, 1.0], "#336699"),
    ("#336699cc", [0.2, 0.4, 0.6, 0.8], "#336699cc"),
    ("#ABCDEF", [0.6705882352941176, 0.803921568627451, 0.9372549019607843, 1.0], "#abcdef"),
    ("#12345678", [0.07058823529411765, 0.20392156862745098, 0.33725490196078434, 0.47058823529411764], "#12345678"),
    ("#7f7f7f", [0.4980392156862745, 0.4980392156862745, 0.4980392156862745, 1.0], "#7f7f7f"),
    ("#808080", [0.5019607843137255, 0.5019607843137255, 0.5019607843137255, 1.0], "#808080"),
]
private let colorHexInvalid: [String] = ["336699", "#12", "#12345", "#1234567", "#ggg", "#", "rgb(1,2,3)", "#3366999"]
private let colorToHex: [([Double], String)] = [([0.5, 0.5, 0.5], "#808080"), ([1.2, -0.1, 0.5], "#ff0080"), ([0.001, 0.999, 0.5], "#00ff80"), ([0.2, 0.4, 0.6, 0.5], "#33669980"), ([0.2, 0.4, 0.6, 1.0], "#336699"), ([0.00196078431372549, 0.0058823529411764705, 0.00980392156862745], "#010203")]
private let colorHsl: [(String, [Double])] = [("#000", [0.0, 0.0, 0.0]), ("#fff", [0.0, 0.0, 1.0]), ("#f00", [0.0, 1.0, 0.5]), ("#0f0", [120.0, 1.0, 0.5]), ("#00f", [240.0, 1.0, 0.5]), ("#336699", [210.0, 0.49999999999999994, 0.4]), ("#ff8000", [30.11764705882353, 1.0, 0.5]), ("#808080", [0.0, 0.0, 0.5019607843137255]), ("#c0ffee", [163.80952380952382, 1.0, 0.8764705882352941])]
private let colorHslToRgb: [([Double], [Double])] = [([0.0, 1.0, 0.5], [1.0, 0.0, 0.0]), ([120.0, 1.0, 0.5], [0.0, 1.0, 0.0]), ([240.0, 1.0, 0.5], [0.0, 0.0, 1.0]), ([210.0, 0.5, 0.4], [0.2, 0.4, 0.6000000000000001]), ([360.0, 1.0, 0.5], [1.0, 0.0, 0.0]), ([-30.0, 1.0, 0.5], [1.0, 0.0, 0.5]), ([90.0, 0.0, 0.3], [0.3, 0.3, 0.3]), ([30.0, 1.0, 0.75], [1.0, 0.75, 0.5])]
private let colorOklch: [(String, [Double])] = [
    ("#000", [0.0, 0.0, 0.0]),
    ("#fff", [0.9999999934735462, 3.727399553519285e-08, 0.0]),
    ("#f00", [0.6279553606145516, 0.2576833077361567, 29.233885192342633]),
    ("#0f0", [0.8664396115356694, 0.2948272403370166, 142.49533888780996]),
    ("#00f", [0.4520137183853429, 0.31321437166460114, 264.052020638055]),
    ("#336699", [0.49931445292373877, 0.09866435965710138, 250.43305370947127]),
    ("#808080", [0.5998708017071177, 2.2359581629199253e-08, 0.0]),
    ("#ff8000", [0.7318948427227374, 0.1858032156306402, 52.984679593971286]),
]
private let colorOklchToRgb: [([Double], [Double])] = [
    ([0.627955, 0.257683, 29.2339], [0.9999989995226538, 2.4989239385060646e-06, -3.5938127559420605e-08]),
    ([0.7, 0.1, 200.0], [0.25183094033414793, 0.6942495954401551, 0.7170636897415913]),
    ([0.5, 0.4, 150.0], [-2.5595884674002214, 0.5687880047974224, -0.8622713129274896]),
    ([1.0, 0.0, 0.0], [0.9999999999999999, 0.9999999999999999, 0.9999999999999999]),
    ([0.0, 0.0, 0.0], [0.0, 0.0, 0.0]),
]
private let colorInGamut: [([Double], Bool)] = [([0.25183094033414793, 0.6942495954401551, 0.7170636897415913], true), ([-2.5595884674002214, 0.5687880047974224, -0.8622713129274896], false)]

private func scalars(_ s: String) -> [UInt32] { s.unicodeScalars.map(\.value) }
private func scalars(_ xs: [String]) -> [[UInt32]] { xs.map { scalars($0) } }
private func eventKeys(_ es: [SseEvent]) -> [[UInt32]] { es.flatMap { [scalars($0.event), scalars($0.data), scalars($0.id)] } }
private func near(_ a: Double, _ b: Double, _ tol: Double) -> Bool { abs(a - b) <= tol }
private func near(_ a: [Double], _ b: [Double], _ tol: Double) -> Bool { a.count == b.count && zip(a, b).allSatisfy { near($0, $1, tol) } }
private func bytes(_ hex: String) -> [UInt8] {
    let u = Array(hex.utf8)
    func v(_ c: UInt8) -> UInt8 { c <= 0x39 ? c - 0x30 : (c | 0x20) - 0x61 + 10 }
    return stride(from: 0, to: u.count, by: 2).map { v(u[$0]) << 4 | v(u[$0 + 1]) }
}

func runSseChecks(_ c: inout Checks) {
    for (n, (text, events, retry)) in sseParseVectors.enumerated() {
        var p = SseParser()
        let got = p.feed(text)
        c.eq("sse parse \(n)", eventKeys(events), eventKeys(got))
        c.eq("sse parse retry \(n)", retry, p.retry)
        c.eq("sse parseSse \(n)", eventKeys(events), eventKeys(Sse.parse(text)))
    }
    for (n, (chunks, events)) in sseChunkedVectors.enumerated() {
        var p = SseParser()
        var got: [SseEvent] = []
        for ch in chunks { got += p.feed(ch) }
        c.eq("sse chunked \(n)", eventKeys(events), eventKeys(got))
    }
    for (n, (data, event, id, retry, out)) in sseFormatVectors.enumerated() {
        c.eq("sse format \(n)", scalars(out), scalars(try Sse.format(data, event: event, id: id, retry: retry)))
    }
    for (n, (data, event, id, retry)) in sseFormatInvalid.enumerated() {
        c.throwsError("sse format invalid \(n)", { _ = try Sse.format(data, event: event, id: id, retry: retry) }, where: { $0 is SseError })
    }
    for (text, out) in sseCommentVectors { c.eq("sse comment \(text)", out, try Sse.formatComment(text)) }
    c.throwsError("sse comment newline", { _ = try Sse.formatComment("a\nb") })
    // A CRLF split across two chunks is one line ending; a leading BOM is dropped only on the first chunk.
    var p = SseParser()
    c.eq("sse split crlf", 0, p.feed("\u{FEFF}data: x\r").count)
    c.eq("sse split crlf event", ["x"], p.feed("\n\r\n").map(\.data))
}

func runTextChunkingChecks(_ c: inout Checks) {
    for (n, (text, maxChars, overlap, chunks)) in chunkVectors.enumerated() {
        c.eq("chunk \(n)", scalars(chunks), scalars(try TextChunking.chunk(text, maxChars: maxChars, overlap: overlap)))
    }
    for (text, maxChars, overlap) in chunkInvalid {
        c.throwsError("chunk invalid \(maxChars)/\(overlap)", { _ = try TextChunking.chunk(text, maxChars: maxChars, overlap: overlap) }, where: { $0 is TextChunkingError })
    }
}

func runVectorMathChecks(_ c: inout Checks) {
    for (n, (a, b, dot, cos)) in vectorPairs.enumerated() {
        c.check("vector dot \(n)", (try? near(VectorMath.dot(a, b), dot, 1e-9)) == true)
        c.check("vector cosine \(n)", (try? near(VectorMath.cosine(a, b), cos, 1e-9)) == true)
    }
    for (n, (a, v)) in vectorNorms.enumerated() { c.check("vector norm \(n)", (try? near(VectorMath.norm(a), v, 1e-9)) == true) }
    for (n, (a, v)) in vectorNormalize.enumerated() { c.check("vector normalize \(n)", (try? near(VectorMath.normalize(a), v, 1e-9)) == true) }
    for (n, (q, vs, k, expected)) in vectorTopK.enumerated() {
        let got = (try? VectorMath.topK(q, vs, k: k)) ?? []
        c.eq("vector topK index \(n)", expected.map(\.0), got.map(\.index))
        c.check("vector topK score \(n)", near(expected.map(\.1), got.map(\.score), 1e-9))
    }
    for (n, (q, vs, k, lambda, expected)) in vectorMmr.enumerated() {
        c.eq("vector mmr \(n)", expected, try VectorMath.mmr(q, vs, k: k, lambda: lambda))
    }
    c.throwsError("vector length mismatch", { _ = try VectorMath.cosine([1, 2], [1, 2, 3]) })
    c.throwsError("vector empty", { _ = try VectorMath.dot([], []) })
    c.throwsError("vector normalize zero", { _ = try VectorMath.normalize([0, 0]) })
    c.throwsError("vector topK k=-1", { _ = try VectorMath.topK([1], [[1]], k: -1) })
    c.throwsError("vector mmr lambda=1.5", { _ = try VectorMath.mmr([1], [[1]], k: 1, lambda: 1.5) })
}

func runCircuitBreakerChecks(_ c: inout Checks) {
    for (n, ((threshold, cooldown, halfOpenMax), ops)) in breakerScripts.enumerated() {
        guard var cb = try? CircuitBreaker(failureThreshold: threshold, cooldownMs: cooldown, halfOpenMax: halfOpenMax) else {
            c.check("breaker \(n) init", false); continue
        }
        for (step, (op, now, expected)) in ops.enumerated() {
            let name = "breaker \(n).\(step) \(op)@\(now)"
            switch op {
            case "allow": c.eq(name, expected, cb.allow(now) ? "true" : "false")
            case "success": cb.recordSuccess(now)
            case "failure": cb.recordFailure(now)
            case "state": c.eq(name, expected, cb.state(now).rawValue)
            case "retry_after": c.eq(name, expected, String(cb.retryAfterMs(now)))
            default: c.check("\(name) unknown op", false)
            }
        }
    }
    for (threshold, cooldown, halfOpenMax) in breakerInvalid {
        c.throwsError("breaker invalid \(threshold)/\(cooldown)/\(halfOpenMax)", {
            _ = try CircuitBreaker(failureThreshold: threshold, cooldownMs: cooldown, halfOpenMax: halfOpenMax)
        }, where: { $0 is CircuitBreakerError })
    }
}

func runBusinessDaysChecks(_ c: inout Checks) {
    for (date, holidays, weekend, expected) in bizIs {
        c.eq("biz is \(date) \(weekend)", expected, try BusinessDays.isBusinessDay(date, holidays: holidays, weekend: weekend))
    }
    for (date, n, holidays, weekend, expected) in bizAdd {
        c.eq("biz add \(date) \(n)", expected, try BusinessDays.addBusinessDays(date, n, holidays: holidays, weekend: weekend))
    }
    for (start, end, holidays, weekend, expected) in bizBetween {
        c.eq("biz between \(start) \(end)", expected, try BusinessDays.businessDaysBetween(start, end, holidays: holidays, weekend: weekend))
    }
    for (date, n) in bizInvalid {
        c.throwsError("biz invalid \(date) \(n)", { _ = try BusinessDays.addBusinessDays(date, n) }, where: { $0 is BusinessDaysError })
    }
    c.throwsError("biz all-week weekend", { _ = try BusinessDays.isBusinessDay("2026-10-12", weekend: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]) })
    c.throwsError("biz unknown weekday", { _ = try BusinessDays.isBusinessDay("2026-10-12", weekend: ["XX"]) })
}

func runNaturalSortChecks(_ c: inout Checks) {
    for (n, (input, expected)) in natSorted.enumerated() { c.eq("natsort sorted \(n)", scalars(expected), scalars(NaturalSort.sorted(input))) }
    for (a, b, expected) in natCompare { c.eq("natsort compare \(a) \(b)", expected, NaturalSort.compare(a, b)) }
}

func runFileSignatureChecks(_ c: inout Checks) {
    for (name, hex, mime, ext) in sigDetect {
        let got = FileSignature.detect(bytes(hex))
        c.eq("filesig detect \(name)", mime.map { FileType(mime: $0, ext: ext!) }, got)
    }
    for (hex, filename, expected) in sigExtension {
        c.eq("filesig extension \(filename)", expected, FileSignature.matchesExtension(bytes(hex), filename: filename))
    }
}

func runColorConvertChecks(_ c: inout Checks) {
    for (hex, channels, roundTrip) in colorHex {
        if let v = try? ColorConvert.parseHex(hex) {
            c.check("color parseHex \(hex)", near([v.r, v.g, v.b, v.a], channels, 1e-6))
            c.eq("color roundtrip \(hex)", roundTrip, ColorConvert.toHex(v.r, v.g, v.b, v.a))
        } else { c.check("color parseHex \(hex)", false) }
    }
    for hex in colorHexInvalid { c.throwsError("color invalid \(hex)", { _ = try ColorConvert.parseHex(hex) }, where: { $0 is ColorError }) }
    for (v, expected) in colorToHex {
        c.eq("color toHex \(v)", expected, v.count == 4 ? ColorConvert.toHex(v[0], v[1], v[2], v[3]) : ColorConvert.toHex(v[0], v[1], v[2]))
    }
    for (hex, expected) in colorHsl {
        guard let rgb = try? ColorConvert.parseHex(hex) else { c.check("color hsl \(hex)", false); continue }
        let h = ColorConvert.rgbToHsl(rgb.r, rgb.g, rgb.b)
        c.check("color rgbToHsl \(hex)", near([h.h, h.s, h.l], expected, 1e-6))
    }
    for (v, expected) in colorHslToRgb {
        let r = ColorConvert.hslToRgb(v[0], v[1], v[2])
        c.check("color hslToRgb \(v)", near([r.r, r.g, r.b], expected, 1e-6))
    }
    for (hex, expected) in colorOklch {
        guard let rgb = try? ColorConvert.parseHex(hex) else { c.check("color oklch \(hex)", false); continue }
        let o = ColorConvert.rgbToOklch(rgb.r, rgb.g, rgb.b)
        c.check("color rgbToOklch \(hex)", near([o.l, o.c, o.h], expected, 1e-6))
    }
    for (v, expected) in colorOklchToRgb {
        let r = ColorConvert.oklchToRgb(v[0], v[1], v[2])
        c.check("color oklchToRgb \(v)", near([r.r, r.g, r.b], expected, 1e-6))
    }
    for (v, expected) in colorInGamut { c.eq("color inGamut \(v)", expected, ColorConvert.inGamut(v[0], v[1], v[2])) }
}

func runWave9Checks(_ c: inout Checks) {
    runSseChecks(&c)
    runTextChunkingChecks(&c)
    runVectorMathChecks(&c)
    runCircuitBreakerChecks(&c)
    runBusinessDaysChecks(&c)
    runNaturalSortChecks(&c)
    runFileSignatureChecks(&c)
    runColorConvertChecks(&c)
}
