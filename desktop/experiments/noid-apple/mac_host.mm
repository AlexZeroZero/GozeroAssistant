// SPDX-License-Identifier: Apache-2.0
// Selftests and bounded stdio worker. Network/session policy belongs to the host.
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <sys/sysctl.h>
#include <chrono>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include <algorithm>
#include <poll.h>
#include <unistd.h>
#include <cerrno>
#define GZ_FORCE_PORTABLE 1
#include "dispatch.h"
#include "cpu_batch.h"
#include "fixtures.h"

extern "C" Digest gz_pmull_hash(const Prepared*, U);
extern "C" void gz_pmull_hash4(const Prepared*, const U*, Digest*);

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static bool pmullAvailable() {
    int enabled = 0; size_t size = sizeof(enabled);
    return sysctlbyname("hw.optional.arm.FEAT_PMULL", &enabled, &size, nullptr, 0) == 0 && enabled == 1;
}
static NSString* sysText(const char* key) {
    char value[256] = {}; size_t length = sizeof(value);
    if (sysctlbyname(key, value, &length, nullptr, 0) != 0) return @"unavailable";
    return [NSString stringWithUTF8String:value] ?: @"unavailable";
}
static double seconds() { return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static int hexDigit(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    throw std::runtime_error("invalid fixture hex");
}
static void decode(const char* text, void* output, size_t size) {
    require(std::strlen(text) == size * 2, "fixture length mismatch");
    auto bytes = static_cast<unsigned char*>(output);
    for (size_t i = 0; i < size; ++i) bytes[i] = (hexDigit(text[2*i]) << 4) | hexDigit(text[2*i+1]);
}
static bool equal(Digest a, Digest b) { return std::memcmp(&a, &b, sizeof(a)) == 0; }
static Digest cpuHash(const Prepared& p, U nonce, bool accelerated) {
    return accelerated ? gz_pmull_hash(&p, nonce) : hashPrepared(p, nonce);
}

class GPU {
public:
    id<MTLDevice> device;
    id<MTLCommandQueue> queue;
    id<MTLComputePipelineState> hashPipeline, searchPipeline, multiplyPipeline;
    double lastGPUSeconds = 0;
    NSUInteger groupWidth = 0;
    explicit GPU(NSString* path, bool runtimeSource) {
        device = MTLCreateSystemDefaultDevice();
        require(device != nil && [device supportsFamily:MTLGPUFamilyApple1], "Apple-family Metal GPU required");
        queue = [device newCommandQueue]; require(queue != nil, "Metal queue unavailable");
        NSError* error = nil;
        id<MTLLibrary> library = nil;
        if (runtimeSource) {
            NSString* source = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
            if (!source) throw std::runtime_error(error.localizedDescription.UTF8String ?: "Metal source load failed");
            MTLCompileOptions* options = [MTLCompileOptions new];
            options.languageVersion = MTLLanguageVersion2_3;
            library = [device newLibraryWithSource:source options:options error:&error];
        } else library = [device newLibraryWithURL:[NSURL fileURLWithPath:path] error:&error];
        if (!library) throw std::runtime_error(error.localizedDescription.UTF8String ?: "metallib load failed");
        hashPipeline = pipeline(library, @"noid_hash");
        searchPipeline = pipeline(library, @"noid_search");
        multiplyPipeline = pipeline(library, @"noid_multiply");
    }
    id<MTLComputePipelineState> pipeline(id<MTLLibrary> library, NSString* name) {
        id<MTLFunction> fn = [library newFunctionWithName:name]; require(fn != nil, "Metal function missing");
        NSError* error = nil;
        auto result = [device newComputePipelineStateWithFunction:fn error:&error];
        if (!result) throw std::runtime_error(error.localizedDescription.UTF8String ?: "pipeline failed");
        return result;
    }
    id<MTLBuffer> buffer(size_t size) {
        auto result = [device newBufferWithLength:size options:MTLResourceStorageModeShared];
        require(result != nil, "Metal buffer allocation failed"); return result;
    }
    void finish(id<MTLCommandBuffer> command, id<MTLComputeCommandEncoder> encoder,
                id<MTLComputePipelineState> state, W count) {
        NSUInteger width = groupWidth ? groupWidth : state.threadExecutionWidth;
        require(width > 0 && width <= state.maxTotalThreadsPerThreadgroup && width % state.threadExecutionWidth == 0,
                "invalid Metal threadgroup width");
        [encoder dispatchThreads:MTLSizeMake(count, 1, 1) threadsPerThreadgroup:MTLSizeMake(width, 1, 1)];
        [encoder endEncoding]; [command commit]; [command waitUntilCompleted];
        if (command.status != MTLCommandBufferStatusCompleted)
            throw std::runtime_error(command.error.localizedDescription.UTF8String ?: "Metal command failed");
        lastGPUSeconds = command.GPUEndTime > command.GPUStartTime ? command.GPUEndTime - command.GPUStartTime : 0;
    }
    std::vector<Digest> hashes(const Request& request) {
        require(validRange(request.nonce, request.count), "invalid digest batch range");
        auto output = buffer(sizeof(Digest) * request.count);
        auto command = [queue commandBuffer]; auto encoder = [command computeCommandEncoder];
        require(command != nil && encoder != nil, "Metal encoder unavailable");
        [encoder setComputePipelineState:hashPipeline];
        [encoder setBytes:&request length:sizeof(request) atIndex:0];
        [encoder setBuffer:output offset:0 atIndex:1];
        finish(command, encoder, hashPipeline, request.count);
        std::vector<Digest> result(request.count);
        std::memcpy(result.data(), output.contents, sizeof(Digest) * request.count); return result;
    }
    std::vector<U> products(const std::vector<U>& pairs) {
        require(!pairs.empty() && pairs.size()%2==0 && pairs.size()<=65536,"invalid arithmetic test size");
        W count=pairs.size()/2;
        auto input=buffer(pairs.size()*sizeof(U)), output=buffer(count*sizeof(U));
        std::memcpy(input.contents,pairs.data(),pairs.size()*sizeof(U));
        auto command=[queue commandBuffer];auto encoder=[command computeCommandEncoder];
        require(command!=nil && encoder!=nil,"Metal encoder unavailable");
        [encoder setComputePipelineState:multiplyPipeline];
        [encoder setBuffer:input offset:0 atIndex:0];[encoder setBuffer:output offset:0 atIndex:1];
        finish(command,encoder,multiplyPipeline,count);
        std::vector<U> result(count);std::memcpy(result.data(),output.contents,count*sizeof(U));return result;
    }
    // Overflow retries the exact subranges before any result is returned.
    std::vector<U> search(const Request& request, Digest target, W capacity, bool accelerated) {
        require(validRange(request.nonce, request.count) && capacity > 0 && capacity <= 1048576, "invalid search range/capacity");
        auto candidates = buffer(sizeof(U) * capacity); auto matches = buffer(sizeof(W));
        *static_cast<W*>(matches.contents) = 0;
        auto command = [queue commandBuffer]; auto encoder = [command computeCommandEncoder];
        require(command != nil && encoder != nil, "Metal encoder unavailable");
        [encoder setComputePipelineState:searchPipeline];
        [encoder setBytes:&request length:sizeof(request) atIndex:0];
        [encoder setBytes:&target length:sizeof(target) atIndex:1];
        [encoder setBuffer:candidates offset:0 atIndex:2]; [encoder setBuffer:matches offset:0 atIndex:3];
        [encoder setBytes:&capacity length:sizeof(capacity) atIndex:4];
        finish(command, encoder, searchPipeline, request.count);
        W count = *static_cast<W*>(matches.contents);
        require(count <= request.count, "invalid GPU match count");
        if (count > capacity) {
            require(request.count > 1, "unsplittable overflow");
            Request left = request, right = request; left.count = request.count / 2;
            right.nonce = nonceAt(request.nonce, left.count); right.count -= left.count;
            auto a = search(left, target, capacity, accelerated), b = search(right, target, capacity, accelerated);
            a.insert(a.end(), b.begin(), b.end()); return a;
        }
        std::vector<U> result(count); std::memcpy(result.data(), candidates.contents, sizeof(U) * count);
        unsigned long long start = request.nonce.x | (static_cast<unsigned long long>(request.nonce.y) << 32);
        for (U nonce : result) {
            unsigned long long value = nonce.x | (static_cast<unsigned long long>(nonce.y) << 32);
            require(nonce.z == request.nonce.z && nonce.w == request.nonce.w && value >= start && value - start < request.count,
                    "GPU candidate outside nonce range");
            require(below(cpuHash(request.prepared, nonce, accelerated), target), "GPU candidate failed CPU recheck");
        }
        return result;
    }
};

static void cpuSelftest(bool accelerated) {
    for (const auto& fixture : FIXTURES) {
        U header[16]; Digest expected; decode(fixture.header, header, sizeof(header)); decode(fixture.digest, &expected, sizeof(expected));
        Prepared p = prepare(header);
        require(equal(hashPrepared(p, header[10]), expected), "portable fixture failed");
        if (accelerated) require(equal(gz_pmull_hash(&p, header[10]), expected), "PMULL fixture failed");
        U nonces[4] = {header[10], gx(header[10], {1, 0, 0, 0}), gx(header[10], {0xffffffff, 1, 0, 0}), gx(header[10], {0, 0, 1, 0})};
        Digest output[4]; hashPrepared4(p, nonces, output);
        for (W i = 0; i < 4; ++i) require(equal(output[i], hashPrepared(p, nonces[i])), "portable interleaved failed");
        if (accelerated) {
            gz_pmull_hash4(&p, nonces, output);
            for (W i = 0; i < 4; ++i) require(equal(output[i], hashPrepared(p, nonces[i])), "PMULL interleaved failed");
        }
    }
    Digest zero = {}, one = {{1,0,0,0},{0,0,0,0}};
    require(!below(zero,zero) && below(zero,one) && !below(one,zero), "strict target failed");
    require(!validRange({0xffffffff,0xffffffff,1,2},2), "nonce wrap accepted");
}

static void gpuSelftest(GPU& gpu, bool accelerated) {
    std::vector<U> pairs;
    for(W i=0;i<128;++i)for(W j=0;j<128;++j) {
        W a[4]={},b[4]={};a[i/32]=1u<<(i%32);b[j/32]=1u<<(j%32);
        pairs.push_back({a[0],a[1],a[2],a[3]});pairs.push_back({b[0],b[1],b[2],b[3]});
    }
    W seed=0xa991e;
    auto randomWord=[&]() {seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
    for(W i=0;i<4096;++i)for(W j=0;j<2;++j)pairs.push_back({randomWord(),randomWord(),randomWord(),randomWord()});
    U dense[]={{~0u,~0u,~0u,~0u},{0xaaaaaaaa,0xaaaaaaaa,0xaaaaaaaa,0xaaaaaaaa},
               {0x55555555,0x55555555,0x55555555,0x55555555},{0,0,0,0}};
    for(U a:dense)for(U b:dense){pairs.push_back(a);pairs.push_back(b);}
    auto products=gpu.products(pairs);
    for(size_t i=0;i<products.size();++i) {
        U expected=gm(pairs[2*i],pairs[2*i+1]);
        require(std::memcmp(&products[i],&expected,sizeof(U))==0,"Metal field multiplication mismatch");
    }
    for (const auto& fixture : FIXTURES) {
        U header[16]; Digest expected; decode(fixture.header, header, sizeof(header)); decode(fixture.digest, &expected, sizeof(expected));
        Request request = {prepare(header), header[10], 1};
        require(equal(gpu.hashes(request)[0], expected), "Metal fixture failed");
    }
    U header[16]; decode(FIXTURES[0].header, header, sizeof(header));
    Request request = {prepare(header), {0xfffffff8, 17, 0x12345678, 0xabcdef01}, 16};
    auto digests = gpu.hashes(request);
    for (W i = 0; i < request.count; ++i)
        require(equal(digests[i], hashPrepared(request.prepared, nonceAt(request.nonce,i))), "Metal carry/batch mismatch");
    Digest max = {{~0u,~0u,~0u,~0u},{~0u,~0u,~0u,~0u}}, zero = {};
    auto candidates = gpu.search(request, max, 4, accelerated);
    size_t expected = 0; for (Digest digest : digests) expected += below(digest,max);
    require(candidates.size() == expected, "Metal overflow retry lost candidates");
    std::vector<unsigned long long> counters;
    for (U n : candidates) counters.push_back(n.x | (static_cast<unsigned long long>(n.y) << 32));
    std::sort(counters.begin(),counters.end());
    require(std::adjacent_find(counters.begin(),counters.end()) == counters.end(), "duplicate GPU candidate");
    require(gpu.search(request, zero, 4, accelerated).empty(), "zero target matched");
    Request single = request; single.count = 1;
    require(gpu.search(single, digests[0], 1, accelerated).empty(), "Metal strict equality matched");
    for(W trial=0;trial<12;++trial) {
        U randomHeader[16];for(U& v:randomHeader)v={randomWord(),randomWord(),randomWord(),randomWord()};
        Request batch={prepare(randomHeader),{0xfffffff8,randomWord()&0x7fffffffu,randomWord(),randomWord()},16};
        auto actual=gpu.hashes(batch);
        for(W i=0;i<batch.count;++i)require(equal(actual[i],cpuHash(batch.prepared,nonceAt(batch.nonce,i),accelerated)),"Metal random header mismatch");
    }
}

static NSString* encodeHex(const void* value, size_t size) {
    const auto* bytes = static_cast<const unsigned char*>(value);
    std::string out(size * 2, '0'); const char* digits = "0123456789abcdef";
    for (size_t i=0;i<size;++i) {out[2*i]=digits[bytes[i]>>4];out[2*i+1]=digits[bytes[i]&15];}
    return [NSString stringWithUTF8String:out.c_str()];
}
static void emitJSON(NSDictionary* value) {
    NSData* data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    require(data!=nil,"worker JSON encoding failed");
    fwrite(data.bytes,1,data.length,stdout); fputc('\n',stdout); fflush(stdout);
}
static NSString* jsonString(NSDictionary* object, NSString* key) {
    id value=object[key]; require([value isKindOfClass:NSString.class],"missing worker string"); return value;
}
static unsigned jsonNumber(NSDictionary* object, NSString* key, unsigned low, unsigned high) {
    id value=object[key]; require([value isKindOfClass:NSNumber.class],"missing worker number");
    double n=[value doubleValue]; require(n>=low && n<=high && n==static_cast<unsigned>(n),"invalid worker integer");
    return static_cast<unsigned>(n);
}
static void workerLoop(GPU& gpu, bool accelerated, unsigned lifetime) {
    const double deadline=seconds()+lifetime;
    emitJSON(@{@"event":@"ready",@"cpuSelftest":@"passed",@"metalSelftest":@"passed",@"gpu":gpu.device.name,@"maxBatch":@65536});
    std::string pending, previousHeader; Prepared prepared;
    while(seconds()<deadline) {
        pollfd descriptor={STDIN_FILENO,POLLIN,0};
        int result=poll(&descriptor,1,500);
        if(result<0 && errno==EINTR) continue;
        require(result>=0,"worker stdin poll failed");
        if(result==0) continue;
        char chunk[2048]; ssize_t length=read(STDIN_FILENO,chunk,sizeof(chunk));
        if(length==0) return; // Parent pipe closed: no orphan mining.
        require(length>0,"worker stdin read failed"); pending.append(chunk,length);
        require(pending.size()<=8192,"worker input line too long");
        size_t newline;
        while((newline=pending.find('\n'))!=std::string::npos) {
            @autoreleasepool {
                std::string line=pending.substr(0,newline); pending.erase(0,newline+1);
                if(line.empty()) continue;
                require(seconds()<deadline,"worker lifetime expired");
                NSData* bytes=[NSData dataWithBytes:line.data() length:line.size()];
                id parsed=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
                require([parsed isKindOfClass:NSDictionary.class],"worker request must be an object");
                NSDictionary* request=parsed;
                unsigned idValue=jsonNumber(request,@"id",1,0x7fffffffu);
                unsigned count=jsonNumber(request,@"count",1,65536);
                unsigned capacity=jsonNumber(request,@"capacity",1,256);
                NSString* fields=jsonString(request,@"fields");
                U header[16], nonce; Digest target;
                decode(fields.UTF8String,header,sizeof(header));
                decode(jsonString(request,@"nonce").UTF8String,&nonce,sizeof(nonce));
                decode(jsonString(request,@"target").UTF8String,&target,sizeof(target));
                require(validRange(nonce,count),"worker nonce range overflow");
                // Pathological easy targets could return huge JSON. Admission
                // limits output, and live pool targets are many orders smaller.
                if(previousHeader!=fields.UTF8String) {prepared=prepare(header);previousHeader=fields.UTF8String;}
                double start=seconds();
                auto candidates=gpu.search({prepared,nonce,count},target,capacity,accelerated);
                require(candidates.size()<=1024,"worker candidate output limit exceeded");
                NSMutableArray* values=[NSMutableArray array];
                for(U candidate:candidates) {
                    Digest digest=cpuHash(prepared,candidate,accelerated);
                    require(below(digest,target),"worker CPU verification failed");
                    [values addObject:@{@"nonce":encodeHex(&candidate,sizeof(candidate)),@"cpuDigest":encodeHex(&digest,sizeof(digest))}];
                }
                emitJSON(@{@"id":@(idValue),@"count":@(count),@"elapsedSeconds":@(seconds()-start),@"candidates":values});
            }
        }
    }
    emitJSON(@{@"event":@"lifetime-ended"});
}

int main(int argc, char** argv) {
    @autoreleasepool {
        try {
            bool pmull = pmullAvailable();
            if (argc == 2 && std::string(argv[1]) == "--pmull-available") { puts(pmull ? "true" : "false"); return 0; }
            bool cpuOnly = false, benchmark = false, runtimeSource = false; W count = 32; NSString* library = nil; unsigned workerSeconds=0;
            unsigned searchSeconds=0, searchBatch=65536, groupWidth=0;
            for (int i = 1; i < argc; ++i) {
                std::string arg(argv[i]);
                if (arg == "--cpu-only") cpuOnly = true;
                else if (arg == "--benchmark") benchmark = true;
                else if ((arg == "--search-seconds" || arg == "--search-batch" || arg == "--threadgroup") && i+1<argc) {
                    std::string value(argv[++i]); size_t used=0; unsigned long n=std::stoul(value,&used);
                    unsigned limit=arg=="--search-seconds" ? 60 : arg=="--search-batch" ? 65536 : 1024;
                    require(used==value.size() && n>=1 && n<=limit,"invalid search benchmark option");
                    if(arg=="--search-seconds") searchSeconds=n;
                    else if(arg=="--search-batch") searchBatch=n;
                    else groupWidth=n;
                }
                else if (arg == "--worker-seconds" && i + 1 < argc) {
                    std::string value(argv[++i]); size_t used=0; unsigned long parsed=std::stoul(value,&used);
                    require(used==value.size() && parsed>=1 && parsed<=900,"worker lifetime must be 1..900 seconds");
                    workerSeconds=static_cast<unsigned>(parsed);
                }
                else if (arg == "--metallib" && i + 1 < argc) library = [NSString stringWithUTF8String:argv[++i]];
                else if (arg == "--metal-source" && i + 1 < argc) { runtimeSource = true; library = [NSString stringWithUTF8String:argv[++i]]; }
                else if (arg == "--count" && i + 1 < argc) {
                    std::string value(argv[++i]); size_t consumed = 0; unsigned long parsed = std::stoul(value,&consumed);
                    require(consumed == value.size() && parsed >= 4 && parsed <= 4096 && parsed % 4 == 0, "count must be a multiple of 4 in [4,4096]"); count = static_cast<W>(parsed);
                } else throw std::runtime_error("Usage: noid-apple-check [--cpu-only | --metallib FILE | --metal-source FILE] [--benchmark --count 32] [--search-seconds 1..60 --search-batch 1..65536 --threadgroup N] [--worker-seconds 1..900]");
            }
            require(!cpuOnly || (!searchSeconds && !groupWidth),"search/threadgroup options require Metal");
            cpuSelftest(pmull);
            if(workerSeconds) {
                require(!cpuOnly && !benchmark && !searchSeconds && library!=nil,"worker requires Metal and no benchmark flag");
                GPU gpu(library,runtimeSource); gpu.groupWidth=groupWidth; gpuSelftest(gpu,pmull);
                workerLoop(gpu,pmull,workerSeconds); return 0;
            }
            NSMutableDictionary* report = [@{@"scope":@"offline correctness and synthetic benchmark; no pool shares", @"model":sysText("hw.model"),
                @"chip":sysText("machdep.cpu.brand_string"), @"os":NSProcessInfo.processInfo.operatingSystemVersionString,
                @"compiler":@(__clang_version__), @"cpuSelftest":@"passed", @"pmullAvailable":@(pmull),
                @"powerWatts":[NSNull null], @"temperatureC":[NSNull null], @"workerCount":@1, @"count":@(count)} mutableCopy];
            U header[16]; decode(FIXTURES[0].header,header,sizeof(header)); Request request = {prepare(header), {0,0,1,2}, count};
            if (benchmark) {
                double start = seconds(); Digest result = {}; W checksum = 0;
                for (W i = 0; i < count; ++i) { result = cpuHash(request.prepared,nonceAt(request.nonce,i),pmull); checksum ^= result.a.x; }
                double elapsed = seconds() - start;
                report[@"cpuSingle"] = @{@"seconds":@(elapsed), @"hashesPerSecond":@(count / elapsed), @"checksum":@(checksum), @"backend":pmull?@"PMULL":@"portable"};
                start = seconds(); checksum = 0;
                for (W i = 0; i < count; i += 4) {
                    U nonces[4]; Digest output[4]; for (W j = 0; j < 4; ++j) nonces[j] = nonceAt(request.nonce,i+j);
                    if (pmull) gz_pmull_hash4(&request.prepared,nonces,output); else hashPrepared4(request.prepared,nonces,output);
                    for (Digest digest : output) checksum ^= digest.a.x;
                }
                elapsed = seconds() - start;
                report[@"cpuFour"] = @{@"seconds":@(elapsed), @"hashesPerSecond":@(count / elapsed), @"checksum":@(checksum)};
            }
            if (!cpuOnly) {
                require(library != nil, "provide --metallib, --metal-source or --cpu-only");
                GPU gpu(library, runtimeSource); gpu.groupWidth=groupWidth; gpuSelftest(gpu, pmull);
                report[@"metalSelftest"] = @"passed"; report[@"gpu"] = gpu.device.name;
                report[@"metalArithmeticPairs"] = @20496;
                report[@"metalRandomHeaderDigests"] = @192;
                report[@"metalCompilation"] = runtimeSource ? @"runtime-source" : @"offline-metallib";
                report[@"appleFamily1"] = @([gpu.device supportsFamily:MTLGPUFamilyApple1]);
                report[@"unifiedMemory"] = @(gpu.device.hasUnifiedMemory);
                report[@"threadExecutionWidth"] = @(gpu.searchPipeline.threadExecutionWidth);
                report[@"maxThreadsPerThreadgroup"] = @(gpu.searchPipeline.maxTotalThreadsPerThreadgroup);
                report[@"threadgroup"] = @(groupWidth ? groupWidth : gpu.searchPipeline.threadExecutionWidth);
                if(searchSeconds) {
                    // A nontrivial target forces the real search path. All candidates
                    // are CPU checked; full digest checks remain outside timing.
                    Digest target={{0,0,0,0},{0,0,0,0x0000ffffu}};
                    Request batch=request; batch.count=searchBatch;
                    for(unsigned i=0;i<8;++i) {gpu.search(batch,target,256,pmull);batch.nonce=nonceAt(batch.nonce,batch.count);}
                    double start=seconds(), gpuTime=0; unsigned long long hashes=0, batches=0, candidates=0;
                    while(seconds()-start<searchSeconds) {
                        @autoreleasepool {
                            candidates+=gpu.search(batch,target,256,pmull).size();gpuTime+=gpu.lastGPUSeconds;
                            hashes+=batch.count;++batches;batch.nonce=nonceAt(batch.nonce,batch.count);
                        }
                    }
                    double wall=seconds()-start;
                    report[@"metalSearch"] = @{@"wallSeconds":@(wall),@"gpuSeconds":@(gpuTime),@"hashes":@(hashes),
                        @"batches":@(batches),@"batch":@(searchBatch),@"cpuCheckedCandidates":@(candidates),
                        @"hashesPerSecondWall":@(hashes/wall),@"hashesPerSecondGPU":gpuTime>0?@(hashes/gpuTime):[NSNull null],@"warmupBatches":@8};
                }
                if (benchmark) {
                    double start = seconds(); auto output = gpu.hashes(request); double wall = seconds() - start;
                    double gpuTime = gpu.lastGPUSeconds;
                    for (W i = 0; i < count; ++i) require(equal(output[i],cpuHash(request.prepared,nonceAt(request.nonce,i),pmull)), "benchmark digest mismatch");
                    report[@"metalDigestBatch"] = @{@"wallSeconds":@(wall), @"gpuSeconds":gpuTime > 0 ? @(gpuTime) : [NSNull null], @"hashesPerSecondWall":@(count / wall)};
                }
            } else report[@"metalSelftest"] = @"not run";
            NSData* data = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
            puts([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String); return 0;
        } catch (const std::exception& error) { fprintf(stderr,"selftest failed: %s\n",error.what()); return 1; }
    }
}
