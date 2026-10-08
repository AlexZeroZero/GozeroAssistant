'use strict';
// FIPS 202 SHA3-256 (rate 1088, capacity 512, suffix 0x06).
// Electron's BoringSSL-backed node:crypto does not expose SHA3 on Windows.
// Used only for short public address checksums, not for the mining hot path.
const MASK=(1n<<64n)-1n;
const ROT=[0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const RC=[0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];
const rotate=(v,n)=>n?((v<<BigInt(n))|(v>>BigInt(64-n)))&MASK:v;
function permute(a){
 for(const rc of RC){
  const c=Array(5).fill(0n),d=Array(5),b=Array(25);
  for(let x=0;x<5;x++)for(let y=0;y<5;y++)c[x]^=a[x+5*y];
  for(let x=0;x<5;x++)d[x]=c[(x+4)%5]^rotate(c[(x+1)%5],1);
  for(let x=0;x<5;x++)for(let y=0;y<5;y++)b[y+5*((2*x+3*y)%5)]=rotate(a[x+5*y]^d[x],ROT[x+5*y]);
  for(let x=0;x<5;x++)for(let y=0;y<5;y++)a[x+5*y]=b[x+5*y]^((~b[(x+1)%5+5*y])&b[(x+2)%5+5*y]);
  a[0]^=rc;
 }
}
function sha3_256(input){
 const bytes=Buffer.from(input),rate=136,padded=Buffer.alloc((Math.floor(bytes.length/rate)+1)*rate);
 bytes.copy(padded);padded[bytes.length]=0x06;padded[padded.length-1]|=0x80;
 const a=Array(25).fill(0n);
 for(let offset=0;offset<padded.length;offset+=rate){for(let i=0;i<rate/8;i++)a[i]^=padded.readBigUInt64LE(offset+i*8);permute(a)}
 const result=Buffer.alloc(32);for(let i=0;i<4;i++)result.writeBigUInt64LE(a[i],i*8);return result;
}
module.exports={sha3_256};
