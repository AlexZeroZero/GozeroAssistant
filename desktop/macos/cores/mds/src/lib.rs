#[cfg(feature="fast-mining")]
compile_error!("Mac production core requires the full million-round consensus");
pub mod core;
pub use core::types::*;
