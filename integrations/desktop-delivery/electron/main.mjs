// SPDX-License-Identifier: Apache-2.0
import {app,BrowserWindow,ipcMain,dialog,safeStorage} from 'electron';
import updater from 'electron-updater';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeTitle,assertTrustedFrame} from '../core/normalize.mjs';
import {createNativeServices} from './native-services.mjs';
await app.whenReady();
const window=new BrowserWindow({width:760,height:840,show:false,webPreferences:{
 preload:fileURLToPath(new URL('./preload.cjs',import.meta.url)),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,
}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
const metadata=JSON.parse(await readFile(join(app.getAppPath(),'package.json'),'utf8'));
const feed=metadata.genlibUpdateFeed??process.env.GENLIB_UPDATE_FEED;
const native=createNativeServices({app,dialog,safeStorage,autoUpdater:updater.autoUpdater,window,feed});
function handle(name,argsCount,run){ipcMain.handle('inventory:'+name,(event,...args)=>{
 assertTrustedFrame(event.senderFrame,window.webContents.mainFrame);if(args.length!==argsCount)throw new TypeError('Unexpected arguments');return run(...args);
});}
handle('normalize',1,normalizeTitle);handle('pick-text',0,native.pickText);
handle('save-session',1,native.vault.save);handle('session-status',0,native.vault.status);handle('clear-session',0,native.vault.clear);
handle('check-update',0,native.updates.check);handle('download-update',0,native.updates.download);handle('restart-update',0,native.updates.restart);
window.once('ready-to-show',()=>window.show());await window.loadFile(fileURLToPath(new URL('../web/index.html',import.meta.url)));
app.on('window-all-closed',()=>app.quit());
