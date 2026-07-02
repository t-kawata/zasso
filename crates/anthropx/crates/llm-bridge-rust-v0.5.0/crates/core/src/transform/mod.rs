//! Protocol transform implementations.
//!
//! Provides non-streaming and streaming transform functions that translate
//! between different LLM provider APIs with semantic fidelity.

// Transform functions are naturally long — they map multi-field protocol bodies.
#![allow(clippy::too_many_lines)]
// Header transform functions take `&HashMap<String, String>` — generics over hashers
// is unnecessary boilerplate for protocol transform code.
#![allow(clippy::ref_option, clippy::implicit_hasher)]
// `#[must_use]` on every pure function is noisy; the compiler catches unused values anyway.
#![allow(clippy::must_use_candidate)]

mod adapter;
mod anthropic_to_openai;
mod anthropic_to_responses;
mod field_filter;
mod header_helpers;
mod openai_to_anthropic;
mod response_transforms;
mod responses_to_anthropic;
mod responses_to_openai;
mod shared;
mod stop_reason;
mod streaming_entry;
mod thinking;
mod web_search;

#[cfg(test)]
mod tests;

// Re-exports: public API remains accessible as `crate::transform::*`.
pub use adapter::{AdapterRegistry, ProtocolAdapter, default_registry};
pub use anthropic_to_openai::anthropic_to_openai;
pub use anthropic_to_responses::anthropic_to_openai_responses;
pub use header_helpers::transform_headers_anthropic_to_openai;
pub use openai_to_anthropic::openai_to_anthropic;
pub use response_transforms::{
    anthropic_response_to_openai_response, anthropic_response_to_responses_response,
    openai_response_to_anthropic_message,
    responses_response_to_anthropic,
};
pub use responses_to_anthropic::responses_to_anthropic;
pub use responses_to_openai::responses_to_openai;
pub use shared::SYNTHETIC_THINKING_SIGNATURE;
pub use streaming_entry::{
    transform_stream, transform_stream_to_openai, transform_stream_to_openai_responses,
};

pub use crate::model::TransformOptions;
