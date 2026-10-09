"use client";

// Genlib original source, Apache-2.0.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

export type FieldName<T> = Extract<keyof T, string>;
export type ValidationErrors<T> = Partial<Record<FieldName<T>, string>>;
export type SubmissionResult<T> =
  | { ok: true }
  | { ok: false; fieldErrors?: ValidationErrors<T>; formError?: string };

export interface FieldBinding {
  id: string;
  name: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}
export interface ValidatedFormContext<T extends object> {
  values: T;
  errors: ValidationErrors<T>;
  isSubmitting: boolean;
  setValue: <K extends FieldName<T>>(name: K, value: T[K]) => void;
  field: (name: FieldName<T>, hintId?: string) => FieldBinding;
  reset: () => void;
}
export interface ValidatedFormProps<T extends object> {
  initialValues: T;
  formLabel: string;
  validate: (values: T) => ValidationErrors<T> | void | Promise<ValidationErrors<T> | void>;
  onSubmit: (values: T) => SubmissionResult<T> | void | Promise<SubmissionResult<T> | void>;
  children: (context: ValidatedFormContext<T>) => ReactNode;
  fieldLabels?: Partial<Record<FieldName<T>, string>>;
  submitLabel?: string;
  submittingLabel?: string;
  successMessage?: string;
  submissionErrorMessage?: string;
  className?: string;
}

function normalizeErrors<T extends object>(raw: ValidationErrors<T> | void, values: T): ValidationErrors<T> {
  const errors: ValidationErrors<T> = Object.create(null) as ValidationErrors<T>;
  for (const [name, message] of Object.entries(raw ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(values, name) || typeof message !== "string") {
      throw new Error("Validation returned an invalid field error.");
    }
    if (message.trim()) errors[name as FieldName<T>] = message.trim();
  }
  return errors;
}

/** Accessible form state and submission lifecycle; validators and persistence are explicit adapters. */
export function ValidatedForm<T extends object>({
  initialValues,
  formLabel,
  validate,
  onSubmit,
  children,
  fieldLabels,
  submitLabel = "Save",
  submittingLabel = "Saving…",
  successMessage = "Saved.",
  submissionErrorMessage = "Something went wrong. Please try again.",
  className = "",
}: ValidatedFormProps<T>) {
  const id = useId();
  const initialRef = useRef(initialValues);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<T>(() => ({ ...initialValues }));
  const [errors, setErrors] = useState<ValidationErrors<T>>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const errorNames = Object.keys(errors) as FieldName<T>[];
  const hasErrors = errorNames.length > 0 || Boolean(formError);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (attempt > 0 && hasErrors) summaryRef.current?.focus();
  }, [attempt, hasErrors]);

  function fieldId(name: FieldName<T>) { return `${id}-field-${encodeURIComponent(name)}`; }
  function errorId(name: FieldName<T>) { return `${id}-error-${encodeURIComponent(name)}`; }

  function setValue<K extends FieldName<T>>(name: K, value: T[K]) {
    if (pendingRef.current) return;
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
    setFormError("");
    setSucceeded(false);
  }

  function reset() {
    if (pendingRef.current) return;
    setValues({ ...initialRef.current });
    setErrors({});
    setFormError("");
    setSucceeded(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // State updates are asynchronous; this synchronous guard also blocks same-tick double submits.
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsSubmitting(true);
    setSucceeded(false);
    setErrors({});
    setFormError("");
    const snapshot = values;
    try {
      const validationErrors = normalizeErrors(await validate(snapshot), snapshot);
      if (!mountedRef.current) return;
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      const result = await onSubmit(snapshot);
      if (!mountedRef.current) return;
      if (result && !result.ok) {
        const submissionErrors = normalizeErrors(result.fieldErrors, snapshot);
        setErrors(submissionErrors);
        const message = result.formError?.trim() ?? "";
        setFormError(message || (Object.keys(submissionErrors).length === 0 ? submissionErrorMessage : ""));
      } else {
        setSucceeded(true);
      }
    } catch {
      // Unexpected exception text may contain implementation details or sensitive data.
      if (mountedRef.current) setFormError(submissionErrorMessage);
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) {
        setIsSubmitting(false);
        setAttempt((previous) => previous + 1);
      }
    }
  }

  const context: ValidatedFormContext<T> = {
    values,
    errors,
    isSubmitting,
    setValue,
    reset,
    field(name, hintId) {
      const description = [hintId, errors[name] ? errorId(name) : undefined].filter(Boolean).join(" ");
      return { id: fieldId(name), name, "aria-invalid": errors[name] ? true : undefined, "aria-describedby": description || undefined };
    },
  };

  return (
    <form className={`gl-form ${className}`.trim()} aria-label={formLabel} aria-busy={isSubmitting} noValidate onSubmit={handleSubmit}>
      {hasErrors && (
        <div className="gl-form__summary" ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby={`${id}-summary-title`}>
          <h2 id={`${id}-summary-title`}>Please review the form</h2>
          {formError && <p>{formError}</p>}
          {errorNames.length > 0 && (
            <ul>
              {errorNames.map((name) => (
                <li key={name}>
                  <a
                    href={`#${fieldId(name)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      summaryRef.current?.ownerDocument.getElementById(fieldId(name))?.focus();
                    }}
                  >
                    <span id={errorId(name)}>{fieldLabels?.[name] ?? name}: {errors[name]}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset className="gl-form__fields" disabled={isSubmitting}>
        <legend className="gl-form__sr-only">{formLabel}</legend>
        {children(context)}
        <div className="gl-form__actions">
          <button className="gl-form__submit" type="submit" disabled={isSubmitting}>{isSubmitting ? submittingLabel : submitLabel}</button>
        </div>
      </fieldset>
      <p className="gl-form__status" role="status" aria-live="polite">
        {isSubmitting ? submittingLabel : succeeded ? successMessage : ""}
      </p>
    </form>
  );
}
