#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const graph=JSON.parse(readFileSync('.genlib/repo-map.json','utf8'));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(graph.commit!==sha){console.error('Stale index; regenerate before diagramming');process.exit(1)}
const groups=new Map();
for(const file of graph.files){
 const group=file.path.startsWith('.')?file.path.split('/').slice(0,2).join('/'):file.path.split('/')[0];
 groups.set(group,(groups.get(group)||0)+1);
}
const lines=['flowchart TD','  ROOT["Repository '+sha.slice(0,10)+'"]'];
let i=0;
for(const [group,count] of [...groups].sort((a,b)=>a[0].localeCompare(b[0]))){
 const id='G'+i++;
 lines.push('  '+id+'["'+group.replaceAll('"','')+' ('+count+' files)"]');
 lines.push('  ROOT --> '+id);
}
const target='docs/diagrams/repository.mmd';
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,lines.join('\n')+'\n');
console.log('Generated '+target+' from '+sha);
