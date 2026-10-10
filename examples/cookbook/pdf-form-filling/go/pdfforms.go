// SPDX-License-Identifier: Apache-2.0

// Package pdfforms is a thin AcroForm wrapper over pdfcpu: list fields and
// fill them by name through pdfcpu's JSON form export/fill round trip.
// pdfcpu has no flatten operation; Lock marks fields read-only instead.
package pdfforms

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"slices"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Field describes one AcroForm field.
type Field struct {
	Name    string
	Kind    string // "text", "checkbox", "choice", "radio", "date" or "other"
	Value   string
	Options []string
}

func conf() *model.Configuration {
	c := model.NewDefaultConfiguration()
	c.ValidationMode = model.ValidationRelaxed
	return c
}

// ListFields returns the form fields of the PDF read from rs.
func ListFields(ctx context.Context, rs io.ReadSeeker) ([]Field, error) {
	fg, err := api.ExportForm(ctx, rs, "input.pdf", conf())
	if err != nil {
		return nil, err
	}
	var out []Field
	for _, f := range fg.Forms {
		for _, t := range f.TextFields {
			out = append(out, Field{Name: t.Name, Kind: "text", Value: t.Value})
		}
		for _, d := range f.DateFields {
			out = append(out, Field{Name: d.Name, Kind: "date", Value: d.Value})
		}
		for _, c := range f.CheckBoxes {
			out = append(out, Field{Name: c.Name, Kind: "checkbox", Value: fmt.Sprint(c.Value)})
		}
		for _, c := range f.ComboBoxes {
			out = append(out, Field{Name: c.Name, Kind: "choice", Value: c.Value, Options: c.Options})
		}
		for _, l := range f.ListBoxes {
			v := ""
			if len(l.Values) > 0 {
				v = l.Values[0]
			}
			out = append(out, Field{Name: l.Name, Kind: "choice", Value: v, Options: l.Options})
		}
		for _, r := range f.RadioButtonGroups {
			out = append(out, Field{Name: r.Name, Kind: "radio", Value: r.Value, Options: r.Options})
		}
	}
	return out, nil
}

// Fill sets field values by name and writes the filled PDF to w.
// Text, date, choice and radio fields take strings; checkboxes take bool.
// Unknown names and invalid choice options return an error.
func Fill(ctx context.Context, src []byte, w io.Writer, values map[string]any) error {
	fg, err := api.ExportForm(ctx, bytes.NewReader(src), "input.pdf", conf())
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for i := range fg.Forms {
		f := &fg.Forms[i]
		for _, t := range f.TextFields {
			if v, ok := values[t.Name]; ok {
				t.Value, seen[t.Name] = fmt.Sprint(v), true
			}
		}
		for _, d := range f.DateFields {
			if v, ok := values[d.Name]; ok {
				d.Value, seen[d.Name] = fmt.Sprint(v), true
			}
		}
		for _, c := range f.CheckBoxes {
			if v, ok := values[c.Name]; ok {
				b, isBool := v.(bool)
				if !isBool {
					return fmt.Errorf("checkbox %s needs a bool, got %T", c.Name, v)
				}
				c.Value, seen[c.Name] = b, true
			}
		}
		for _, c := range f.ComboBoxes {
			if v, ok := values[c.Name]; ok {
				s := fmt.Sprint(v)
				if !c.Editable && !slices.Contains(c.Options, s) {
					return fmt.Errorf("%q is not an option of %s", s, c.Name)
				}
				c.Value, seen[c.Name] = s, true
			}
		}
		for _, l := range f.ListBoxes {
			if v, ok := values[l.Name]; ok {
				s := fmt.Sprint(v)
				if !slices.Contains(l.Options, s) {
					return fmt.Errorf("%q is not an option of %s", s, l.Name)
				}
				l.Values, seen[l.Name] = []string{s}, true
			}
		}
		for _, r := range f.RadioButtonGroups {
			if v, ok := values[r.Name]; ok {
				s := fmt.Sprint(v)
				if !slices.Contains(r.Options, s) {
					return fmt.Errorf("%q is not an option of %s", s, r.Name)
				}
				r.Value, seen[r.Name] = s, true
			}
		}
	}
	for name := range values {
		if !seen[name] {
			return fmt.Errorf("unknown form field: %s", name)
		}
	}
	data, err := json.Marshal(fg)
	if err != nil {
		return err
	}
	return api.FillForm(ctx, bytes.NewReader(src), bytes.NewReader(data), w, conf())
}

// Lock makes the named fields (or all fields when names is empty) read-only.
// This is pdfcpu's closest equivalent to flattening; the fields remain in the file.
func Lock(ctx context.Context, src []byte, w io.Writer, names ...string) error {
	return api.LockFormFields(ctx, bytes.NewReader(src), w, names, conf())
}
