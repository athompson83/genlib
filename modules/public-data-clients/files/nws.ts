// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, applicationAgent, coordinate, inputInteger, inputText, queryPath, record, array, string, number, nullableString, nullableNumber, boolean, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface NwsGrid { office: string; x: number; y: number; timeZone: string }
export interface ForecastPeriod { number: number; name: string; startTime: string; endTime: string; isDaytime: boolean; temperature: number | null; temperatureUnit: "C" | "F"; windSpeed: string; windDirection: string; shortForecast: string; detailedForecast: string; precipitationPercent: number | null }
export interface NwsForecast { updatedAt: string | null; validTimes: string | null; periods: ForecastPeriod[] }
export interface NwsAlert { id: string; event: string; severity: string; certainty: string; urgency: string; headline: string | null; description: string; instruction: string | null; effective: string | null; onset: string | null; expires: string | null; ends: string | null }
function gridOffice(value: unknown): string { const s = inputText(value, 5).toUpperCase(); if (!/^[A-Z]{3,5}$/u.test(s)) throw new PublicDataError("INVALID_INPUT"); return s; }
function point(latitude: number, longitude: number): string { return `${coordinate(latitude, true)},${coordinate(longitude, false)}`; }
export function createNwsClient(options: PublicDataOptions & { userAgent: string }) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.weather.gov", provider: "national-weather-service",
    headers: { "user-agent": applicationAgent(options.userAgent), accept: "application/geo+json" },
    source: "https://www.weather.gov/documentation/services-web-api", attribution: "U.S. National Weather Service / NOAA." });
  return Object.freeze({
    getGrid(latitude: number, longitude: number, read: ReadOptions = {}) {
      return http.request(`/points/${point(latitude, longitude)}`, value => {
        const p = record(record(value).properties);
        return { office: gridOffice(p.gridId), x: inputInteger(p.gridX, 0, 10000), y: inputInteger(p.gridY, 0, 10000), timeZone: string(p.timeZone) } satisfies NwsGrid;
      }, read);
    },
    getForecast(grid: Pick<NwsGrid, "office" | "x" | "y">, read: ReadOptions & { units?: "us" | "si"; hourly?: boolean } = {}) {
      const units = read.units ?? "us"; if (units !== "us" && units !== "si") throw new PublicDataError("INVALID_INPUT");
      const path = `/gridpoints/${gridOffice(grid.office)}/${inputInteger(grid.x, 0, 10000)},${inputInteger(grid.y, 0, 10000)}/forecast${read.hourly ? "/hourly" : ""}`;
      return http.request(queryPath(path, { units }), value => {
        const p = record(record(value).properties);
        return { updatedAt: nullableString(p.updated), validTimes: nullableString(p.validTimes), periods: array(p.periods, 500).map(value => {
          const r = record(value); const unit = string(r.temperatureUnit);
          if (unit !== "C" && unit !== "F") throw new PublicDataError("INVALID_RESPONSE");
          return { number: number(r.number), name: string(r.name), startTime: string(r.startTime), endTime: string(r.endTime), isDaytime: boolean(r.isDaytime),
            temperature: nullableNumber(r.temperature), temperatureUnit: unit, windSpeed: string(r.windSpeed), windDirection: string(r.windDirection),
            shortForecast: string(r.shortForecast), detailedForecast: string(r.detailedForecast),
            precipitationPercent: r.probabilityOfPrecipitation == null ? null : nullableNumber(record(r.probabilityOfPrecipitation).value) } satisfies ForecastPeriod;
        }) } satisfies NwsForecast;
      }, read);
    },
    getActiveAlerts(latitude: number, longitude: number, read: ReadOptions = {}) {
      return http.request(queryPath("/alerts/active", { point: point(latitude, longitude) }), value => array(record(value).features, 1000).map(value => {
        const r = record(value), p = record(r.properties);
        return { id: string(r.id), event: string(p.event), severity: string(p.severity), certainty: string(p.certainty), urgency: string(p.urgency),
          headline: nullableString(p.headline), description: string(p.description), instruction: nullableString(p.instruction),
          effective: nullableString(p.effective), onset: nullableString(p.onset), expires: nullableString(p.expires), ends: nullableString(p.ends) } satisfies NwsAlert;
      }), read);
    },
  });
}
