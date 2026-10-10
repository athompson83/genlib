// SPDX-License-Identifier: Apache-2.0

// Package csvsafe writes and parses RFC 4180 CSV with spreadsheet
// formula-injection protection. Write prefixes fields that start with
// = + - @ TAB or CR with a single quote (OWASP CSV injection guidance) unless
// neutralization is off; Parse never adds or removes that prefix.
package csvsafe

import (
	"errors"
	"fmt"
	"strings"
)

func field(value string, neutralize bool) string {
	if neutralize && value != "" && strings.ContainsRune("=+-@\t\r", rune(value[0])) {
		value = "'" + value
	}
	if strings.ContainsAny(value, ",\"\r\n") || strings.HasPrefix(value, " ") || strings.HasSuffix(value, " ") {
		return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
	}
	return value
}

// Write serializes rows; every record ends with CRLF. An empty row list gives "".
func Write(rows [][]string, neutralizeFormulas bool) string {
	var b strings.Builder
	for _, row := range rows {
		for i, v := range row {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(field(v, neutralizeFormulas))
		}
		b.WriteString("\r\n")
	}
	return b.String()
}

// Parse reads CRLF or LF records, strips one leading UTF-8 BOM and returns the
// rows. A final record end does not add an empty row.
func Parse(text string) ([][]string, error) {
	text = strings.TrimPrefix(text, "\ufeff")
	rows := [][]string{}
	var row []string
	i, n := 0, len(text)
	for i < n {
		var value string
		if text[i] == '"' {
			i++
			var b strings.Builder
			for {
				j := strings.IndexByte(text[i:], '"')
				if j < 0 {
					return nil, errors.New("csv: unterminated quoted field")
				}
				b.WriteString(text[i : i+j])
				i += j + 1
				if i < n && text[i] == '"' {
					b.WriteByte('"')
					i++
					continue
				}
				break
			}
			value = b.String()
			if i < n && text[i] != ',' && text[i] != '\r' && text[i] != '\n' {
				return nil, fmt.Errorf("csv: unexpected character after closing quote at offset %d", i)
			}
		} else {
			j := i
			for j < n && text[j] != ',' && text[j] != '\r' && text[j] != '\n' {
				if text[j] == '"' {
					return nil, fmt.Errorf("csv: unexpected \" in unquoted field at offset %d", j)
				}
				j++
			}
			value, i = text[i:j], j
		}
		row = append(row, value)
		if i >= n {
			rows = append(rows, row)
			break
		}
		switch text[i] {
		case ',':
			i++
			if i >= n {
				rows = append(rows, append(row, ""))
			}
			continue
		case '\r':
			if i+1 >= n || text[i+1] != '\n' {
				return nil, fmt.Errorf("csv: bare CR at offset %d", i)
			}
			i += 2
		default:
			i++
		}
		rows = append(rows, row)
		row = nil
	}
	return rows, nil
}
