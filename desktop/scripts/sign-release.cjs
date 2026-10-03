// Run after packaging. The private signing key stays local and never enters dist/.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const sequence=Number(process.argv[2]);if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('Pass a strictly increasing release sequence');
const name=`GozerAssistant-${pkg.version}-win-x64.zip`,file=path.join(root,'dist',name),hash=fs.readFileSync(file+'.sha256','utf8').split(/\s/)[0];
const data={schema:1,channel:pkg.releaseChannel||'development',displayVersion:pkg.displayVersion||pkg.version,sequence,version:pkg.version,publishedAt:Date.now(),expiresAt:Date.now()+90*86400000,url:'https://pro.gozero.trade/downloads/gozer/'+name,sha256:hash,bytes:fs.statSync(file).size,coins:[{symbol:'PRL',minAppVersion:'0.3.0',mining:true,kernel:'KRig'},{symbol:'QTC',minAppVersion:'0.3.0',mining:true,kernel:'KRig',experimental:'Gozer CUDA compute'},{symbol:'TSC',minAppVersion:'0.3.0',mining:false}],notes:['新增GPU / CPU租赁市场，实时价格与详细参数、租金试算','新增4090、5090、3090、RTX PRO 6000快捷筛选','Clore / Vast.ai跳转使用官方推荐链接；版本更新为Beta 1.01']};
const body=Buffer.from(JSON.stringify(data)),key=fs.readFileSync(path.join(root,'../.local/gozer-signing/private.pem'));
const envelope={payload:body.toString('base64'),signature:crypto.sign(null,body,key).toString('base64')};
require('../src/updates.cjs').verify(envelope,fs.readFileSync(path.join(root,'src/update-key.pem')),sequence);
fs.writeFileSync(path.join(root,'dist/release.json'),JSON.stringify(envelope));console.log('Signed release',pkg.version,'sequence',sequence,'bytes',data.bytes);
