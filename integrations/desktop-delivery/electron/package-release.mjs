// SPDX-License-Identifier: Apache-2.0
import {build} from 'electron-builder';
import {trustedFeed,validVersion} from '../core/native-boundary.mjs';
const version=validVersion(process.env.GENLIB_RELEASE_VERSION);
const url=trustedFeed(process.env.GENLIB_UPDATE_FEED);
const publisher=process.env.GENLIB_WINDOWS_PUBLISHER;
if(process.platform==='win32'&&!publisher)throw new Error('The Windows code-signing publisher name is required');
await build({publish:'never',config:{extends:'electron-builder.yml',forceCodeSigning:process.platform!=='linux',extraMetadata:{version,genlibUpdateFeed:url},
 publish:[{provider:'generic',url}],...(process.platform==='win32'?{win:{publisherName:publisher,verifyUpdateCodeSignature:true}}:{})}});
