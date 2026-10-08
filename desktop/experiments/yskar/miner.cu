// MIT. Uses the YSKAR developers' pinned SHA-256d functions; see upstream/LICENSE.
#include "yskar_sha256.h"
// Broadcast a job's immutable inputs as in the upstream CUDA backend.
extern "C" {
__constant__ uint32_t ysr_c_mid[8];
__constant__ uint8_t ysr_c_target[32];
}
extern "C" __global__ void ysr_prepare(const uint8_t* header,uint32_t* mid) {
 if(threadIdx.x==0&&blockIdx.x==0)yskar_midstate(mid,header);
}
extern "C" __global__ void ysr_hash(const uint32_t* mid,uint64_t nonce,uint8_t* digest) {
 if(threadIdx.x==0&&blockIdx.x==0)gz_hash_nonce(digest,mid,nonce);
}
// Report all candidates, including nonce 2^64-1. The host bounds the range and
// splits on overflow; completed work never includes unsearched nonce ranges.
extern "C" __global__ void ysr_search(const uint32_t* mid,const uint8_t* target,
 uint64_t start,uint32_t count,uint32_t* found,uint64_t* nonces) {
 const uint32_t stride=blockDim.x*gridDim.x;
 for(uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;i<count;i+=stride){
  uint8_t digest[32];uint64_t nonce=start+i;gz_hash_nonce(digest,ysr_c_mid,nonce);
  if(yskar_meets_target(digest,ysr_c_target)){uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=nonce;}
 }
}
// Retain the validated upstream arithmetic for device-specific calibration.
extern "C" __global__ void ysr_search_reference(const uint32_t* mid,const uint8_t* target,
 uint64_t start,uint32_t count,uint32_t* found,uint64_t* nonces) {
 const uint32_t stride=blockDim.x*gridDim.x;
 for(uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;i<count;i+=stride){
  uint8_t digest[32];uint64_t nonce=start+i;yskar_hash_nonce(digest,ysr_c_mid,nonce);
  if(yskar_meets_target(digest,ysr_c_target)){uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=nonce;}
 }
}
