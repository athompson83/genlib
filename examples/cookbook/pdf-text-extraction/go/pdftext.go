// SPDX-License-Identifier: Apache-2.0

// Package pdftext extracts per-page plain text and Info metadata with
// github.com/ledongthuc/pdf (BSD-3-Clause fork of rsc.io/pdf).
package pdftext

import (
	"bytes"
	"fmt"

	"github.com/ledongthuc/pdf"
)

// Result holds per-page text (index 0 is page 1) and Info dictionary entries.
type Result struct {
	Pages    []string
	Metadata map[string]string
}

// Extract parses data and returns text per page. Image-only pages yield ""
// (OCR is out of scope). Encrypted PDFs are rejected by the parser.
func Extract(data []byte) (res Result, err error) {
	// The parser panics on some malformed inputs; convert that to an error.
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("pdf parse failed: %v", r)
		}
	}()
	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return Result{}, err
	}
	res.Metadata = map[string]string{}
	info := r.Trailer().Key("Info")
	for _, k := range []string{"Title", "Author", "Subject", "Creator", "Producer"} {
		if v := info.Key(k).Text(); v != "" {
			res.Metadata[k] = v
		}
	}
	for i := 1; i <= r.NumPage(); i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			res.Pages = append(res.Pages, "")
			continue
		}
		text, err := p.GetPlainText(nil)
		if err != nil {
			return Result{}, fmt.Errorf("page %d: %w", i, err)
		}
		res.Pages = append(res.Pages, text)
	}
	return res, nil
}
