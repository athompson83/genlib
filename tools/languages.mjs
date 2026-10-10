#!/usr/bin/env node
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../resources/languages.json',import.meta.url),'utf8'));
const [cmd,...rest]=process.argv.slice(2);
if(cmd==='list'){
 const q=rest.join(' ').toLowerCase();
 console.log(JSON.stringify(data.languages.filter(x=>!q||x.name.toLowerCase().includes(q)||x.extensions.some(e=>e.includes(q))).map(x=>({name:x.name,extensions:x.extensions,docs:x.docs,tooling:x.tooling,status:x.status})),null,2));
}else if(cmd==='inspect'){
 const q=rest.join(' ').toLowerCase();
 const result=data.languages.find(x=>x.name.toLowerCase()===q||x.extensions.includes(q));
 if(!result){console.error('Unknown language');process.exitCode=1}else console.log(JSON.stringify(result,null,2));
}else if(cmd==='validate'){
 const names=new Set();
 for(const x of data.languages){if(!x.name||!x.docs.startsWith('https://')||!x.source.startsWith('https://')||names.has(x.name))throw Error('Invalid catalog entry '+x.name);names.add(x.name)}
 console.log(JSON.stringify({valid:true,languages:names.size}));
}else{console.error('Usage: node tools/languages.mjs list [query] | inspect <name-or-extension> | validate');process.exitCode=2}
