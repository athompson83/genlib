// SPDX-License-Identifier: Apache-2.0
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import IMask, { type FactoryOpts } from 'imask';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export interface PhoneValue { raw: string; e164: string | null; possible: boolean; valid: boolean; country?: string; extension?: string }
export function parsePhone(raw: string, defaultCountry?: CountryCode): PhoneValue {
  const phone = parsePhoneNumberFromString(raw, { defaultCountry, extract: false });
  return { raw, e164: phone?.isValid() ? phone.number : null, possible: phone?.isPossible() ?? false, valid: phone?.isValid() ?? false,
    country: phone?.country, extension: phone?.ext };
}

export function PhoneInput({ label, value, defaultCountry, onChange, required = false }: {
  label: string; value: string; defaultCountry?: CountryCode; onChange: (phone: PhoneValue) => void; required?: boolean;
}) {
  const id = useId(), [blurred, setBlurred] = useState(false), phone = parsePhone(value, defaultCountry);
  const invalid = blurred && (value.length > 0 || required) && !phone.valid;
  return <div className="genlib-field"><label htmlFor={id}>{label}</label>
    <input id={id} type="tel" autoComplete="tel" value={value} required={required} aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined} onBlur={() => setBlurred(true)} onChange={event => onChange(parsePhone(event.target.value, defaultCountry))} />
    {invalid && <p id={`${id}-error`}>Enter a valid phone number including a country code when needed.</p>}
  </div>;
}

export function MaskedInput({ label, value, options, onValueChange, ...inputProps }: {
  label: string; value: string; options: FactoryOpts; onValueChange: (value: { masked: string; unmasked: string }) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'>) {
  const id = useId(), element = useRef<HTMLInputElement>(null), callback = useRef(onValueChange), current = useRef(value);
  callback.current = onValueChange; current.current = value;
  const mask = useRef<ReturnType<typeof IMask> | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const instance = IMask(element.current, options); mask.current = instance; instance.unmaskedValue = current.current;
    instance.on('accept', () => callback.current({ masked: instance.value, unmasked: instance.unmaskedValue }));
    return () => { instance.destroy(); mask.current = null; };
  }, [options]);
  useEffect(() => { if (mask.current && mask.current.unmaskedValue !== value) mask.current.unmaskedValue = value; }, [value]);
  return <div className="genlib-field"><label htmlFor={inputProps.id ?? id}>{label}</label><input {...inputProps} id={inputProps.id ?? id} ref={element} /></div>;
}
