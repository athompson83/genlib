// SPDX-License-Identifier: Apache-2.0
// Thin AcroForm helpers over @cantoo/pdf-lib (maintained MIT fork of pdf-lib).
import {
  PDFDocument,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFField,
} from '@cantoo/pdf-lib';

export type FieldKind = 'text' | 'checkbox' | 'choice' | 'radio' | 'other';
export interface FormField {
  name: string;
  kind: FieldKind;
  value: string | boolean | string[] | undefined;
  options: string[];
}
export type FieldValue = string | boolean | string[];

function describe(field: PDFField): FormField {
  const name = field.getName();
  if (field instanceof PDFTextField) return { name, kind: 'text', value: field.getText(), options: [] };
  if (field instanceof PDFCheckBox) return { name, kind: 'checkbox', value: field.isChecked(), options: [] };
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return { name, kind: 'choice', value: field.getSelected(), options: field.getOptions() };
  }
  if (field instanceof PDFRadioGroup) {
    return { name, kind: 'radio', value: field.getSelected(), options: field.getOptions() };
  }
  return { name, kind: 'other', value: undefined, options: [] };
}

/** List the AcroForm fields of a PDF (empty array when it has no form). */
export async function listFields(pdf: Uint8Array): Promise<FormField[]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getForm().getFields().map(describe);
}

/**
 * Fill fields by name and return the new PDF bytes. Unknown names throw
 * (getField throws), and choice values must be one of the field's options.
 */
export async function fillForm(
  pdf: Uint8Array,
  values: Record<string, FieldValue>,
  opts: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getField(name);
    if (field instanceof PDFTextField) field.setText(String(value));
    else if (field instanceof PDFCheckBox) (value === true ? field.check() : field.uncheck());
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const wanted = Array.isArray(value) ? value : [String(value)];
      const allowed = field.getOptions();
      for (const v of wanted) if (!allowed.includes(v)) throw new Error(`${v} is not an option of ${name}`);
      field.select(wanted);
    } else if (field instanceof PDFRadioGroup) field.select(String(value));
    else throw new Error(`unsupported field type for ${name}`);
  }
  if (opts.flatten) form.flatten(); // also updates appearances first
  return doc.save();
}
