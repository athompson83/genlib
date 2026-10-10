// SPDX-License-Identifier: Apache-2.0

// Package docxdocs is a Genlib cookbook wrapper: create DOCX files with
// github.com/gomutex/godocx (MIT), fill {placeholders} with
// github.com/lukasjarosch/go-docx (MIT, handles placeholders split across runs and
// XML-escapes values) and extract plain text with the standard library.
// The libraries own the OOXML writing; this file only wires them together.
package docxdocs

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/gomutex/godocx"
	templ "github.com/lukasjarosch/go-docx"
)

// CreateReport builds a DOCX with a heading, a paragraph and a table (first row = header).
func CreateReport(title, body string, rows [][]string) ([]byte, error) {
	doc, err := godocx.NewDocument()
	if err != nil {
		return nil, err
	}
	if _, err := doc.AddHeading(title, 1); err != nil {
		return nil, err
	}
	doc.AddParagraph(body)
	table := doc.AddTable()
	table.Style("TableGrid")
	for r, cells := range rows {
		row := table.AddRow()
		for _, text := range cells {
			p := row.AddCell().AddEmptyPara()
			p.AddText(text).Bold(r == 0)
		}
	}
	var buf bytes.Buffer
	if err := doc.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ReplacePlaceholders replaces {key} placeholders (go-docx's default delimiters) in the
// document body, headers and footers. Values are XML-escaped by the library.
func ReplacePlaceholders(data []byte, values map[string]string) ([]byte, error) {
	doc, err := templ.OpenBytes(data)
	if err != nil {
		return nil, err
	}
	defer doc.Close()
	m := templ.PlaceholderMap{}
	for k, v := range values {
		m[k] = v
	}
	if err := doc.ReplaceAll(m); err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := doc.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

const maxDocumentXML = 64 << 20 // refuse zip bombs when reading word/document.xml

// ExtractText returns the text of word/document.xml, one paragraph per line, table cells
// separated by tabs. Read-only scan of w:t, w:tab, w:br, w:p and w:tc elements.
func ExtractText(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}
	for _, f := range zr.File {
		if f.Name != "word/document.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		defer rc.Close()
		return scanText(io.LimitReader(rc, maxDocumentXML))
	}
	return "", errors.New("docxdocs: word/document.xml not found")
}

func scanText(r io.Reader) (string, error) {
	const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
	dec := xml.NewDecoder(r)
	var out, line strings.Builder
	inText := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return strings.TrimRight(out.String(), "\n"), nil
		}
		if err != nil {
			return "", fmt.Errorf("docxdocs: parse document.xml: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Space != w {
				continue
			}
			switch t.Name.Local {
			case "t":
				inText = true
			case "tab":
				line.WriteByte('\t')
			case "br":
				line.WriteByte('\n')
			}
		case xml.EndElement:
			if t.Name.Space != w {
				continue
			}
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				out.WriteString(line.String())
				out.WriteByte('\n')
				line.Reset()
			case "tc":
				s := strings.TrimRight(out.String(), "\n")
				out.Reset()
				out.WriteString(s)
				out.WriteByte('\t')
			case "tr":
				s := strings.TrimRight(out.String(), "\t")
				out.Reset()
				out.WriteString(s)
				out.WriteByte('\n')
			}
		case xml.CharData:
			if inText {
				line.Write(t)
			}
		}
	}
}
