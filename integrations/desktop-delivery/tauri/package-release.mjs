// SPDX-License-Identifier: Apache-2.0
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {trustedFeed,validVersion} from '../core/native-boundary.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const version=validVersion(process.env.GENLIB_RELEASE_VERSION);
const endpoint=trustedFeed(process.env.GENLIB_UPDATE_FEED);
const pubkey=process.env.GENLIB_UPDATE_PUBLIC_KEY;
if(!pubkey||!process.env.TAURI_SIGNING_PRIVATE_KEY)throw new Error('Trusted updater public key and release-owner TAURI_SIGNING_PRIVATE_KEY are required');
const targets={win32:['nsis'],darwin:['app','dmg'],linux:['appimage','deb']}[process.platform];
if(!targets)throw new Error('Unsupported desktop target');
const cli=resolve(root,'../node_modules/@tauri-apps/cli/tauri.js');
function run(args){const result=spawnSync(process.execPath,[cli,...args],{cwd:root,stdio:'inherit'});if(result.error||result.status!==0)throw new Error('Tauri release command failed');}
run(['icon',resolve(root,'../fixtures/app-icon.svg'),'--output',resolve(root,'src-tauri/icons')]);
run(['build','--config',JSON.stringify({version,bundle:{active:true,targets,createUpdaterArtifacts:true,
 icon:['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.ico']},
 plugins:{updater:{endpoints:[endpoint],pubkey,requireSignedVersion:true,allowDowngrades:false}}})]);
console.log('Local native bundles and signed updater artifacts created. Nothing was uploaded. Record installed-version update acceptance before release.');
