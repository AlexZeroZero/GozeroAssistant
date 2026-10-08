//! Proof of Work using Argon2id
//!
//! Memory-hard PoW to resist ASICs and ensure fair mining.
//! Uses 2GB memory, making specialized hardware impractical.

use argon2::{Algorithm, Argon2, Params, Version};

/// Argon2id parameters for PoW
/// - Memory: 2GB (2097152 KB)
/// - Iterations: 1 (memory-hardness is the goal)
/// - Parallelism: 1 (single-threaded for fairness)
/// - Output: 32 bytes
const POW_MEMORY_KB: u32 = 2 * 1024 * 1024; // 2GB in KB
const POW_ITERATIONS: u32 = 1;
const POW_PARALLELISM: u32 = 1;
const POW_OUTPUT_LEN: usize = 32;

/// Compute Argon2id hash for proof of work
///
/// # Arguments
/// * `block_header` - Serialized block header (without nonce), used as salt
/// * `nonce` - 8-byte nonce, used as password
///
/// # Returns
/// * 32-byte hash on success, or error code
#[unsafe(no_mangle)]
pub extern "C" fn blocknet_pow_hash(
    header_ptr: *const u8,
    header_len: usize,
    nonce: u64,
    output_ptr: *mut u8,
) -> i32 {
    if header_ptr.is_null() || output_ptr.is_null() {
        return -1;
    }

    let header = unsafe { std::slice::from_raw_parts(header_ptr, header_len) };
    let nonce_bytes = nonce.to_le_bytes();

    // Create Argon2id hasher with PoW parameters
    let params = match Params::new(POW_MEMORY_KB, POW_ITERATIONS, POW_PARALLELISM, Some(POW_OUTPUT_LEN)) {
        Ok(p) => p,
        Err(_) => return -2,
    };

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    // Hash: password=nonce, salt=header
    let mut output = [0u8; POW_OUTPUT_LEN];
    match argon2.hash_password_into(&nonce_bytes, header, &mut output) {
        Ok(_) => {
            unsafe {
                std::ptr::copy_nonoverlapping(output.as_ptr(), output_ptr, POW_OUTPUT_LEN);
            }
            0
        }
        Err(_) => -3,
    }
}

/// Check if a hash meets the difficulty target
///
/// # Arguments
/// * `hash` - 32-byte hash to check
/// * `target` - 32-byte target (hash must be less than this)
///
/// # Returns
/// * 1 if hash < target (valid), 0 otherwise
#[unsafe(no_mangle)]
pub extern "C" fn blocknet_pow_check_target(
    hash_ptr: *const u8,
    target_ptr: *const u8,
) -> i32 {
    if hash_ptr.is_null() || target_ptr.is_null() {
        return 0;
    }

    let hash = unsafe { std::slice::from_raw_parts(hash_ptr, 32) };
    let target = unsafe { std::slice::from_raw_parts(target_ptr, 32) };

    // Compare bytes from most significant (big-endian comparison)
    for i in 0..32 {
        if hash[i] < target[i] {
            return 1; // hash < target, valid
        }
        if hash[i] > target[i] {
            return 0; // hash > target, invalid
        }
    }
    1 // hash == target, valid
}

/// Convert difficulty to target
/// Target = floor((2^256 - 1) / difficulty)
#[unsafe(no_mangle)]
pub extern "C" fn blocknet_difficulty_to_target(
    difficulty: u64,
    target_ptr: *mut u8,
) -> i32 {
    if target_ptr.is_null() || difficulty == 0 {
        return -1;
    }

    // Exact integer division over 256-bit numerator:
    // numerator = (2^256 - 1) = [u64::MAX, u64::MAX, u64::MAX, u64::MAX]
    // Compute quotient limbs in base 2^64 using long division by u64 divisor.
    let divisor = difficulty as u128;
    let numerator = [u64::MAX; 4];
    let mut quotient = [0u64; 4];
    let mut rem = 0u128;

    for (i, limb) in numerator.iter().enumerate() {
        let cur = (rem << 64) | (*limb as u128);
        quotient[i] = (cur / divisor) as u64;
        rem = cur % divisor;
    }

    let mut target = [0u8; 32];
    for i in 0..4 {
        let be = quotient[i].to_be_bytes();
        target[i * 8..(i + 1) * 8].copy_from_slice(&be);
    }

    unsafe {
        std::ptr::copy_nonoverlapping(target.as_ptr(), target_ptr, 32);
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pow_hash() {
        let header = b"test_block_header_data";
        let nonce: u64 = 12345;
        let mut output = [0u8; 32];

        let result = blocknet_pow_hash(
            header.as_ptr(),
            header.len(),
            nonce,
            output.as_mut_ptr(),
        );

        assert_eq!(result, 0, "PoW hash should succeed");
        assert_ne!(output, [0u8; 32], "Output should not be zero");

        // Same inputs should produce same hash (deterministic)
        let mut output2 = [0u8; 32];
        blocknet_pow_hash(header.as_ptr(), header.len(), nonce, output2.as_mut_ptr());
        assert_eq!(output, output2, "PoW hash should be deterministic");

        // Different nonce should produce different hash
        let mut output3 = [0u8; 32];
        blocknet_pow_hash(header.as_ptr(), header.len(), nonce + 1, output3.as_mut_ptr());
        assert_ne!(output, output3, "Different nonce should produce different hash");
    }

    #[test]
    fn test_target_check() {
        let hash = [0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
        
        // Target with 3 leading zero bytes - hash should pass
        let target_easy = [0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
        
        // Target with 4 leading zero bytes - hash should fail
        let target_hard = [0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF,
                          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

        assert_eq!(blocknet_pow_check_target(hash.as_ptr(), target_easy.as_ptr()), 1);
        assert_eq!(blocknet_pow_check_target(hash.as_ptr(), target_hard.as_ptr()), 0);
    }

    #[test]
    fn test_difficulty_to_target() {
        let mut target = [0u8; 32];

        // difficulty=1 => max target
        blocknet_difficulty_to_target(1, target.as_mut_ptr());
        assert_eq!(target, [0xFF; 32]);

        // difficulty=2 => floor((2^256 - 1)/2) = 0x7f...ff
        blocknet_difficulty_to_target(2, target.as_mut_ptr());
        assert_eq!(target[0], 0x7F);
        assert_eq!(target[1], 0xFF);
        assert_eq!(target[31], 0xFF);

        // difficulty=256 => floor((2^256 - 1)/256) = 0x00ff...ff
        blocknet_difficulty_to_target(256, target.as_mut_ptr());
        assert_eq!(target[0], 0x00);
        assert_eq!(target[1], 0xFF);
        assert_eq!(target[31], 0xFF);
    }
}
