// SPDX-License-Identifier: Apache-2.0
import {open,readFile,writeFile,rename,mkdir,unlink,lstat} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {MAX_TEXT_BYTES,validateTextSelection,createCredentialBoundary,createUpdateFlow,trustedFeed} from '../core/native-boundary.mjs';
export function createNativeServices({app,dialog,safeStorage,autoUpdater,window,feed}){
 const file=join(app.getPath('userData'),'inventory-session.encrypted');
 function requireSecureBackend(){
  if(!safeStorage.isEncryptionAvailable())throw new Error('OS encryption unavailable');
  if(process.platform==='linux'&&!['gnome_any','gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(safeStorage.getSelectedStorageBackend()))throw new Error('Unlocked OS keyring required');
 }
 const vault=createCredentialBoundary({
  async save(token){requireSecureBackend();const encrypted=safeStorage.encryptString(token);await mkdir(app.getPath('userData'),{recursive:true});const next=file+'.'+randomUUID();
   try{await writeFile(next,encrypted,{flag:'wx',mode:0o600});await rename(next,file);}finally{await unlink(next).catch(error=>{if(error.code!=='ENOENT')throw error;});}},
  async load(){requireSecureBackend();try{const info=await lstat(file);if(!info.isFile()||info.size>8192)throw new Error('Invalid vault');return safeStorage.decryptString(await readFile(file));}catch(error){if(error.code==='ENOENT')return null;throw error;}},
  async clear(){requireSecureBackend();await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});},
 });
 let picking=false;
 const pickText=async()=>{
  if(picking)throw new Error('File selection already open');picking=true;
  try{const result=await dialog.showOpenDialog(window,{title:'Choose a text fixture',properties:['openFile'],filters:[{name:'Text fixtures',extensions:['txt','md','json']}]});
   if(result.canceled)return null;if(result.filePaths.length!==1)throw new Error('Choose one file');
   const handle=await open(result.filePaths[0],'r');
   try{const info=await handle.stat();if(!info.isFile()||info.size>MAX_TEXT_BYTES)throw new Error('Invalid file');
    const buffer=Buffer.alloc(MAX_TEXT_BYTES+1);let total=0;
    while(total<buffer.length){const {bytesRead}=await handle.read(buffer,total,buffer.length-total,total);if(!bytesRead)break;total+=bytesRead;}
    return validateTextSelection(basename(result.filePaths[0]),buffer.subarray(0,total));
   }finally{await handle.close();}
  }catch{throw new Error('Text selection failed');}finally{picking=false;}
 };
 autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;autoUpdater.allowPrerelease=false;
 autoUpdater.on('error',()=>{}); // failures are normalized through the explicit calls below
 let updateAvailable=false;
 autoUpdater.on('update-available',()=>{updateAvailable=true;});autoUpdater.on('update-not-available',()=>{updateAvailable=false;});
 if(feed)autoUpdater.setFeedURL({provider:'generic',url:trustedFeed(feed)});
 const updates=createUpdateFlow({
  async check(){if(!feed||!app.isPackaged)throw new Error('Packaged application and trusted update feed required');updateAvailable=false;
   const result=await autoUpdater.checkForUpdates();return updateAvailable&&result?result.updateInfo.version:null;},
  async download(){await autoUpdater.downloadUpdate();},
  async restart(){autoUpdater.quitAndInstall(false,true);},
 });
 return {vault,pickText,updates};
}
