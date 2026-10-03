'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const i18n=require('../renderer/i18n.js'),catalog=require('../renderer/translations.js');
const {DEFAULT,validate,ConfigStore}=require('../src/config.cjs'),{compactState}=require('../src/floating.cjs');
test('language preference migrates old profiles, validates and persists without changing mining data',async()=>{
 assert.equal(validate({}).language,'zh-CN');
 for(const language of ['fr','',null,'en<script>'])assert.throws(()=>validate({...DEFAULT,language}));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-language-'));
 try{const store=new ConfigStore(dir);await store.load();const original=validate({...DEFAULT,coin:'QTC',performance:50,wallets:{...DEFAULT.wallets,QTC:'qzFixtureWallet'},selected:['a'.repeat(20)]});
 for(const language of i18n.languages){await store.save({...original,language});const again=new ConfigStore(dir);await again.load();assert.equal(again.value.language,language);assert.deepEqual({...again.value,language:'zh-CN'},original)}}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('translation preserves numeric data, wallet addresses, pool URLs and source Chinese',()=>{
 const raw=['116.53 MH/s','$0.47','stratum+ssl://qtc-sg.kryptex.network:8049','qznnFtCeGgoeaAEjAHkzf8KvGkxJREV2VpqKerinPXditU3Ph','RTX 5060 Laptop GPU','<script>alert(1)</script>'];
 for(const locale of i18n.languages)for(const value of raw)assert.equal(i18n.t(value,locale),value);
 assert.equal(i18n.t('均衡 · 75%','en'),'Balanced · 75%');
 assert.equal(i18n.t('已停止','ru'),'Остановлено');
 assert.equal(i18n.t('已停止','ja'),'停止済み');
 assert.equal(i18n.t('已停止','zh-CN'),'已停止');
 assert.equal(i18n.t('已停止','unknown'),'已停止');
 assert.equal(i18n.t('0.5% 服务时段','en'),'0.5% fee period');
});
test('catalog has all three translations for every source phrase',()=>{
 for(const [source,values]of Object.entries(catalog)){assert.equal(values.length,3,source);assert.ok(values.every(v=>typeof v==='string'&&v.trim()),source);for(const locale of ['en','ru'])assert.ok(!/[\u3400-\u9fff]/.test(i18n.t(source,locale)),source)}
});
test('floating stopped state distinguishes initial idle and fee transitions, keeps last average and language',()=>{
 const state={config:{...DEFAULT,language:'ru',coin:'QTC'},miner:{status:'idle',jobs:[]}};
 assert.equal(compactState(state).stopped,false);
 state.miner.session={coin:'QTC',performance:75};state.miner.hashAverage={running:false,hash:123e6,coverage:.8};
 let mini=compactState(state);assert.equal(mini.stopped,true);assert.equal(mini.language,'ru');assert.equal(mini.hash,123e6);
 for(const status of ['starting','running','stopping']){state.miner.status=status;assert.equal(compactState(state).stopped,false)}
 state.miner.status='idle';state.serviceFee={active:true,switching:true};assert.equal(compactState(state).stopped,false);
});
