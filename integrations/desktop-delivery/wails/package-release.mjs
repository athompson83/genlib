// SPDX-License-Identifier: Apache-2.0
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {trustedFeed,validVersion} from '../core/native-boundary.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const version=validVersion(process.env.GENLIB_RELEASE_VERSION);
const feed=trustedFeed(process.env.GENLIB_UPDATE_FEED).replace(/\/?$/,'/');
const keyFile=process.env.GENLIB_UPDATE_SIGNING_KEY_FILE;
if(!keyFile)throw new Error('A release-owner ECDSA signing key file is required');
const key=createPrivateKey(await readFile(keyFile));
if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new Error('Use an ECDSA P-256 signing key');
const os={win32:'windows',linux:'linux'}[process.platform],arch={x64:'amd64',arm64:'arm64'}[process.arch];
if(!os||!arch)throw new Error('This single-executable update package targets Windows/Linux x64/arm64; macOS requires signed app-bundle distribution');
if(/\s/.test(feed))throw new Error('Update feed must not contain whitespace');
const publicKey=Buffer.from(createPublicKey(key).export({type:'spki',format:'pem'})).toString('base64');
const built=spawnSync('wails',['build','-platform',`${os}/${arch}`,'-ldflags',`-X main.releaseVersion=${version} -X main.releaseFeed=${feed} -X main.releasePublicKey=${publicKey}`],{cwd:root,stdio:'inherit'});
if(built.error||built.status!==0)throw new Error('Wails native release build failed');
const executable='genlib-inventory'+(os==='windows'?'.exe':'');
const name=`genlib-inventory_${os}_${arch}`+(os==='windows'?'.exe':'');
const bytes=await readFile(resolve(root,'build/bin',executable));
const output=resolve(root,'../artifacts/wails',version,`${os}-${arch}`);await mkdir(output,{recursive:true});
await copyFile(resolve(root,'build/bin',executable),resolve(output,name));
const signature=sign('sha256',bytes,key);await writeFile(resolve(output,name+'.sig'),signature);
// JSON is valid YAML 1.2. The signed manifest binds release version to asset URLs;
// the updater verifies both this metadata and the executable independently.
const manifest=Buffer.from(JSON.stringify({last_release_id:1,last_asset_id:2,releases:[{
 id:1,name:version,tag_name:'v'+version,url:feed,draft:false,prerelease:version.includes('-'),
 published_at:new Date().toISOString(),release_notes:'Reviewed Genlib fixture release',assets:[
  {id:1,name,size:bytes.length,url:new URL(name,feed).href},
  {id:2,name:name+'.sig',size:signature.length,url:new URL(name+'.sig',feed).href},
 ]
}]},null,2)+'\n');
await writeFile(resolve(output,'manifest.yaml'),manifest);
await writeFile(resolve(output,'manifest.yaml.sig'),sign('sha256',manifest,key));
console.log(`Local signed update files: ${output}. Nothing was uploaded. Review platform signing and deploy this directory to the configured feed only through your release process.`);
