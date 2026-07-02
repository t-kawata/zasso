//! llm-bridge-core: Protocol transform library for LLM API translation.
//!
//! Translates between Anthropic Messages and `OpenAI` Chat APIs with semantic
//! fidelity for supported features and explicit lossy downgrade for
//! unsupported ones.

#![forbid(unsafe_code)]
#![warn(rust_2024_compatibility, missing_debug_implementations)]
#![warn(missing_docs)]
// The missing_docs lint on enum variant fields is a known Rust bug; doc comments are correct above.
#![allow(missing_docs)]

pub mod model;
pub mod stream;
pub mod transform;
