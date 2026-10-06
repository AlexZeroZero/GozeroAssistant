// SPDX-License-Identifier: Apache-2.0
// Offline ABBA comparison: compile/check both pipelines before measurement,
// then alternate small equal-work blocks to reduce thermal-order confounding.
#define main gz_unused_host_main
#include "../mac_host.mm"
#undef main

int main(int argc,const char* argv[]) {
 @autoreleasepool {try {
    require(argc==3,"Usage: compare-metal baseline.metal candidate.metal");
    bool accelerated=pmullAvailable();cpuSelftest(accelerated);
    GPU a([NSString stringWithUTF8String:argv[1]],true),b([NSString stringWithUTF8String:argv[2]],true);
    gpuSelftest(a,accelerated);gpuSelftest(b,accelerated);
    U header[16];decode(FIXTURES[0].header,header,sizeof(header));
    Request request={prepare(header),{0,0,1,2},4096};
    for(GPU* gpu:{&a,&b}) {
        auto hashes=gpu->hashes(request);
        for(W i=0;i<request.count;++i)require(equal(hashes[i],cpuHash(request.prepared,nonceAt(request.nonce,i),accelerated)),"full digest mismatch");
    }
    request.count=65536;
    Digest target={{0,0,0,0},{0,0,0,0x0000ffffu}};
    for(unsigned i=0;i<8;++i)for(GPU* gpu:{&a,&b})gpu->search(request,target,256,accelerated);
    Request jobs[2]={request,request};double wall[2]={},gpuTime[2]={};unsigned long long counts[2]={};
    NSMutableArray* blocks=[NSMutableArray new];
    for(unsigned cycle=0;cycle<64;++cycle)for(unsigned step=0;step<4;++step) {
        @autoreleasepool {
            unsigned v=(step==0||step==3)?cycle%2:1-cycle%2;
            GPU& gpu=v?b:a;double start=seconds(),gpuSeconds=0;unsigned candidates=0;
            for(unsigned batch=0;batch<4;++batch){candidates+=gpu.search(jobs[v],target,256,accelerated).size();gpuSeconds+=gpu.lastGPUSeconds;jobs[v].nonce=nonceAt(jobs[v].nonce,jobs[v].count);}
            double duration=seconds()-start;wall[v]+=duration;gpuTime[v]+=gpuSeconds;counts[v]+=4*65536;
            [blocks addObject:@{@"variant":@(v),@"cycle":@(cycle),@"wallSeconds":@(duration),@"gpuSeconds":@(gpuSeconds),@"hashes":@(4*65536),@"candidates":@(candidates),@"thermalState":@(NSProcessInfo.processInfo.thermalState)}];
        }
    }
    emitJSON(@{@"scope":@"offline equal-work ABBA, pipelines precompiled, CPU candidate checks enabled",@"selftests":@"passed",@"model":sysText("hw.model"),@"chip":sysText("machdep.cpu.brand_string"),@"baselineRate":@(counts[0]/wall[0]),@"candidateRate":@(counts[1]/wall[1]),@"ratio":@((counts[1]/wall[1])/(counts[0]/wall[0])),@"baselineGPUSeconds":@(gpuTime[0]),@"candidateGPUSeconds":@(gpuTime[1]),@"hashesPerVariant":@(counts[0]),@"blocks":blocks});
    return 0;
 }catch(const std::exception& e){fprintf(stderr,"comparison failed: %s\n",e.what());return 1;}}
}
