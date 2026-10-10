// SPDX-License-Identifier: Apache-2.0
const form=document.querySelector('#label-form'),input=document.querySelector('#title'),result=document.querySelector('#result');
async function normalize(value) {
  if(window.inventory) return window.inventory.normalizeTitle(value);
  if(window.__TAURI__) return window.__TAURI__.core.invoke('normalize_title',{value});
  if(window.go?.main?.App) return window.go.main.App.NormalizeTitle(value);
  throw new Error('Desktop host unavailable');
}
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{result.textContent=await normalize(input.value);}catch{result.textContent='Enter a title of 1 to 200 characters.';}
  finally{button.disabled=false;}
});
