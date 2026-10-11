// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@hey-api/openapi-ts';
export default defineConfig({ input:'./schema/openapi.json', output:'./generated/hey-api', plugins:['@hey-api/typescript','@hey-api/client-fetch','@hey-api/sdk'] });
