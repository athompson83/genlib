// SPDX-License-Identifier: Apache-2.0
const {contextBridge,ipcRenderer}=require('electron');
// Named capabilities only: no arbitrary IPC, path, service-name, URL or secret read.
contextBridge.exposeInMainWorld('inventory',Object.freeze({
 normalizeTitle:value=>ipcRenderer.invoke('inventory:normalize',value),
 pickText:()=>ipcRenderer.invoke('inventory:pick-text'),
 saveSession:value=>ipcRenderer.invoke('inventory:save-session',value),
 sessionStatus:()=>ipcRenderer.invoke('inventory:session-status'),
 clearSession:()=>ipcRenderer.invoke('inventory:clear-session'),
 checkUpdate:()=>ipcRenderer.invoke('inventory:check-update'),
 downloadUpdate:()=>ipcRenderer.invoke('inventory:download-update'),
 restartUpdate:()=>ipcRenderer.invoke('inventory:restart-update'),
}));
