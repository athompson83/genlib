// SPDX-License-Identifier: Apache-2.0
import { useId, useMemo, useRef, useState, useEffect } from 'react';
import { JsonForms } from '@jsonforms/react';
import { createAjv, type JsonSchema, type UISchemaElement, type JsonFormsRendererRegistryEntry } from '@jsonforms/core';
import { vanillaCells, vanillaRenderers } from '@jsonforms/vanilla-renderers';

export function createFormValidator(schema: JsonSchema) {
  const validate = createAjv({ allErrors: true }).compile(schema);
  return (data: unknown) => ({ valid: !!validate(data), errors: (validate.errors ?? []).map(error => ({ path: error.instancePath || '/', message: error.message ?? 'Invalid value' })) });
}

export interface SchemaFormProps<T> {
  schema: JsonSchema;
  uischema?: UISchemaElement;
  data: T;
  onChange: (data: T) => void;
  onSubmit: (data: T, signal: AbortSignal) => Promise<void>;
  renderers?: JsonFormsRendererRegistryEntry[];
  submitLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function SchemaForm<T>({ schema, uischema, data, onChange, onSubmit, renderers = vanillaRenderers,
  submitLabel = 'Save', className = 'genlib-form', disabled = false }: SchemaFormProps<T>) {
  const id = useId(), validate = useMemo(() => createFormValidator(schema), [schema]);
  const [submitted, setSubmitted] = useState(false), [saving, setSaving] = useState(false), [failure, setFailure] = useState<string>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const result = validate(data);
  return <form className={className} noValidate aria-busy={saving} aria-describedby={submitted && !result.valid ? `${id}-errors` : undefined}
    onSubmit={async event => {
      event.preventDefault(); setSubmitted(true); setFailure(undefined);
      if (!result.valid || request.current || disabled) return;
      const controller = new AbortController(); request.current = controller; setSaving(true);
      try { await onSubmit(structuredClone(data), controller.signal); }
      catch (error) { if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Unable to save.'); }
      finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setSaving(false); }
    }}>
    {submitted && !result.valid && <div id={`${id}-errors`} role="alert"><p>Correct these fields before saving.</p>
      <ul>{result.errors.map((error, index) => <li key={index}>{error.path}: {error.message}</li>)}</ul></div>}
    {failure && <p role="alert">{failure}</p>}
    <JsonForms schema={schema} uischema={uischema} data={data} renderers={renderers} cells={vanillaCells}
      readonly={disabled || saving} validationMode={submitted ? 'ValidateAndShow' : 'ValidateAndHide'}
      onChange={state => onChange(state.data as T)} />
    <button type="submit" disabled={disabled || saving}>{saving ? 'Saving…' : submitLabel}</button>
  </form>;
}
