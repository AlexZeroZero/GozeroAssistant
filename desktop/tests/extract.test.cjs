const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const exec=require('node:util').promisify(require('node:child_process').execFile);
const {extract,extractionError,installKernel}=require('../src/kernel-install.cjs'),{KRIG}=require('../src/miner.cjs');
const PS=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const payload=Buffer.from('fixture bytes never executed'),digest=data=>crypto.createHash('sha256').update(data).digest('hex');let dir;
before(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-extract-'));await exec('python',['-c',`import zipfile,sys,pathlib,warnings
warnings.filterwarnings('ignore')
p=pathlib.Path(sys.argv[1])
for name,entries in [('valid',[('krig-miner.exe',b'fixture bytes never executed'),('Start.bat',b'never extracted')]),('traversal',[('../krig-miner.exe',b'unsafe')]),('duplicate',[('krig-miner.exe',b'a'),('krig-miner.exe',b'b')]),('missing',[('readme.txt',b'x')])]:
 with zipfile.ZipFile(p/(name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
  for file,data in entries:z.writestr(file,data)
`,dir],{windowsHide:true});});
after(async()=>{if(dir)await fs.rm(dir,{recursive:true,force:true})});
test('native extraction supports Unicode/spaces/metacharacters, extracts only fixed EXE, and preserves existing bytes on bad hash',async()=>{
 const output=path.join(dir,'中文 空格 & 目录');await extract(path.join(dir,'valid.zip'),output,digest(payload));assert.deepEqual(await fs.readFile(path.join(output,'krig-miner.exe')),payload);assert.deepEqual(await fs.readdir(output),['krig-miner.exe']);
 await assert.rejects(extract(path.join(dir,'valid.zip'),output,'0'.repeat(64)),/SHA256/);assert.deepEqual(await fs.readFile(path.join(output,'krig-miner.exe')),payload);assert.deepEqual(await fs.readdir(output),['krig-miner.exe']);
 await extract(path.join(dir,'valid.zip'),output,digest(payload));assert.deepEqual(await fs.readFile(path.join(output,'krig-miner.exe')),payload);
});
test('native extractor rejects traversal, duplicate entries, missing EXE and corrupt archives',async()=>{
 for(const file of ['traversal','duplicate','missing'])await assert.rejects(extract(path.join(dir,file+'.zip'),path.join(dir,'reject-'+file),digest(payload)),/不安全|无效|缺少/);
 await fs.writeFile(path.join(dir,'broken.zip'),'not a zip');await assert.rejects(extract(path.join(dir,'broken.zip'),path.join(dir,'reject-broken'),digest(payload)),/无效/);
 await assert.rejects(fs.access(path.join(dir,'krig-miner.exe')));
});
test('extraction errors map to readable text without raw PowerShell/native command output',()=>{
 assert.match(extractionError({stdout:'{"ok":false,"code":"ACCESS_DENIED"}',message:'unreadable console'}).message,/写入权限/);
 assert.match(extractionError({code:'ENOENT'}).message,/组件缺失/);assert.match(extractionError({killed:true}).message,/超时/);
 assert.ok(!extractionError({stdout:'invalid',message:'Command failed: powershell'}).message.includes('powershell'));
});
test('Restricted-policy child reproduces old failure while full native install of pinned KRig succeeds without executing it',async t=>{
 const fixture=path.resolve(__dirname,'../../.local/gozer-build/krig.zip');
 try{await fs.access(fixture)}catch(e){if(e.code==='ENOENT')return t.skip('Optional pinned KRig archive not present; synthetic extraction tests still run');throw e}

 const probe=path.join(dir,'policy-probe.ps1');await fs.writeFile(probe,"Write-Output 'not reached'");
 await assert.rejects(exec(PS,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Restricted','-File',probe],{windowsHide:true}),e=>String(e.stderr).includes('UnauthorizedAccess'));
 const body=await fs.readFile(fixture);assert.equal(digest(body),KRIG.sha256);
 const output=path.join(dir,'真实内核 安装'),exe=path.join(output,'krig-miner.exe'),stages=[];
 const previous=process.env.PSExecutionPolicyPreference;process.env.PSExecutionPolicyPreference='Restricted';
 try{await installKernel({dir:output,exe,metadata:KRIG,request:async(_url,opts)=>{opts.onProgress({received:body.length,total:body.length});return body},log:()=>{},update:p=>stages.push(p.stage)})}finally{if(previous===undefined)delete process.env.PSExecutionPolicyPreference;else process.env.PSExecutionPolicyPreference=previous}
 assert.equal(stages.at(-1),'ready');assert.equal(digest(await fs.readFile(exe)),KRIG.exeSha256);assert.deepEqual(await fs.readdir(output),['krig-miner.exe']);
});
