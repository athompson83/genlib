// SPDX-License-Identifier: Apache-2.0
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { normalizeTitle, assertTrustedFrame } from '../core/normalize.mjs';
let window;
await app.whenReady();
window=new BrowserWindow({width:640,height:460,show:false,webPreferences:{
  preload:fileURLToPath(new URL('./preload.cjs',import.meta.url)),
  contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,
}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
window.webContents.on('will-navigate',event=>event.preventDefault());
ipcMain.handle('inventory:normalize',(event,value)=>{
  assertTrustedFrame(event.senderFrame,window.webContents.mainFrame);
  return normalizeTitle(value);
});
window.once('ready-to-show',()=>window.show());
await window.loadFile(fileURLToPath(new URL('../web/index.html',import.meta.url)));
app.on('window-all-closed',()=>app.quit());
