#!/usr/bin/env node
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
const entries=JSON.parse(readFileSync(new URL('../resources/agent-recipes.json',import.meta.url),'utf8')).entries;
const [command,...args]=process.argv.slice(2);
const option=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined};
const id=args[0];
function evaluate(recipe,project){
 const reasons=[],blockers=[];
 const language=(project.language||'').toLowerCase(),framework=(project.framework||'').toLowerCase(),runtime=(project.runtime||'').toLowerCase();
 const platform=recipe.platform.toLowerCase();
 if(!language)blockers.push('Project language is unknown');
 else if(platform==='react'&&!(framework==='react'||framework==='next.js'||framework==='nextjs'))blockers.push('React framework not confirmed');
 else if(platform==='node'&&runtime!=='node')blockers.push('Trusted Node server runtime not confirmed');
 else if(platform==='typescript'&&!['typescript','javascript'].includes(language))blockers.push('TypeScript/JavaScript compatibility not confirmed');
 else if(platform==='css'&&!['typescript','javascript','css'].includes(language))blockers.push('CSS integration not confirmed');
 else reasons.push('Language/runtime family matches declared requirements');
 if(recipe.kind==='structural-example')blockers.push('Structural example requires production accessibility implementation');
 if(recipe.kind==='source-example')reasons.push('Source example requires adaptation and application-level tests');
 if(recipe.kind==='versioned-module')reasons.push('Run genlib plan/verify for exact dependency compatibility');
 const status=blockers.length?'review-required':'candidate';
 return {id:recipe.id,status,score:status==='candidate'?70:0,reasons,blockers,requiredChecks:recipe.checks,source:recipe.path,kind:recipe.kind};
}
try{
 if(command!=='assess')throw Error('Usage: assess <recipe-id> --project <project.json>');
 const recipe=entries.find(e=>e.id===id);if(!recipe)throw Error('Unknown recipe');
 const path=option('--project');if(!path)throw Error('Project JSON required');
 const data=JSON.parse(readFileSync(resolve(path),'utf8'));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid project profile');
 console.log(JSON.stringify(evaluate(recipe,data),null,2));
}catch(e){console.error(e.message);process.exitCode=1}
