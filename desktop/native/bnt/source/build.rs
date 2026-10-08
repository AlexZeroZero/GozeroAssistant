fn base() -> cc::Build {
    let mut b = cc::Build::new();
    b.include("vendor/argon2/include").include("vendor/argon2/src")
        .define("ARGON2_NO_THREADS", None).opt_level(3).warnings(false).cargo_metadata(false);
    b
}
fn main() {
    assert_eq!(std::env::var("CARGO_CFG_TARGET_ARCH").unwrap(), "x86_64", "This experimental build targets x86_64 only");
    base().file("vendor/argon2/src/opt.c").flag("-msse2")
        .define("fill_segment", "fill_segment_sse2").compile("argon2_sse2");
    base().file("vendor/argon2/src/opt.c").flag("-mavx2")
        .define("fill_segment", "fill_segment_avx2").compile("argon2_avx2");
    base().file("native/gozero-stream.c").flag("-mavx2")
        .define("fill_segment", "fill_segment_stream").compile("argon2_stream");
    base().file("native/gozero-opt.c").flag("-mavx2")
        .define("fill_segment", "fill_segment_gozero").compile("argon2_gozero");
    base().file("native/gozero-opt.c").flag("-mavx2").define("GOZERO_PREFETCH", None)
        .define("fill_segment", "fill_segment_prefetch").compile("argon2_prefetch");
    base().file("vendor/argon2/src/opt.c").flag("-mavx512f")
        .define("fill_segment", "fill_segment_avx512").compile("argon2_avx512");
    base().file("native/gozero-opt.c").flag("-mavx512f")
        .define("fill_segment", "fill_segment_gozero512").compile("argon2_gozero512");
    base().file("native/gozero-opt.c").flag("-mavx512f").define("GOZERO_PREFETCH", None)
        .define("fill_segment", "fill_segment_prefetch512").compile("argon2_prefetch512");
    base().files(["vendor/argon2/src/argon2.c", "vendor/argon2/src/core.c",
        "vendor/argon2/src/encoding.c", "vendor/argon2/src/blake2/blake2b.c", "native/bridge.c", "native/platform.c"])
        .compile("argon2_core");
    println!("cargo:rustc-link-search=native={}", std::env::var("OUT_DIR").unwrap());
    // GNU archive resolution is order-sensitive: dispatcher before SIMD bodies.
    for lib in ["argon2_core", "argon2_stream", "argon2_sse2", "argon2_avx2", "argon2_gozero", "argon2_prefetch", "argon2_avx512", "argon2_gozero512", "argon2_prefetch512"] {
        println!("cargo:rustc-link-lib=static={lib}");
    }
    println!("cargo:rustc-link-lib=advapi32");
    println!("cargo:rerun-if-changed=native");
    println!("cargo:rerun-if-changed=vendor");
}
