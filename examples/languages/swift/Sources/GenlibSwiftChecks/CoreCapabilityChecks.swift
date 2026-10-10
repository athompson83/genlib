// SPDX-License-Identifier: Apache-2.0
import GenlibSwift

func runCsvSafeChecks(_ c: inout Checks) {
    let rows = [["id", "name", "note"], ["1", "Ada, Lovelace", "said \"hi\""], ["2", "=SUM(A1)", "line1\nline2"], ["3", " padded", "-5"]]
    let expected = "id,name,note\r\n1,\"Ada, Lovelace\",\"said \"\"hi\"\"\"\r\n2,'=SUM(A1),\"line1\nline2\"\r\n3,\" padded\",'-5\r\n"
    c.check("csv write vector", Array(CsvSafe.writeCsv(rows).utf8) == Array(expected.utf8))
    c.check("csv neutralization off", Array(CsvSafe.writeCsv([["=1"]], neutralizeFormulas: false).utf8) == Array("=1\r\n".utf8))
    c.eq("csv empty rows", "", CsvSafe.writeCsv([]))
    c.eq("csv parse vector", [["a", "b"], ["x,1", "say \"hi\""], ["multi\nline", ""]],
         try CsvSafe.parseCsv("a,b\r\n\"x,1\",\"say \"\"hi\"\"\"\n\"multi\nline\",\n"))
    c.eq("csv parse BOM", [["a"]], try CsvSafe.parseCsv("\u{FEFF}a\n"))
    c.eq("csv parse empty", [], try CsvSafe.parseCsv(""))
    for bad in ["a,\"b", "a\"b", "\"a\"x"] {
        c.throwsError("csv parse rejects \(bad.debugDescription)", { _ = try CsvSafe.parseCsv(bad) }, where: { $0 is CsvError })
    }
    c.eq("csv round trip", rows, try CsvSafe.parseCsv(CsvSafe.writeCsv(rows, neutralizeFormulas: false)))
}

func runMoneyChecks(_ c: inout Checks) {
    c.eq("toMinor 12.34 USD", 1234, try Money.toMinor("12.34", currency: "USD"))
    c.eq("toMinor -0.5 USD", -50, try Money.toMinor("-0.5", currency: "USD"))
    c.eq("toMinor 1000 JPY", 1000, try Money.toMinor("1000", currency: "JPY"))
    c.eq("toMinor 1.234 BHD", 1234, try Money.toMinor("1.234", currency: "BHD"))
    c.eq("toMinor 7 USD", 700, try Money.toMinor("7", currency: "USD"))
    for (amount, currency) in [("1.5", "JPY"), ("12.345", "USD"), ("1,000.00", "USD"), (".5", "USD"), ("5.", "USD"), ("1e3", "USD"),
                               (" 1", "USD"), ("+1", "USD"), ("12", "XXX"), ("12", "usd"), ("99999999999999999999", "USD")] {
        c.throwsError("toMinor rejects \(amount) \(currency)", { _ = try Money.toMinor(amount, currency: currency) }, where: { $0 is MoneyError })
    }
    c.eq("format 1234 USD", "12.34", try Money.formatMinor(1234, currency: "USD"))
    c.eq("format -5 USD", "-0.05", try Money.formatMinor(-5, currency: "USD"))
    c.eq("format 500 JPY", "500", try Money.formatMinor(500, currency: "JPY"))
    c.eq("format 1 BHD", "0.001", try Money.formatMinor(1, currency: "BHD"))
    c.eq("format 0 EUR", "0.00", try Money.formatMinor(0, currency: "EUR"))
    c.eq("format Int64.min USD", "-92233720368547758.08", try Money.formatMinor(Int64.min, currency: "USD"))
    c.eq("applyRate 1999 0.0825", 165, try Money.applyRate(1999, rate: "0.0825"))
    c.eq("applyRate 25 0.5", 12, try Money.applyRate(25, rate: "0.5"))
    c.eq("applyRate 35 0.5", 18, try Money.applyRate(35, rate: "0.5"))
    c.eq("applyRate -25 0.5", -12, try Money.applyRate(-25, rate: "0.5"))
    c.eq("applyRate 1000 1.07", 1070, try Money.applyRate(1000, rate: "1.07"))
    c.eq("applyRate 25 -0.5", -12, try Money.applyRate(25, rate: "-0.5"))
    c.throwsError("applyRate 10 fraction digits", { _ = try Money.applyRate(1, rate: "0.0000000001") })
    c.throwsError("applyRate exponent", { _ = try Money.applyRate(1, rate: "1e3") })
    c.throwsError("applyRate overflow", { _ = try Money.applyRate(Int64.max, rate: "2") }, where: { $0 as? MoneyError == .overflow })
    c.eq("allocate 100 [1,1,1]", [34, 33, 33], try Money.allocate(100, ratios: [1, 1, 1]))
    c.eq("allocate 5 [3,7]", [2, 3], try Money.allocate(5, ratios: [3, 7]))
    c.eq("allocate -100 [1,1,1]", [-34, -33, -33], try Money.allocate(-100, ratios: [1, 1, 1]))
    c.eq("allocate 1000 [0,1]", [0, 1000], try Money.allocate(1000, ratios: [0, 1]))
    c.eq("allocate 1 [3,7]", [0, 1], try Money.allocate(1, ratios: [3, 7]))
    c.eq("allocate 1 [0,1,1]", [0, 1, 0], try Money.allocate(1, ratios: [0, 1, 1]))
    c.eq("allocate 10 [1,8]", [1, 9], try Money.allocate(10, ratios: [1, 8]))
    c.eq("allocate Int64.min sums", [Int64.min / 2, Int64.min / 2], try Money.allocate(Int64.min, ratios: [1, 1]))
    c.throwsError("allocate empty", { _ = try Money.allocate(1, ratios: []) })
    c.throwsError("allocate zero sum", { _ = try Money.allocate(1, ratios: [0, 0]) })
    c.throwsError("allocate negative ratio", { _ = try Money.allocate(1, ratios: [2, -1]) })
}

func runSignedCursorChecks(_ c: inout Checks) {
    let secret = Array("0123456789abcdef0123456789abcdef".utf8)
    let values = ["2026-10-01T12:00:00Z", "42"]
    let token = "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc"
    c.eq("cursor encode vector", token, try SignedCursors.encodeCursor(values, secret: secret, expiresAt: 1_790_000_000))
    c.eq("cursor decode vector", values, try SignedCursors.decodeCursor(token, secret: secret, now: 1_789_999_999))
    c.throwsError("cursor expired", { _ = try SignedCursors.decodeCursor(token, secret: secret, now: 1_790_000_000) },
                  where: { $0 as? CursorError == .expired })
    for last in ["d", "A", "g", "-"] {
        let tampered = String(token.dropLast()) + last
        c.throwsError("cursor tampered signature \(last)", { _ = try SignedCursors.decodeCursor(tampered, secret: secret, now: 1) },
                      where: { $0 as? CursorError == .badSignature })
    }
    let isMalformed: (Error) -> Bool = { if case .malformed? = $0 as? CursorError { return true }; return false }
    for bad in ["abc", ".abc", token + "=", token.replacing("Wgo0", with: "Wg+0")] {
        c.throwsError("cursor malformed \(bad.prefix(12))", { _ = try SignedCursors.decodeCursor(bad, secret: secret, now: 1) }, where: isMalformed)
    }
    c.throwsError("cursor other secret", { _ = try SignedCursors.decodeCursor(token, secret: Array("fedcba9876543210fedcba9876543210".utf8), now: 1) },
                  where: { $0 as? CursorError == .badSignature })
    let short = Array(secret.prefix(31))
    let isArgument: (Error) -> Bool = { if case .invalidArgument? = $0 as? CursorError { return true }; return false }
    c.throwsError("cursor encode short secret", { _ = try SignedCursors.encodeCursor(values, secret: short, expiresAt: 1) }, where: isArgument)
    c.throwsError("cursor decode short secret", { _ = try SignedCursors.decodeCursor(token, secret: short, now: 1) }, where: isArgument)
    c.throwsError("cursor no values", { _ = try SignedCursors.encodeCursor([], secret: secret, expiresAt: 1) }, where: isArgument)
    c.throwsError("cursor 17 values", { _ = try SignedCursors.encodeCursor(Array(repeating: "a", count: 17), secret: secret, expiresAt: 1) }, where: isArgument)
    c.throwsError("cursor newline value", { _ = try SignedCursors.encodeCursor(["a\nb"], secret: secret, expiresAt: 1) }, where: isArgument)
    c.throwsError("cursor CRLF value", { _ = try SignedCursors.encodeCursor(["a\r\nb"], secret: secret, expiresAt: 1) }, where: isArgument)
    c.throwsError("cursor zero expiry", { _ = try SignedCursors.encodeCursor(["a"], secret: secret, expiresAt: 0) }, where: isArgument)
}

func runIcsEventsChecks(_ c: inout Checks) {
    let expected = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\nSUMMARY:Office hours\\; Q&A\\, live\r\nDESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n é\\, then more words so the second line also runs past seventy-four octets\r\n  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    let first = IcsEvent(uid: "evt-1@example.com", dtstamp: "2026-10-10T12:00:00Z", start: "2026-10-20T15:00:00Z", end: "2026-10-20T16:30:00Z",
                         summary: "Office hours; Q&A, live",
                         description: "Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again.",
                         location: "Room 4, Main St.", url: "https://example.com/e/1")
    let second = IcsEvent(uid: "evt-2@example.com", dtstamp: "2026-10-10T12:00:00Z", start: "2026-12-24", end: "2026-12-25", summary: "Holiday")
    do {
        let out = try IcsEvents.icsCalendar([first, second], prodId: "-//Acme//Genlib//EN")
        c.check("ics vector bytes", Array(out.utf8) == Array(expected.utf8))
        if Array(out.utf8) != Array(expected.utf8) { print(out.debugDescription) }
        let physical = out.utf8.split(separator: 0x0A).map { $0.count - 1 }
        c.check("ics lines at most 75 octets", physical.allSatisfy { $0 <= 75 })
    } catch {
        c.check("ics vector (error \(error))", false)
    }
    var bad: [(String, IcsEvent)] = []
    var e = first; e.end = e.start; bad.append(("end equals start", e))
    e = first; e.start = "2026-10-20"; bad.append(("date start with UTC end", e))
    e = first; e.uid = ""; bad.append(("empty uid", e))
    e = first; e.url = "ftp://x"; bad.append(("ftp url", e))
    e = first; e.dtstamp = "2026-10-10"; bad.append(("date dtstamp", e))
    e = first; e.summary = ""; bad.append(("empty summary", e))
    e = first; e.start = "2026-13-01T00:00:00Z"; bad.append(("month 13", e))
    for (name, event) in bad {
        c.throwsError("ics rejects \(name)", { _ = try IcsEvents.icsCalendar([event], prodId: "p") }, where: { $0 is IcsError })
    }
    c.eq("ics escape", "a\\\\b\\;c\\,d\\ne\\nf", IcsEvents.escapeText("a\\b;c,d\r\ne\nf"))
}

