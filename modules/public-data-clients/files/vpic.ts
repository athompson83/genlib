// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, inputInteger, queryPath, record, array, string, nullableString, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface VinInput { vin: string; modelYear?: number; allowPartial?: boolean }
export interface VehicleSpecification { vin: string; make: string | null; model: string | null; modelYear: string | null; bodyClass: string | null; vehicleType: string | null; fuelType: string | null; errorCodes: string[]; errorText: string | null }
function vinInput(input: VinInput): { vin: string; modelYear: number | undefined } {
  const vin = inputText(input.vin, 17).toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9*]+$/u.test(vin) || (input.allowPartial ? vin.length < 3 : vin.length !== 17 || vin.includes("*"))) throw new PublicDataError("INVALID_INPUT");
  return { vin, modelYear: input.modelYear === undefined ? undefined : inputInteger(input.modelYear, 1886, 2100) };
}
function vehicle(value: unknown): VehicleSpecification {
  const r = record(value);
  const empty = (value: unknown) => nullableString(value) || null;
  return { vin: string(r.VIN), make: empty(r.Make), model: empty(r.Model), modelYear: empty(r.ModelYear), bodyClass: empty(r.BodyClass),
    vehicleType: empty(r.VehicleType), fuelType: empty(r.FuelTypePrimary), errorCodes: string(r.ErrorCode).split(",").map(s => s.trim()).filter(Boolean), errorText: empty(r.ErrorText) };
}
export function createVpicClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://vpic.nhtsa.dot.gov", provider: "vpic",
    source: "https://vpic.nhtsa.dot.gov/api/", attribution: "NHTSA vPIC; manufacturer-supplied specifications. Not vehicle history." });
  return Object.freeze({
    decodeVin(input: VinInput, read: ReadOptions = {}) {
      const selected = vinInput(input);
      return http.request(queryPath(`/api/vehicles/DecodeVinValues/${selected.vin}`, { format: "json", modelyear: selected.modelYear }), value => {
        const results = array(record(value).Results, 1); if (results.length !== 1) throw new PublicDataError("INVALID_RESPONSE"); return vehicle(results[0]);
      }, read);
    },
    decodeBatch(inputs: readonly VinInput[], read: Pick<ReadOptions, "signal"> = {}) {
      if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 50) throw new PublicDataError("INVALID_INPUT");
      const selected = inputs.map(vinInput);
      const body = new URLSearchParams({ format: "json", data: selected.map(v => `${v.vin}${v.modelYear === undefined ? "" : `,${v.modelYear}`}`).join(";") }).toString();
      return http.request("/api/vehicles/DecodeVINValuesBatch/", value => {
        const results = array(record(value).Results, 50); if (results.length !== selected.length) throw new PublicDataError("INVALID_RESPONSE");
        return results.map(vehicle);
      }, { ...read, method: "POST", contentType: "application/x-www-form-urlencoded", body });
    },
  });
}
