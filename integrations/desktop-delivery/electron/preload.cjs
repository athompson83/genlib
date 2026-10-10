// SPDX-License-Identifier: Apache-2.0
const {contextBridge,ipcRenderer}=require('electron');
// One named capability; the renderer never receives arbitrary IPC or Node APIs.
contextBridge.exposeInMainWorld('inventory',Object.freeze({
  normalizeTitle:value=>ipcRenderer.invoke('inventory:normalize',value),
}));
