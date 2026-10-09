# Validated form with submission handling

## Exports and requirements

`ValidatedForm<T>`, `ValidatedFormProps<T>`, `ValidatedFormContext<T>`, `FieldBinding`, `FieldName<T>`, `ValidationErrors<T>`, and `SubmissionResult<T>` are exported by `validated-form/ValidatedForm.tsx`. Use the target's React 18 or 19 and TypeScript/TSX pipeline. The file has a `"use client"` boundary and adds no runtime dependency.

Import `theme-tokens/theme.css`, then `validated-form/validated-form.css`, in the application's global CSS entry. Styling is scoped to `.gl-form`; `.gl-form__field` provides an optional consistent field layout.

## Required adapters

- `initialValues: T` initializes state once. Use plain objects and immutable values. When selecting a different record, remount with a distinct React `key`. `reset()` restores the original initial values.
- `formLabel: string` names the form and its field group.
- `validate(values)` returns field messages or nothing, synchronously or asynchronously. Error keys must match own top-level properties of the values object. Invalid error mappings fail the attempt with the configured generic message.
- `onSubmit(values)` performs the application operation. Return nothing or `{ ok: true }` for success. Return `{ ok: false, fieldErrors?, formError? }` for intentionally user-visible errors. Unexpected thrown errors use the generic message, never raw exception text.
- `children(context)` renders the application's fields. The form adds its own submit button and status region.

The context exposes `values`, `errors`, `isSubmitting`, `setValue(name, value)`, `field(name, optionalHintId)`, and `reset()`. `field()` supplies a stable `id`, `name`, and error accessibility attributes. **Connect both the label and input to that ID.** Input value conversion stays explicit so checkboxes, numbers, and strings do not accidentally share the same handler.

## Example

```tsx
"use client";
import { ValidatedForm, type SubmissionResult } from "./genlib/validated-form/ValidatedForm";

type ProfileValues = { displayName: string; emailNotifications: boolean };

export function ProfileForm({ saveProfile }: {
  saveProfile: (values: ProfileValues) => Promise<SubmissionResult<ProfileValues>>;
}) {
  return (
    <ValidatedForm<ProfileValues>
      formLabel="Profile settings"
      initialValues={{ displayName: "", emailNotifications: false }}
      fieldLabels={{ displayName: "Display name" }}
      validate={(values) => values.displayName.trim() ? {} : { displayName: "Enter a display name." }}
      onSubmit={saveProfile}
    >
      {({ values, field, setValue }) => (
        <>
          <div className="gl-form__field">
            <label htmlFor={field("displayName").id}>Display name</label>
            <input
              {...field("displayName")}
              value={values.displayName}
              onChange={(event) => setValue("displayName", event.target.value)}
              autoComplete="name"
            />
          </div>
          <label htmlFor={field("emailNotifications").id}>
            <input
              {...field("emailNotifications")}
              type="checkbox"
              checked={values.emailNotifications}
              onChange={(event) => setValue("emailNotifications", event.target.checked)}
            />
            Email notifications
          </label>
        </>
      )}
    </ValidatedForm>
  );
}
```

`saveProfile` is an injected application adapter, not a provided backend. For server-component frameworks define function props and field renderers within the client boundary and call an application API using its existing authentication and CSRF controls.

## Options and behavior

Customize `fieldLabels`, `submitLabel`, `submittingLabel`, `successMessage`, `submissionErrorMessage`, and `className`. The default labels are Save / Saving… / Saved. Generic errors use “Something went wrong. Please try again.”

Validation runs before submission. A synchronous guard prevents double submission even before the busy state renders. A disabled fieldset covers both async stages; `setValue` and `reset` also ignore changes while pending. Supply custom controls that honor the disabled state when native fieldset behavior does not apply.

Errors focus a summary with links to affected inputs. The summary owns error-description IDs returned by `field()`; optional visible inline messages should not repeat those IDs. Pass existing hint IDs to `field(name, hintId)` to retain descriptions. Editing clears the changed field's message and any form-level or success message. The wrapper uses `noValidate` because the injected validator controls the full client validation flow.

## Verification and limits

Repository tests exercise validation preventing submission, linked accessible errors, focus, delayed validation/submission, duplicate-submit protection, server field errors, generic exception handling, and successful state. Check the completed integration with application data and assistive technology.

This wrapper does not provide authentication, server validation, authorization, database persistence, schema inference, field-array management, nested path handling, network cancellation, or server-side idempotency. Never rely on disabled controls or client validation to protect an operation. Preserve safe server error messages and enforce request rules in the actual backend.
