// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, coordinate, inputText, inputInteger, queryPath, record, array, string, number, nullableNumber, secret, type PublicDataOptions, type SecretProvider, type ReadOptions } from "./http.js";
export type WeatherVariable = "temperature_2m" | "relative_humidity_2m" | "is_day" | "precipitation" | "weather_code" | "cloud_cover" | "wind_speed_10m" | "wind_direction_10m";
const variables = new Set<WeatherVariable>(["temperature_2m", "relative_humidity_2m", "is_day", "precipitation", "weather_code", "cloud_cover", "wind_speed_10m", "wind_direction_10m"]);
export type OpenMeteoOptions = PublicDataOptions & (
  | { access: "noncommercial"; getApiKey?: never }
  | { access: "customer"; getApiKey: SecretProvider }
  | { access: "self-hosted"; origin: string; getApiKey?: SecretProvider }
);
export interface WeatherForecast { latitude: number; longitude: number; timeZone: string; utcOffsetSeconds: number;
  current: { time: number; intervalSeconds: number | null; values: Partial<Record<WeatherVariable, number | null>>; units: Partial<Record<WeatherVariable, string>> } | null;
  hourly: { times: number[]; values: Partial<Record<WeatherVariable, (number | null)[]>>; units: Partial<Record<WeatherVariable, string>> } | null }
function selection(value: readonly WeatherVariable[] | undefined): WeatherVariable[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > variables.size || new Set(value).size !== value.length || value.some(v => !variables.has(v))) throw new PublicDataError("INVALID_INPUT");
  return [...value];
}
export function createOpenMeteoClient(options: OpenMeteoOptions) {
  if (!["noncommercial", "customer", "self-hosted"].includes(options.access)
    || (options.access === "customer" && typeof options.getApiKey !== "function")
    || (options.access === "self-hosted" && (!options.origin || (options.getApiKey !== undefined && typeof options.getApiKey !== "function")))
    || (options.access === "noncommercial" && options.getApiKey !== undefined)) throw new PublicDataError("INVALID_CONFIG");
  const getKey = options.getApiKey;
  const http = createPublicDataTransport({ ...options,
    origin: options.origin ?? (options.access === "customer" ? "https://customer-api.open-meteo.com" : "https://api.open-meteo.com"), provider: "open-meteo",
    ...(getKey ? { credentials: async (signal: AbortSignal) => ({ query: { apikey: secret(await getKey(signal)) } }) } : {}),
    source: "https://open-meteo.com/en/docs", attribution: "Open-Meteo and its weather providers; preserve data attribution and selected hosted-service terms." });
  return Object.freeze({
    getForecast(input: ReadOptions & { latitude: number; longitude: number; current?: readonly WeatherVariable[]; hourly?: readonly WeatherVariable[]; days?: number; timeZone?: string; temperatureUnit?: "celsius" | "fahrenheit"; windSpeedUnit?: "kmh" | "ms" | "mph" | "kn" }) {
      const current = selection(input.current), hourly = selection(input.hourly);
      if (!current.length && !hourly.length) throw new PublicDataError("INVALID_INPUT");
      const temperatureUnit = input.temperatureUnit ?? "celsius", windSpeedUnit = input.windSpeedUnit ?? "kmh";
      if (!["celsius", "fahrenheit"].includes(temperatureUnit) || !["kmh", "ms", "mph", "kn"].includes(windSpeedUnit)) throw new PublicDataError("INVALID_INPUT");
      const timeZone = inputText(input.timeZone ?? "UTC", 100);
      if (timeZone !== "auto") { try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new PublicDataError("INVALID_INPUT"); } }
      return http.request(queryPath("/v1/forecast", { latitude: coordinate(input.latitude, true), longitude: coordinate(input.longitude, false),
        current: current.length ? current.join(",") : undefined, hourly: hourly.length ? hourly.join(",") : undefined,
        forecast_days: inputInteger(input.days ?? 3, 1, 16), timezone: timeZone, timeformat: "unixtime", temperature_unit: temperatureUnit, wind_speed_unit: windSpeedUnit }), value => {
        const r = record(value);
        const currentData = current.length ? record(r.current) : null, hourlyData = hourly.length ? record(r.hourly) : null;
        const currentUnits = current.length ? record(r.current_units) : {}, hourlyUnits = hourly.length ? record(r.hourly_units) : {};
        const times = hourlyData ? array(hourlyData.time, 500).map(number) : [];
        const hourlyValues: Partial<Record<WeatherVariable, (number | null)[]>> = {};
        for (const v of hourly) { const values = array(hourlyData![v], 500).map(nullableNumber); if (values.length !== times.length) throw new PublicDataError("INVALID_RESPONSE"); hourlyValues[v] = values; }
        return { latitude: number(r.latitude), longitude: number(r.longitude), timeZone: string(r.timezone), utcOffsetSeconds: number(r.utc_offset_seconds),
          current: currentData ? { time: number(currentData.time), intervalSeconds: nullableNumber(currentData.interval),
            values: Object.fromEntries(current.map(v => [v, nullableNumber(currentData[v])])), units: Object.fromEntries(current.map(v => [v, string(currentUnits[v])])) } : null,
          hourly: hourlyData ? { times, values: hourlyValues, units: Object.fromEntries(hourly.map(v => [v, string(hourlyUnits[v])])) } : null } satisfies WeatherForecast;
      }, input);
    },
  });
}
