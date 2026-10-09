fn main() {
    assert_eq!(std::env::var("CARGO_CFG_TARGET_ARCH").unwrap(), "aarch64");
    assert_eq!(std::env::var("CARGO_CFG_TARGET_OS").unwrap(), "macos");
    cc::Build::new().include("vendor/argon2/include").include("vendor/argon2/src")
        .define("ARGON2_NO_THREADS", None).opt_level(3)
        .files(["vendor/argon2/src/argon2.c", "vendor/argon2/src/core.c",
            "vendor/argon2/src/encoding.c", "vendor/argon2/src/ref.c",
            "vendor/argon2/src/blake2/blake2b.c", "native/mac.c"])
        .compile("argon2_mac");
    println!("cargo:rerun-if-changed=native");
    println!("cargo:rerun-if-changed=vendor");
}
