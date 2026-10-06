// SPDX-License-Identifier: Apache-2.0
// Offline selftest/benchmark only. No pool connection or background mining.
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <sys/sysctl.h>
#include <chrono>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include <algorithm>
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
    id<MTLComputePipelineState> hashPipeline, searchPipeline;
    double lastGPUSeconds = 0;
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
        NSUInteger width = std::min<NSUInteger>(state.maxTotalThreadsPerThreadgroup, state.threadExecutionWidth);
        require(width > 0, "invalid Metal threadgroup width");
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
}

int main(int argc, char** argv) {
    @autoreleasepool {
        try {
            bool pmull = pmullAvailable();
            if (argc == 2 && std::string(argv[1]) == "--pmull-available") { puts(pmull ? "true" : "false"); return 0; }
            bool cpuOnly = false, benchmark = false, runtimeSource = false; W count = 32; NSString* library = nil;
            for (int i = 1; i < argc; ++i) {
                std::string arg(argv[i]);
                if (arg == "--cpu-only") cpuOnly = true;
                else if (arg == "--benchmark") benchmark = true;
                else if (arg == "--metallib" && i + 1 < argc) library = [NSString stringWithUTF8String:argv[++i]];
                else if (arg == "--metal-source" && i + 1 < argc) { runtimeSource = true; library = [NSString stringWithUTF8String:argv[++i]]; }
                else if (arg == "--count" && i + 1 < argc) {
                    std::string value(argv[++i]); size_t consumed = 0; unsigned long parsed = std::stoul(value,&consumed);
                    require(consumed == value.size() && parsed >= 4 && parsed <= 4096 && parsed % 4 == 0, "count must be a multiple of 4 in [4,4096]"); count = static_cast<W>(parsed);
                } else throw std::runtime_error("Usage: noid-apple-check [--cpu-only | --metallib FILE | --metal-source FILE] [--benchmark --count 32]");
            }
            cpuSelftest(pmull);
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
                GPU gpu(library, runtimeSource); gpuSelftest(gpu, pmull);
                report[@"metalSelftest"] = @"passed"; report[@"gpu"] = gpu.device.name;
                report[@"metalCompilation"] = runtimeSource ? @"runtime-source" : @"offline-metallib";
                report[@"appleFamily1"] = @([gpu.device supportsFamily:MTLGPUFamilyApple1]);
                report[@"unifiedMemory"] = @(gpu.device.hasUnifiedMemory);
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
