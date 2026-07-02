//! Anthropic streaming deserialization types.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicStreamMessage {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) role: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) usage: Option<AnthropicStreamUsage>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicMessageStartEvent {
    pub(crate) message: AnthropicStreamMessage,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicStreamContentBlock {
    #[serde(rename = "type")]
    pub(crate) block_type: String,
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicContentBlockStartEvent {
    pub(crate) index: usize,
    pub(crate) content_block: AnthropicStreamContentBlock,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicStreamDeltaPayload {
    #[serde(rename = "type")]
    pub(crate) delta_type: String,
    #[serde(default)]
    pub(crate) text: Option<String>,
    #[serde(default)]
    pub(crate) thinking: Option<String>,
    #[serde(default, rename = "partial_json")]
    pub(crate) partial_json: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicContentBlockDeltaEvent {
    pub(crate) index: usize,
    pub(crate) delta: AnthropicStreamDeltaPayload,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicContentBlockStopEvent {
    pub(crate) index: usize,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicMessageDeltaPayload {
    #[serde(default)]
    pub(crate) stop_reason: Option<String>,
    #[serde(default)]
    pub(crate) stop_sequence: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_field_names)]
pub(crate) struct AnthropicStreamUsage {
    #[serde(default)]
    pub(crate) input_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) output_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) cache_read_input_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) cache_creation_input_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicMessageDeltaEvent {
    pub(crate) delta: AnthropicMessageDeltaPayload,
    #[serde(default)]
    pub(crate) usage: Option<AnthropicStreamUsage>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicErrorPayload {
    #[serde(default)]
    pub(crate) r#type: Option<String>,
    #[serde(default)]
    pub(crate) message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnthropicErrorEvent {
    #[serde(default)]
    pub(crate) error: Option<AnthropicErrorPayload>,
}
