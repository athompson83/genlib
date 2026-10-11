#!/usr/bin/env node
import {readFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {outlineSource} from '../lib/outline.mjs';
import {copyLayout,scopedDependencies} from '../lib/language-layout.mjs';
import {installCopy,planCopy,readLock} from '../lib/install.mjs';
import {removeModule} from '../lib/lifecycle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(join(root,'examples/languages/modules.json'),'utf8'));
// The capability a language module implements may name a known limit; the copy output repeats it.
const capabilityCaveat=id=>{try{return JSON.parse(readFileSync(join(root,'resources/capabilities.json'),'utf8')).capabilities.find(c=>Object.values(c.implementations).some(i=>i.id===id))?.caveat}catch{return undefined}};
const [cmd,id,...flags]=process.argv.slice(2);
const selected=catalog.modules.find(m=>m.id===id);
const arg=name=>{const i=flags.indexOf(name);return i<0?null:flags[i+1]};
const digest=s=>createHash('sha256').update(s).digest('hex');
const safePath=p=>{if(!p||isAbsolute(p)||p.split(/[\\/]/).some(x=>x==='..'||x==='.'||x===''))throw Error('Unsafe path: '+p);return p};
// Modules live under examples/languages by default; base "cookbook" selects examples/cookbook.
const BASES={languages:'examples/languages',cookbook:'examples/cookbook'};
const base=m=>{const b=BASES[m?.base??'languages'];if(!b)throw Error('Unknown module base');return b};
const sourcePath=p=>join(root,base(selected),safePath(p));
const checkSource=p=>{const src=sourcePath(p);if(lstatSync(src).isSymbolicLink())throw Error('Source symlink rejected');return src};
// The reviewed record plus the bytes of every file it lists: the lock's manifestSha256 for this capability, so a changed
// example is recognized as a different version rather than silently mixed with an earlier copy.
const recordDigest=m=>digest(JSON.stringify({kind:'language',id:m.id,base:base(m),files:m.files,tests:m.tests,sha256:[...m.files,...m.tests].map(p=>digest(readFileSync(checkSource(p))))}));
try{
 if(cmd==='list'){console.log(JSON.stringify(catalog.modules.map(({id,language,runtime,status,base})=>({id,language,runtime,status,...(base?{base}:{})})),null,2));}
 else if(cmd==='inspect'){if(!selected)throw Error('Unknown module');console.log(JSON.stringify(selected,null,2));}
 else if(cmd==='remove'){
  // Roll back one copied capability: unedited files it alone owns are deleted, edited ones kept, shared ones kept for
  // the capabilities that still depend on them. Same function as genlib remove.
  const target=arg('--target');if(!target||!existsSync(target))throw Error('Existing target directory required');
  if(!id||(await readLock(target)).modules[id]?.kind!=='language')throw Error(`${id} is not recorded as a language example in .genlib/lock.json`);
  const result=await removeModule(null,target,id,{dryRun:flags.includes('--dry-run')});
  console.log(flags.includes('--json')?JSON.stringify(result,null,2):[`${result.dryRun?'would remove':'removed'} ${id}:`,...result.files.map(f=>`  ${f.action} ${f.path}`)].join('\n'));
 }
 else if(cmd==='plan'||cmd==='add'){
  if(!selected)throw Error('Unknown module');
  const target=arg('--target');if(!target||!existsSync(target)||!lstatSync(target).isDirectory())throw Error('Existing target directory required');
  const includeTests=flags.includes('--with-tests');
  // --into <relative dir> chooses the destination folder (default genlib/); --flat drops the shared source folders and,
  // without --into, copies straight into the target. Folders below the shared one are kept, so a test that reads
  // ../fixtures still finds its fixture after a flat copy.
  const flat=flags.includes('--flat');const into=arg('--into')??(flat?'.':'genlib');
  if(into!=='.')safePath(into.replace(/\/+$/,''));
  const layout=copyLayout(selected,{flat,into,includeTests});const paths=layout.paths,rel=layout.rel;
  if(flat&&new Set(paths.map(rel)).size!==paths.length)throw Error('--flat would overwrite: two files share a name');
  // Ownership follows the module installer (.genlib/lock.json): a file Genlib already installed with the same bytes is
  // reused and records this capability as another owner; an untracked, edited or different existing file stops the copy.
  // A dependency manifest that already exists (the app's own requirements.txt, or one from an earlier copy with other
  // lines) is not overwritten: it is kept and its lines are reported for merging.
  const MANIFEST=/^(requirements(-dev)?\.txt|package(-lock)?\.json|go\.(mod|sum)|Cargo\.(toml|lock)|pom\.xml|.*\.csproj|pubspec\.(yaml|lock)|Package\.resolved|(build|settings)\.gradle\.kts|tsconfig\.json)$/;
  const spec={kind:'language',id,manifestSha256:recordDigest(selected),out:into==='.'?'.':into.replace(/\/+$/,''),root,
   files:paths.map(path=>({target:safePath(rel(path)),bytes:readFileSync(checkSource(path)),mergeable:MANIFEST.test(path.split('/').pop()),source:path}))};
  const copy=cmd==='add'?await installCopy(target,spec):await planCopy(target,spec);
  if(copy.conflicts.length)throw Error('Conflict: '+copy.conflicts.join(' '));
  const planned=[],skipped=[];
  for(const [index,file] of copy.files.entries()){
   const path=paths[index],dest=join(copy.target,...file.path.split('/'));
   if(file.action==='kept'){const name=path.split('/').pop(),text=readFileSync(checkSource(path),'utf8');skipped.push({source:path,destination:dest,reason:file.reason,merge:/\.txt$/.test(name)?text.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')):[]});continue;}
   planned.push({source:path,destination:dest,path:file.path,action:file.action,sha256:file.sha256});
  }
  const base=realpathSync(target);
  // Test entrypoints are the test modules only; fixtures and fixture generators are copied but not run.
  const isEntry=p=>selected.tests.includes(p.source)&&/(^|\/)(test_[^/]*\.py|[^/]*_test\.go|[^/]*\.test\.ts|[^/]*_test\.dart|[^/]*Tests?\.(java|kt|cs|swift)|Program\.cs|tests\/[^/]*\.rs)$|Checks?[^/]*\.swift$/.test(p.source);
  const entries=planned.filter(isEntry).map(p=>relative(base,p.destination));
  // A copied go.mod makes the copy its own module: test it from that folder, not from the app root.
  const goModule=layout.manifestName==='go.mod'&&planned.some(p=>p.source.endsWith('/go.mod'))?layout.manifestDir:null;
  const testCommand={python:t=>({cwd:join(base,dirname(t[0])),argv:['python3','-m','unittest',...t.map(x=>x.split('/').pop().replace(/\.py$/,''))]}),go:t=>goModule?({cwd:join(base,goModule),argv:['go','test','./...']}):({cwd:base,argv:['go','test','./'+dirname(t[0])]})}[entries.length?selected.language:'']?.(entries)??null;
  // --run-tests runs the copied tests now (Python and Go, whose commands are known). Execution is separate from output,
  // so --json reports the same result and a failing run sets a non-zero exit status.
  let testRun=null;
  if(cmd==='add'&&flags.includes('--run-tests')&&entries.length){
   if(!testCommand)testRun={status:'unsupported',language:selected.language};
   else{
    const run=spawnSync(testCommand.argv[0],testCommand.argv.slice(1),{cwd:testCommand.cwd,encoding:'utf8',timeout:selected.language==='go'?300000:120000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    const out=((run.stdout??'')+(run.stderr??'')).trim();
    const summary=selected.language==='python'?(out.match(/Ran \d+ tests? in [\d.]+s/)?.[0]??''):out.split('\n').filter(l=>/^(ok|FAIL)\b/.test(l)).join('; ');
    testRun={status:run.status===0?'passed':'failed',command:testCommand.argv.join(' '),cwd:testCommand.cwd,summary,...(run.status===0?{}:{exitCode:run.status,error:run.error?.message,tail:out.split('\n').slice(-15)})};
    if(run.status!==0)process.exitCode=1;
   }
  }
  // Repository evidence is what Genlib's own CI checked; testRun is what ran on this copy. They are reported separately.
  // Dependency steps run where the copied manifest is (cd genlib/.../python && pip install -r requirements.txt); when
  // the app's own manifest was kept, they run at the root after merging the reported lines.
  const manifestCopied=!skipped.some(s=>layout.manifestName&&s.source.endsWith('/'+layout.manifestName));
  const deps=scopedDependencies(selected,layout,{manifestCopied});
  const evidence={verification:selected.verification??'tested',dependencies:deps.map(d=>d.command),testDependencies:(selected.testDependencies??[]).map(c=>layout.manifestDir&&layout.manifestDir!=='.'&&manifestCopied&&/ -r /.test(c)?`cd ${layout.manifestDir} && ${c}`:c)};
  const steps=[{kind:'copy',files:planned.map(p=>relative(base,p.destination))},...deps.map(d=>({kind:'dependencies',command:d.command,cwd:d.cwd})),...(testCommand?[{kind:'test',argv:testCommand.argv,cwd:relative(base,testCommand.cwd)||'.'}]:[])];
  if(flags.includes('--json')){console.log(JSON.stringify({operation:cmd,id,target:base,...(copy.status?{status:copy.status}:{}),files:planned,skipped,steps,tests:entries,testCommand,testRun,evidence,lock:copy.lock,...(copy.receipt?{receipt:copy.receipt}:{})},null,2));}
  else{
   // Compact text: what was copied, the public API and how to run the copied tests, so the agent need not read the source.
   const lines=[`${cmd==='add'?(copy.status==='unchanged'?'already installed':'added'):'would add'} ${id} to ${base} (sha256 checked):`,...planned.map(p=>'  '+relative(base,p.destination)+(p.action==='unchanged'?'  (shared, already installed)':''))];
   for(const s of skipped)lines.push(`# kept existing ${relative(base,s.destination)}`+(s.merge.length?'; add: '+s.merge.join(' '):'; merge its dependencies by hand'));
   const api=selected.files.flatMap(f=>{try{return outlineSource(readFileSync(checkSource(f),'utf8'),selected.language).map(e=>'  '+e.signature+(e.doc?'  // '+e.doc.slice(0,70):''))}catch{return[]}}).slice(0,12);
   if(api.length)lines.push('# api:',...api);
   if(entries.length)lines.push('# test: '+(testCommand?`cd ${testCommand.cwd} && ${testCommand.argv.join(' ')}`:'run '+entries.join(', ')+' with the project test runner'));
   if(evidence.dependencies.length)lines.push('# deps: '+evidence.dependencies.join(' && ')+(selected.dependencyNote?'  # '+selected.dependencyNote:''));
   if(includeTests&&evidence.testDependencies.length)lines.push('# test deps: '+evidence.testDependencies.join(' && '));
   // Name what the copied tests already cover (read from the source, so a plan works before anything is copied).
   const names=[...new Set(selected.tests.filter(t=>includeTests&&isEntry({source:t})).flatMap(t=>[...readFileSync(checkSource(t),'utf8').matchAll(/(?:def|func|fun|void|fn|test\()\s*['"]?(test[\w ]*)/gi)].map(m=>m[1].trim().replace(/^test_?/i,'')).filter(Boolean)))];
   if(names.length)lines.push('# tests cover: '+(names.slice(0,10).join(', ')+(names.length>10?` (+${names.length-10} more)`:'')).slice(0,160));
   if(testRun?.status==='unsupported')lines.push('# tests run: not supported for '+selected.language+'; use the # test command');
   else if(testRun?.status==='passed')lines.push('# tests run: passed on this copy'+(testRun.summary?' ('+testRun.summary+')':''));
   else if(testRun)lines.push('# tests run: FAILED on this copy'+(testRun.error?' ('+testRun.error+')':''),...testRun.tail.map(l=>'  '+l));
   // Agents in measured runs read the whole copied source to check it; say what Genlib's CI already verified. A failed
   // run on this copy replaces that line, so the output never pairs a failure with a passing claim.
   if(testRun?.status!=='failed')lines.push('# repo evidence (Genlib CI, not this copy): '+evidence.verification+'; read the source only to change it.');
   const caveat=capabilityCaveat(id);if(caveat)lines.push('# caveat: '+caveat);
   console.log(lines.join('\n'));
  }
 }else throw Error('Usage: list | inspect <id> | plan|add <id> --target <existing-directory> [--with-tests] [--into <dir>] [--flat] [--run-tests] [--json] | remove <id> --target <existing-directory> [--dry-run] [--json]');
}catch(e){console.error(e.message);process.exitCode=1}
