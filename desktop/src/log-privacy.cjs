'use strict';
const {isIP}=require('node:net');

// Display-only filtering. Never rewrite connection targets or miner input.
function hideNetworkAddresses(value){
 return String(value)
  .replace(/\[?[\da-f:.%]*:[\da-f:.%]+\]?/gi,token=>{
   const address=token.replace(/^\[|\]$/g,'');
   return isIP(address)===6?'[IP已隐藏]':token;
  })
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,token=>isIP(token)===4?'[IP已隐藏]':token);
}
module.exports={hideNetworkAddresses};
