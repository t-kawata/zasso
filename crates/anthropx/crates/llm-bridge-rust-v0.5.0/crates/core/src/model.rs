//! Core data model for protocol transforms.
//!
//! Defines the internal types used to represent API formats, content blocks,
//! streaming events, stop reasons, and transform errors across the supported
//! provider protocols.

use std::collections::{HashMap, HashSet};

use bytes::Bytes;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use typed_builder::TypedBuilder;

// ---------------------------------------------------------------------------
// API Format enumeration
// ---------------------------------------------------------------------------

/// The target API format for protocol transformation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum ApiFormat {
    /// Anthropic Messages API (`/v1/messages`)
    AnthropicMessages,
    /// `OpenAI` Chat Completions API (`/v1/chat/completions`)
    OpenaiChat,
    /// `OpenAI` Responses API (`/v1/responses`)
    OpenaiResponses,
}

// ---------------------------------------------------------------------------
// Image source
// ---------------------------------------------------------------------------

/// The source of an image content block.
///
/// Separated to distinguish between inline base64 data and URL references.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImageSource {
    /// Inline base64-encoded image data.
    Inline {
        /// MIME type of the image (e.g., `"image/png"`).
        media_type: String,
        /// Base64-encoded image data.
        data: Bytes,
    },
    /// External URL reference (HTTPS only).
    Url {
        /// The image URL.
        url: String,
    },
}

// ---------------------------------------------------------------------------
// Content block
// ---------------------------------------------------------------------------

/// A single content block in a message.
///
/// Mirrors the Anthropic content block types but is used as the internal
/// canonical representation regardless of source protocol.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum ContentBlock {
    /// Plain text content.
    Text { text: String },
    /// Image content, either inline or URL-referenced.
    Image { source: ImageSource },
    /// Tool use request from assistant.
    ToolUse {
        /// Unique tool use identifier (e.g., `"toolu_..."` for Anthropic).
        id: String,
        /// Tool name.
        name: String,
        /// Tool input parameters as a JSON value.
        input: serde_json::Value,
    },
    /// Tool execution result returned by user/system.
    ToolResult {
        /// The tool use ID this result corresponds to.
        tool_use_id: String,
        /// The result content (may be text or structured).
        content: Vec<ContentBlock>,
    },
    /// Extended thinking block (Anthropic-specific).
    /// Only valid in Anthropic direction; dropped with debug log otherwise.
    Thinking {
        /// The thinking content text.
        text: String,
        /// Number of tokens used for thinking.
        usage: Option<u64>,
    },
}

// ---------------------------------------------------------------------------
// Stop reason
// ---------------------------------------------------------------------------

/// The reason a generation stopped.
///
/// Only represents normal termination reasons. Errors are never encoded as
/// a `StopReason`; they use the `StreamEvent::Error` variant instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum StopReason {
    /// Model naturally produced an end-of-turn token.
    EndTurn,
    /// Hit the `max_tokens` limit.
    MaxTokens,
    /// Model produced a tool use.
    ToolUse,
    /// Hit a stop sequence.
    StopSequence,
    /// Content was filtered for safety reasons.
    ContentFilter,
}

// ---------------------------------------------------------------------------
// Transform error
// ---------------------------------------------------------------------------

/// Errors that can occur during protocol transformation.
#[derive(Debug, Error)]
pub enum TransformError {
    /// Input could not be parsed as the expected protocol format.
    #[error("invalid format: {0}")]
    InvalidFormat(String),

    /// A required field was missing from the input.
    #[error("missing required field: {0}")]
    MissingRequiredField(String),

    /// A buffer limit was exceeded (stream total, tool call params, etc.).
    #[error("buffer limit exceeded: {0}")]
    BufferLimitExceeded(String),

    /// The stream was interrupted before normal termination.
    #[error("stream interrupted: {0}")]
    StreamInterrupted(String),

    /// An error from the upstream provider.
    #[error("upstream error: {0}")]
    UpstreamError(String),

    /// A feature was explicitly unsupported, triggering lossy downgrade.
    #[error("lossy downgrade: {0}")]
    LossyDowngrade(String),
}

impl TransformError {
    /// Wrap this error with an underlying source for richer error chains.
    #[must_use]
    pub fn with_source(
        self,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> anyhow::Error {
        anyhow::Error::new(self).context(source.to_string())
    }

    /// Return a client-safe error message with internal details redacted.
    ///
    /// Serde parse errors (e.g., "expected value at line 3 column 17") leak
    /// implementation details. This strips them to a generic category.
    #[must_use]
    pub fn sanitized_message(&self) -> String {
        match self {
            Self::InvalidFormat(_) => "invalid request format".to_string(),
            Self::MissingRequiredField(field) => {
                format!("missing required field: {field}")
            }
            Self::BufferLimitExceeded(_) => "request too large".to_string(),
            Self::StreamInterrupted(_) => "stream was interrupted".to_string(),
            Self::UpstreamError(_) => "upstream provider error".to_string(),
            Self::LossyDowngrade(_) => "feature not supported".to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Stream event (Anthropic canonical target)
// ---------------------------------------------------------------------------

/// A single event in the Anthropic SSE event stream.
///
/// All streaming providers are normalized to this event model:
/// `message_start -> content_block_* -> message_delta -> message_stop`.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum StreamDelta {
    /// Incremental text emitted for a text content block.
    Text {
        /// Text fragment to append.
        text: String,
    },
    /// Incremental thinking emitted for an Anthropic thinking content block.
    Thinking {
        /// Thinking fragment to append.
        thinking: String,
    },
    /// Signature emitted for a completed Anthropic thinking content block.
    Signature {
        /// Opaque signature string for multi-turn continuity.
        signature: String,
    },
    /// Incremental JSON fragment emitted for a tool-use input payload.
    InputJson {
        /// Partial JSON string fragment.
        partial_json: String,
    },
}

#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum StreamEvent {
    /// Marks the beginning of an assistant message.
    MessageStart {
        /// The role (always `"assistant"`).
        role: String,
        /// Stable message identifier for stream accumulation.
        message_id: String,
        /// Model name associated with the generated message.
        model: String,
        /// Initial usage counters (typically zero at start).
        usage: Usage,
    },
    /// Marks the beginning of a content block.
    ContentBlockStart {
        /// Zero-based index of this content block.
        index: usize,
        /// The content block that is starting.
        content_block: ContentBlock,
    },
    /// A delta for an existing content block.
    ContentBlockDelta {
        /// Zero-based index of the content block.
        index: usize,
        /// The typed delta payload to append.
        delta: StreamDelta,
    },
    /// Marks the end of a content block.
    ContentBlockStop {
        /// Zero-based index of the content block.
        index: usize,
    },
    /// A delta for the overall message (usage, stop reason).
    MessageDelta {
        /// The reason the message stopped (if known).
        stop_reason: Option<StopReason>,
        /// Stop sequence string if applicable.
        stop_sequence: Option<String>,
        /// Final usage counters.
        usage: Usage,
    },
    /// Marks the end of the message (best-effort after error).
    MessageStop,
    /// An error event. Sent before best-effort `MessageStop` if stream was started.
    Error {
        /// Error type identifier.
        error_type: String,
        /// Human-readable error message.
        message: String,
    },
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/// Token usage counters.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Usage {
    /// Number of input tokens consumed.
    #[serde(default)]
    pub input_tokens: u64,
    /// Number of output tokens produced.
    #[serde(default)]
    pub output_tokens: u64,
    /// Anthropic cache hit tokens.
    #[serde(default)]
    pub cache_read_input_tokens: u64,
    /// Anthropic cache write tokens.
    #[serde(default)]
    pub cache_creation_input_tokens: u64,
    /// `cached_tokens` from `OpenAI` `prompt_tokens_details`.
    #[serde(default)]
    pub cached_tokens: u64,
    /// OpenAI/Anthropic reasoning tokens.
    #[serde(default)]
    pub reasoning_tokens: u64,
}

// ---------------------------------------------------------------------------
// Request / Response types for non-streaming transforms
// ---------------------------------------------------------------------------

/// A non-streaming protocol transform request.
///
/// Carries the full HTTP request context: headers, path, and body.
#[derive(Debug, Clone)]
pub struct TransformRequest {
    /// HTTP headers from the original request.
    pub headers: HashMap<String, String>,
    /// The request path (e.g., `/v1/messages`).
    pub path: String,
    /// The raw request body bytes.
    pub body: Bytes,
}

/// Request-level configuration for protocol transformation.
///
/// Controls field stripping and unknown-field policy.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct TransformOptions {
    /// Field paths to strip from the request/response body before transformation.
    pub strip_fields: Vec<String>,
    /// When true, unknown fields in the input are silently preserved.
    /// When false, unknown fields trigger `TransformError::LossyDowngrade`.
    pub allow_unknown_fields: bool,
}

impl Default for TransformOptions {
    fn default() -> Self {
        Self {
            strip_fields: vec![
                "service_tier".into(),
                "safety_identifier".into(),
                "inference_geo".into(),
                "speed".into(),
            ],
            allow_unknown_fields: true,
        }
    }
}

/// A non-streaming protocol transform response.
///
/// Carries the transformed HTTP response context: headers, path, and body.
#[derive(Debug, Clone)]
pub struct TransformResponse {
    /// Transformed HTTP headers for the target provider.
    pub headers: HashMap<String, String>,
    /// The transformed request path (e.g., `/v1/chat/completions`).
    pub path: String,
    /// The transformed body bytes.
    pub body: Bytes,
    /// The sequence of API formats traversed during transformation
    /// (e.g., `[AnthropicMessages, OpenaiChat]`).
    pub conversion_trail: Vec<ApiFormat>,
}

// ---------------------------------------------------------------------------
// Stream state
// ---------------------------------------------------------------------------

/// Per-connection streaming state for accumulating events.
///
/// Each connection owns its own `StreamState` and must not share it across
/// requests. The state tracks content block indices, tool call accumulation,
/// and the overall message lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum StreamContentBlockKind {
    /// A plain text content block is currently open.
    Text,
    /// A thinking content block is currently open.
    Thinking,
    /// A tool use content block is currently open.
    ToolUse,
}

/// `OpenAI` Responses-specific streaming state, nested to keep `StreamState`
/// focused on protocol-agnostic concerns.
#[derive(Debug, Default)]
pub struct ResponsesStreamState {
    /// Sequence number for `OpenAI` Responses SSE events.
    pub sequence_number: u64,
    /// Synthetic creation time for `OpenAI` Responses objects.
    pub created_at: Option<u64>,
    /// Stable output item IDs keyed by content-block index.
    pub item_ids: HashMap<usize, String>,
    /// Stable function call IDs keyed by content-block index.
    pub call_ids: HashMap<usize, String>,
    /// Tool names keyed by content-block index.
    pub tool_names: HashMap<usize, String>,
    /// Accumulated text fragments keyed by content-block index.
    pub text_fragments: HashMap<usize, String>,
    /// Accumulated reasoning fragments keyed by content-block index.
    pub reasoning_fragments: HashMap<usize, String>,
    /// Accumulated function-call argument fragments keyed by content-block index.
    pub function_arguments: HashMap<usize, String>,
    /// Final stop reason observed for the stream.
    pub final_stop_reason: Option<StopReason>,
    /// Tool call indices already seen in the current stream (prevent
    /// duplicate `output_item.added` across incremental calls).
    pub seen_tool_indices: HashSet<usize>,
}

#[derive(Debug, Default, TypedBuilder)]
pub struct StreamState {
    /// Whether `message_start` has been sent.
    pub started: bool,
    /// Whether `message_stop` has already been emitted.
    pub finished: bool,
    /// Stable message identifier for the current stream, if known.
    pub message_id: Option<String>,
    /// Upstream model name for the current stream, if known.
    pub model_name: Option<String>,
    /// Total accumulated bytes for the stream (enforces 1 MB limit).
    pub total_buffer_bytes: usize,
    /// Index of the next content block.
    pub content_block_index: usize,
    /// Currently open content block index, if any.
    pub active_content_block_index: Option<usize>,
    /// Currently open content block kind, if any.
    pub active_content_block_kind: Option<StreamContentBlockKind>,
    /// Last observed usage counters from the upstream stream.
    pub last_usage: Usage,
    /// Tool call ID mapping for cross-protocol correlation (e.g., `tool_call_id -> tool_use_id`).
    pub tool_correlation: HashMap<String, String>,
    /// Mapping from upstream tool-call indices to Anthropic content block indices.
    pub tool_block_indices: HashMap<usize, usize>,
    /// Mapping from content-block index to content-block kind for downstream re-serialization.
    pub content_block_kinds: HashMap<usize, StreamContentBlockKind>,
    /// `OpenAI` Responses-specific streaming state.
    pub responses: ResponsesStreamState,
}

// ---------------------------------------------------------------------------
// Resource limits
// ---------------------------------------------------------------------------

/// Maximum allowed nesting depth for JSON payloads (prevents stack overflow).
pub const MAX_JSON_DEPTH: usize = 64;

/// Maximum allowed messages array length in a request body.
/// At ~1 KB per message, 5K messages ≈ 5 MB. This is intentionally generous
/// for modern models with 1M+ token contexts. The request body size limit
/// (`MAX_REQUEST_BODY_BYTES`) provides an additional hard upper bound.
pub const MAX_MESSAGES_COUNT: usize = 5_000;

/// Maximum accumulated SSE stream data in bytes (1 MB).
pub const MAX_SSE_STREAM_BYTES: usize = 1024 * 1024;

/// Maximum request body size in bytes (5 MB).
/// Provides a hard upper bound to prevent memory-exhaustion `DoS`.
pub const MAX_REQUEST_BODY_BYTES: usize = 5 * 1024 * 1024;

/// Maximum number of tools allowed in an `OpenAI` Chat Completions request.
/// `OpenAI` enforces a hard limit of 128 functions; exceeding this causes a 400 error.
pub const OPENAI_MAX_TOOLS: usize = 128;

/// Maximum number of properties in a tool schema.
pub const MAX_TOOL_SCHEMA_PROPERTIES: usize = 200;

/// Validate that a `serde_json::Value` does not exceed the allowed nesting depth.
///
/// Uses an explicit stack to avoid potential stack overflow from deeply nested
/// recursive calls. The depth limit is [`MAX_JSON_DEPTH`].
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the nesting depth exceeds
/// `MAX_JSON_DEPTH`.
pub fn validate_json_depth(value: &serde_json::Value) -> Result<(), TransformError> {
    let mut max_depth = 0usize;
    let mut stack: Vec<(&serde_json::Value, usize)> = vec![(value, 1)];

    while let Some((v, d)) = stack.pop() {
        if d > max_depth {
            max_depth = d;
        }
        match v {
            serde_json::Value::Object(map) => {
                for child in map.values() {
                    stack.push((child, d + 1));
                }
            }
            serde_json::Value::Array(arr) => {
                for child in arr {
                    stack.push((child, d + 1));
                }
            }
            _ => {}
        }
    }

    if max_depth > MAX_JSON_DEPTH {
        Err(TransformError::InvalidFormat(
            "JSON nesting depth exceeds maximum allowed".to_string(),
        ))
    } else {
        Ok(())
    }
}

/// Validate model name contains only safe characters.
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the name is empty, too long,
/// or contains characters outside the allowlist `[a-zA-Z0-9._-]`.
pub fn validate_model_name(model: &str) -> Result<(), TransformError> {
    if model.is_empty() || model.len() > 128 {
        return Err(TransformError::InvalidFormat(
            "model name must be 1-128 characters".to_string(),
        ));
    }
    if !model
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(TransformError::InvalidFormat(format!(
            "model name contains invalid characters: {model}"
        )));
    }
    Ok(())
}

/// Validate tool schema size does not exceed limits.
///
/// # Errors
///
/// Returns `TransformError::BufferLimitExceeded` if the schema's `properties`
/// count exceeds [`MAX_TOOL_SCHEMA_PROPERTIES`].
pub fn validate_tool_schema_size(schema: &serde_json::Value) -> Result<(), TransformError> {
    if let Some(props) = schema.get("properties").and_then(|p| p.as_object())
        && props.len() > MAX_TOOL_SCHEMA_PROPERTIES
    {
        return Err(TransformError::BufferLimitExceeded(format!(
            "tool schema has {} properties, exceeds maximum of {}",
            props.len(),
            MAX_TOOL_SCHEMA_PROPERTIES
        )));
    }
    Ok(())
}
