// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 the Jetsam developers.

//! Operator tool: derive a chain address from a 32-byte secret held in a file.
//!
//! Used to produce the launch development-fund addresses. The secret never
//! appears in the output — only the derived public address does.
//!
//! ```text
//! JETSAM_SECRET_FILE=/path/to/secret.key \
//!   cargo test --release -p jetsam_poseidon2b --test derive_fund_address \
//!   -- --ignored --nocapture
//! ```

use jetsam_poseidon2b::primitives::{derive_address, SpendSecret};

#[test]
#[ignore = "operator tool; needs JETSAM_SECRET_FILE"]
fn derive_address_from_secret_file() {
    let path = std::env::var("JETSAM_SECRET_FILE")
        .expect("set JETSAM_SECRET_FILE to the path of a 64-hex-character secret");
    let raw = std::fs::read_to_string(&path).expect("read secret file");
    let hex = raw.trim();
    assert_eq!(
        hex.len(),
        64,
        "secret must be exactly 64 hex characters (32 bytes)"
    );

    let mut bytes = [0u8; 32];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16)
            .expect("secret file must be hexadecimal");
    }
    assert_ne!(bytes, [0u8; 32], "refusing an all-zero secret");

    let secret = SpendSecret::from_bytes(bytes);
    let address = derive_address(&secret);

    // Public output only. The secret is never printed.
    println!("\nsource      : {path}");
    println!("bech32      : {}", address.to_bech32());
    println!("rust literal:");
    println!("Address([");
    for chunk in address.0.chunks(16) {
        let line: Vec<String> = chunk.iter().map(|b| format!("0x{b:02x}")).collect();
        println!("    {},", line.join(", "));
    }
    println!("]);");
}
