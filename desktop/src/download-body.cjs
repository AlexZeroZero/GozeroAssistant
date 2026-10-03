'use strict';
async function readBody(response,maxBytes,onProgress){
 const length=Number(response.headers.get('content-length'));
 if(length>maxBytes)throw Error('来源数据过大');
 const encoding=response.headers.get('content-encoding');
 const total=Number.isFinite(length)&&length>0&&(!encoding||encoding==='identity')?length:null;
 const parts=[];let received=0,last=0;
 onProgress?.({received,total});
 for await(const part of response.body){
  received+=part.length;if(received>maxBytes)throw Error('来源数据超过限制');parts.push(Buffer.from(part));
  if(Date.now()-last>=200){last=Date.now();onProgress?.({received,total})}
 }
 if(total!==null&&received!==total)throw Error('下载不完整，请重试');
 onProgress?.({received,total});return Buffer.concat(parts);
}
module.exports={readBody};
