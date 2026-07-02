//! `OpenAI` streaming deserialization types.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiChunk {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) choices: Vec<OpenAiChoice>,
    #[serde(default)]
    pub(crate) usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiChoice {
    #[serde(default)]
    pub(crate) delta: Option<OpenAiDelta>,
    #[serde(default)]
    pub(crate) index: Option<usize>,
    #[serde(default, rename = "finish_reason")]
    pub(crate) finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiDelta {
    #[serde(default)]
    pub(crate) role: Option<String>,
    #[serde(default)]
    pub(crate) content: Option<String>,
    #[serde(default, rename = "reasoning_content")]
    pub(crate) reasoning_content: Option<String>,
    #[serde(default)]
    pub(crate) tool_calls: Option<Vec<OpenAiToolCall>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiToolCall {
    #[serde(default)]
    pub(crate) index: Option<usize>,
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) r#type: Option<String>,
    #[serde(default)]
    pub(crate) function: Option<OpenAiFunction>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiFunction {
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiUsage {
    #[serde(default, rename = "prompt_tokens")]
    pub(crate) prompt_tokens: Option<u64>,
    #[serde(default, rename = "completion_tokens")]
    pub(crate) completion_tokens: Option<u64>,
    #[serde(default, rename = "prompt_tokens_details")]
    pub(crate) prompt_tokens_details: Option<OpenAiPromptTokensDetails>,
    #[serde(default, rename = "completion_tokens_details")]
    pub(crate) completion_tokens_details: Option<OpenAiCompletionTokensDetails>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiPromptTokensDetails {
    #[serde(default)]
    pub(crate) cached_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OpenAiCompletionTokensDetails {
    #[serde(default, rename = "reasoning_tokens")]
    pub(crate) reasoning_tokens: Option<u64>,
}
