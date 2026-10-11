// SPDX-License-Identifier: Apache-2.0
const methods={normalizeTitle:['normalize_title','NormalizeTitle'],pickText:['pick_text','PickText'],saveSession:['save_session','SaveSession'],sessionStatus:['session_status','SessionStatus'],clearSession:['clear_session','ClearSession'],checkUpdate:['check_update','CheckUpdate'],downloadUpdate:['download_update','DownloadUpdate'],restartUpdate:['restart_update','RestartUpdate']};
async function call(name,value){
 if(window.inventory)return value===undefined?window.inventory[name]():window.inventory[name](value);
 if(window.__TAURI__)return window.__TAURI__.core.invoke(methods[name][0],value===undefined?{}:{value});
 if(window.go?.main?.App)return value===undefined?window.go.main.App[methods[name][1]]():window.go.main.App[methods[name][1]](value);
 throw new Error('Desktop host unavailable');
}
function el(id){return document.getElementById(id);}
el('label-form').addEventListener('submit',async event=>{event.preventDefault();try{el('result').textContent=await call('normalizeTitle',el('title').value);}catch{el('result').textContent='Enter a title of 1 to 200 characters.';}});
el('pick-file').addEventListener('click',async()=>{el('pick-file').disabled=true;try{const file=await call('pickText');el('file-status').textContent=file?'Selected '+file.name:'Selection cancelled';el('file-preview').textContent=file?.contents??'';}catch{el('file-status').textContent='File selection failed. Choose a supported text file.';}finally{el('pick-file').disabled=false;}});
function vaultStatus(result){el('vault-status').textContent=result.present?'A session is saved in OS secure storage.':'No session is saved.';}
el('session-form').addEventListener('submit',async event=>{event.preventDefault();const input=el('session-token');const token=input.value;input.value='';try{vaultStatus(await call('saveSession',token));}catch{el('vault-status').textContent='OS secure storage is unavailable or the token is invalid.';}});
for(const [id,method] of [['session-status','sessionStatus'],['clear-session','clearSession']])el(id).addEventListener('click',async()=>{try{vaultStatus(await call(method));}catch{el('vault-status').textContent='OS secure storage is unavailable.';}});
function updateStatus(result){
 el('update-status').textContent=result.version?`${result.state}: ${result.version}`:result.state;
 el('download-update').disabled=result.state!=='available';el('restart-update').disabled=result.state!=='ready';
}
for(const [id,method] of [['check-update','checkUpdate'],['download-update','downloadUpdate'],['restart-update','restartUpdate']])el(id).addEventListener('click',async()=>{
 for(const key of ['check-update','download-update','restart-update'])el(key).disabled=true;
 try{updateStatus(await call(method));}catch{el('update-status').textContent='Update operation failed. Check the configured feed and packaged-app requirements.';}
 finally{el('check-update').disabled=false;}
});
