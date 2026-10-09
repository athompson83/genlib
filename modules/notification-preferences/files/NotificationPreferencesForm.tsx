// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  PreferencesConflictError,
  preferencesEqual,
  validateSnapshot,
} from "./core.js";
import type { NotificationChannel, PreferenceSchema, PreferencesSnapshot } from "./core.js";

export interface NotificationPreferencesFormProps {
  readonly schema: PreferenceSchema;
  readonly initialSnapshot: PreferencesSnapshot;
  readonly save: (snapshot: PreferencesSnapshot) => Promise<PreferencesSnapshot>;
  readonly disabled?: boolean;
}

const channelLabels: Record<NotificationChannel, string> = {
  email: "Email",
  push: "Push notification",
  inApp: "In-app notification",
};

/** Import notification-preferences.css in the application. Remount on identity/schema changes. */
export function NotificationPreferencesForm({
  schema,
  initialSnapshot,
  save,
  disabled = false,
}: NotificationPreferencesFormProps) {
  const id = useId();
  const [snapshot, setSnapshot] = useState(() => validateSnapshot(schema, initialSnapshot));
  const [draft, setDraft] = useState(snapshot.preferences);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const dirty = !preferencesEqual(draft, snapshot.preferences);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || disabled || !dirty) return;
    saving.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const updated = validateSnapshot(schema, await save({ revision: snapshot.revision, preferences: draft }));
      if (!mounted.current) return;
      setSnapshot(updated);
      setDraft(updated.preferences);
      setMessage("Notification preferences saved.");
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof PreferencesConflictError) {
        let latest: PreferencesSnapshot;
        try {
          latest = validateSnapshot(schema, cause.snapshot);
        } catch {
          setError("We couldn’t save your preferences. Try again.");
          return;
        }
        setSnapshot(latest);
        setDraft(latest.preferences);
        setError("Preferences changed elsewhere. The current settings are shown; review them before making changes.");
      } else {
        setError("We couldn’t save your preferences. Try again.");
      }
    } finally {
      saving.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <form className="genlib-notification-preferences" onSubmit={submit} aria-labelledby={`${id}-title`} aria-busy={pending}>
      <h2 id={`${id}-title`}>Notification preferences</h2>
      {schema.map((entry) => (
        <fieldset key={entry.key} disabled={disabled || pending} aria-describedby={entry.description ? `${id}-${entry.key}-description` : undefined}>
          <legend>{entry.label}</legend>
          {entry.description && <p id={`${id}-${entry.key}-description`}>{entry.description}</p>}
          <div className="genlib-notification-preferences__channels">
            {entry.channels.map((channel) => (
              <label key={channel}>
                <input
                  type="checkbox"
                  name={`${entry.key}.${channel}`}
                  checked={draft[entry.key]?.[channel] ?? false}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setDraft((current) => ({ ...current, [entry.key]: { ...current[entry.key], [channel]: enabled } }));
                    setMessage("");
                    setError("");
                  }}
                />
                {channelLabels[channel]}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p role="alert" className="genlib-notification-preferences__error">{error}</p>}
      <div role="status" aria-live="polite">{pending ? "Saving preferences…" : message}</div>
      <button type="submit" disabled={disabled || pending || !dirty}>
        {pending ? "Saving…" : "Save preferences"}
      </button>
    </form>
  );
}
