#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {extname,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const cmd=process.argv[2]||'build';
const commit=git('rev-parse','HEAD');
const tracked=git('ls-files','-z').split('\0').filter(Boolean);
const accepted=new Set(['.js','.jsx','.mjs','.cjs','.ts','.tsx','.py','.go','.rs','.swift','.kt','.vue','.md','.json','.yml','.yaml']);
const index=[];
for(const path of tracked){
 if(!accepted.has(extname(path))||path.startsWith('.genlib/')||path.startsWith('node_modules/'))continue;
 let body;try{body=readFileSync(path,'utf8')}catch{continue}
 if(body.length>500000)continue;
 const symbols=[...body.matchAll(/(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|def)\s+([A-Za-z_$][\w$]*)/g)].map(x=>x[1]).slice(0,80);
 const imports=[...body.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(x=>x[1]).slice(0,80);
 index.push({path,sha256:createHash('sha256').update(body).digest('hex'),symbols,imports});
}
index.sort((a,b)=>a.path.localeCompare(b.path));
const result={schemaVersion:1,commit,files:index};
const dest='.genlib/repo-map.json';
if(cmd==='build'){
 if(git('status','--porcelain','--untracked-files=no')){console.error('Commit tracked changes before indexing');process.exit(2)}
 mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log('Indexed '+index.length+' files for '+commit);
}else if(cmd==='check'){
 let existing;try{existing=JSON.parse(readFileSync(dest,'utf8'))}catch{console.error('Index missing or invalid');process.exit(1)}
 if(JSON.stringify(existing)!==JSON.stringify(result)){console.error('Index is stale');process.exit(1)}
 console.log('Index current at '+commit);
}else if(cmd==='find'){
 const terms=process.argv.slice(3).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 if(!terms.length){console.error('Provide search terms');process.exit(2)}
 const matches=index.map(f=>({path:f.path,symbols:f.symbols,score:terms.reduce((n,t)=>n+(f.path.toLowerCase().includes(t)?5:0)+(f.symbols.some(s=>s.toLowerCase().includes(t))?3:0),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,10);
 console.log(JSON.stringify({commit,matches},null,2));
}else if(cmd==='impact'){
 const target=process.argv[3];if(!index.some(f=>f.path===target)){console.error('Unknown file');process.exit(2)}
 const stem=target.replace(/\\.[^.]+$/,'').split('/').at(-1);
 console.log(JSON.stringify({commit,target,directImportCandidates:index.filter(f=>f.path!==target&&f.imports.some(i=>i.includes(stem))).map(f=>f.path),warning:'Heuristic only; validate transitive and dynamic imports'},null,2));
}else{console.error('Commands: build, check, find <terms>, impact <file>');process.exit(2)}
