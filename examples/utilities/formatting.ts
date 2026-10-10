/** Reusable locale-aware formatters; caller controls locale, currency and timezone. */
export function formatMoney(minor: number, currency: string, locale = "en-US", fractionDigits = 2): string {
 if (!Number.isSafeInteger(minor) || !/^[A-Z]{3}$/.test(currency) || !Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 3) throw new Error("Invalid money input");
 return new Intl.NumberFormat(locale,{style:"currency",currency,minimumFractionDigits:fractionDigits,maximumFractionDigits:fractionDigits}).format(minor/10**fractionDigits);
}
export function formatDate(value: Date | string, locale = "en-US", timeZone = "UTC"): string {
 const date = value instanceof Date ? value : new Date(value);
 if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
 return new Intl.DateTimeFormat(locale,{timeZone,year:"numeric",month:"short",day:"numeric"}).format(date);
}
export function formatCount(value: number, locale = "en-US"): string {
 if (!Number.isFinite(value)) throw new Error("Invalid count");
 return new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value);
}
