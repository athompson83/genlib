// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'orval';
export default defineConfig({ inventory: { input:'./schema/openapi.json', output: { target:'./generated/orval.ts', client:'fetch', mode:'single', clean:false } } });
