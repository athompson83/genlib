// SPDX-License-Identifier: Apache-2.0
export interface TimeSample { time: number; values: Record<string, number | null> }
/** Timestamp unit is Unix seconds. Duplicate timestamps use the last sample. Missing series use gaps. */
export function alignTimeSeries(samples: readonly TimeSample[], keys: readonly string[]): [number[], ...(number | null)[][]] {
  if (!keys.length || new Set(keys).size !== keys.length) throw new Error('Series keys must be nonempty and unique.');
  const unique = new Map<number, TimeSample>();
  for (const sample of samples) {
    if (!Number.isFinite(sample.time) || !Number.isFinite(new Date(sample.time * 1000).getTime())) throw new Error('Invalid timestamp.');
    for (const key of keys) { const value = sample.values[key]; if (value !== undefined && value !== null && !Number.isFinite(value)) throw new Error('Invalid series value.'); }
    unique.set(sample.time, sample);
  }
  const sorted = [...unique.values()].sort((a, b) => a.time - b.time);
  return [sorted.map(sample => sample.time), ...keys.map(key => sorted.map(sample => sample.values[key] ?? null))];
}
