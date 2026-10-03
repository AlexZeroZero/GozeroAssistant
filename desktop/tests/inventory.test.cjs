const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const exec=require('node:util').promisify(require('node:child_process').execFile);
const {readInventory,FILE}=require('../src/inventory.cjs');
const {normalizeInventory}=require('../src/hardware.cjs');
const PS=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
test('inventory launch is a fixed native executable without shell or script-policy arguments',async()=>{
 const raw={cpu:[],memory:[],gpus:[],board:[],bios:[],os:[],cache:[],warnings:[]};
 assert.deepEqual(await readInventory(async(file,args,options)=>{assert.equal(file,FILE);assert.deepEqual(args,[]);assert.equal(options.windowsHide,true);assert.ok(options.timeout<=45000);assert.equal(options.shell,undefined);return{stdout:JSON.stringify(raw)}}),raw);
});
test('scanner failures produce bounded Chinese messages instead of localized command stderr',async()=>{
 for(const [error,pattern]of [[{code:'ENOENT'},/组件缺失/],[{killed:true},/超时/],[{code:'EACCES'},/阻止/],[{stderr:'INVENTORY_UNAVAILABLE'},/WMI/],[{stderr:'乱码 Command failed private path'},/组件运行失败/]])await assert.rejects(readInventory(async()=>{throw error}),pattern);
 await assert.rejects(readInventory(async()=>({stdout:'broken'})),/格式无效/);
 await assert.rejects(readInventory(async()=>({stdout:'{}'})),/格式无效/);
});
test('download-marked unsigned PS1 fails RemoteSigned while native inventory works under Restricted and AllSigned',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-inventory-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=path.join(dir,'inventory.ps1'),file=path.join(dir,'Inventory.exe');
 await fs.copyFile(path.join(__dirname,'../scripts/inventory.ps1'),old);await fs.copyFile(FILE,file);
 for(const target of [old,file])await fs.writeFile(target+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\n');
 await assert.rejects(exec(PS,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',old],{windowsHide:true,timeout:20000,encoding:'buffer'}),e=>e.code!==0&&e.stderr.toString().includes('UnauthorizedAccess'));
 let first;
 for(const policy of ['Restricted','AllSigned']){
  const {stdout}=await exec(file,[],{windowsHide:true,timeout:45000,encoding:'utf8',env:{...process.env,PSExecutionPolicyPreference:policy}});
  const raw=JSON.parse(stdout);assert.ok(raw.cpu.length&&raw.memory.length);assert.ok(raw.gpus.every(g=>g.pnp.startsWith('PCI\\')));assert.ok(raw.gpus.some(g=>/^[0-9a-f]+:[0-9a-f]{2}\.[0-7]$/.test(g.pci)));assert.equal(normalizeInventory(raw).gpus.length,raw.gpus.length);first=raw;
 }
 assert.ok(first.cache.length);assert.ok(first.board.length);assert.ok(first.bios.length);
});
