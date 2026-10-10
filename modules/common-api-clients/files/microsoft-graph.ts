// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, createHttpClient, credential, requireRecord, requireString, type TokenProvider, type TransportOptions } from "./http.js";

export interface MicrosoftGraphOptions extends TransportOptions {
  /** Delegated Microsoft Graph token for the signed-in user with User.Read. */
  getAccessToken: TokenProvider;
}
export interface MicrosoftProfile {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
}
export function createMicrosoftGraphClient(options: MicrosoftGraphOptions) {
  if (typeof options.getAccessToken !== "function") throw new ApiClientError("INVALID_CONFIG");
  const getToken = options.getAccessToken;
  const http = createHttpClient({ ...options, origin: "https://graph.microsoft.com", headers: async signal => ({
    authorization: `Bearer ${credential(await getToken(signal))}`,
  }) });
  return Object.freeze({
    async getMe(signal?: AbortSignal): Promise<MicrosoftProfile> {
      const data = requireRecord(await http.request("/v1.0/me?$select=id,displayName,mail,userPrincipalName", { signal }));
      for (const field of ["displayName", "mail", "userPrincipalName"]) {
        if (data[field] !== null && typeof data[field] !== "string") throw new ApiClientError("INVALID_RESPONSE");
      }
      return { id: requireString(data, "id"), displayName: data.displayName as string | null,
        mail: data.mail as string | null, userPrincipalName: data.userPrincipalName as string | null };
    },
  });
}
