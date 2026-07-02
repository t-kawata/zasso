//! Protocol adapter trait and registry.
//!
//! Each adapter encapsulates one conversion direction. The registry allows
//! callers to look up the right adapter at runtime by (from, to) format pair,
//! so adding a new protocol (e.g., Gemini) only requires registering a new
//! adapter — existing code is untouched.

use std::collections::HashMap;

use super::{anthropic_to_openai, openai_to_anthropic};
use crate::model::{
    ApiFormat, TransformError, TransformOptions, TransformRequest, TransformResponse,
};

/// A protocol converter for a specific (source, target) format pair.
pub trait ProtocolAdapter: std::fmt::Debug + Send + Sync {
    /// The target protocol format this adapter produces.
    fn target_format(&self) -> ApiFormat;

    /// Transform a non-streaming request.
    ///
    /// # Errors
    ///
    /// Returns [`TransformError`] if the request cannot be converted.
    fn convert_request(
        &self,
        request: &TransformRequest,
        options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError>;

    /// Transform a non-streaming response.
    ///
    /// # Errors
    ///
    /// Returns [`TransformError`] if the response cannot be converted.
    fn convert_response(
        &self,
        response: &TransformResponse,
        options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError>;

    /// Transform request headers.
    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String>;
}

/// Runtime registry mapping `(from, to)` format pairs to adapters.
#[derive(Debug, Default)]
pub struct AdapterRegistry {
    adapters: HashMap<(ApiFormat, ApiFormat), Box<dyn ProtocolAdapter>>,
}

impl AdapterRegistry {
    /// Create an empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an adapter for a specific conversion direction.
    pub fn register(&mut self, from: ApiFormat, to: ApiFormat, adapter: Box<dyn ProtocolAdapter>) {
        self.adapters.insert((from, to), adapter);
    }

    /// Look up the adapter for a given (from, to) pair.
    #[must_use]
    pub fn get(&self, from: ApiFormat, to: ApiFormat) -> Option<&dyn ProtocolAdapter> {
        self.adapters.get(&(from, to)).map(AsRef::as_ref)
    }
}

/// Build the default registry pre-populated with all built-in adapters.
#[must_use]
pub fn default_registry() -> AdapterRegistry {
    let mut registry = AdapterRegistry::new();
    registry.register(
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenaiChat,
        Box::new(AnthropicToOpenAiAdapter),
    );
    registry.register(
        ApiFormat::OpenaiChat,
        ApiFormat::AnthropicMessages,
        Box::new(OpenAiToAnthropicAdapter),
    );
    registry.register(
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenaiResponses,
        Box::new(AnthropicToResponsesAdapter),
    );
    registry.register(
        ApiFormat::OpenaiResponses,
        ApiFormat::AnthropicMessages,
        Box::new(ResponsesToAnthropicAdapter),
    );
    registry
}

/// `Anthropic` Messages -> `OpenAI` Chat adapter.
#[derive(Debug)]
struct AnthropicToOpenAiAdapter;

impl ProtocolAdapter for AnthropicToOpenAiAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::OpenaiChat
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        let resp = anthropic_to_openai(request)?;
        Ok(resp)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        // Anthropic->OpenAI is a request-direction transform; response
        // conversion is handled separately via response_transforms.
        Err(TransformError::InvalidFormat(
            "AnthropicToOpenAiAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        super::transform_headers_anthropic_to_openai(headers)
    }
}

/// `OpenAI` Chat -> `Anthropic` Messages adapter.
#[derive(Debug)]
struct OpenAiToAnthropicAdapter;

impl ProtocolAdapter for OpenAiToAnthropicAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::AnthropicMessages
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        openai_to_anthropic(request)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        Err(TransformError::InvalidFormat(
            "OpenAiToAnthropicAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        headers.clone()
    }
}

/// `Anthropic` Messages -> `OpenAI` Responses adapter.
#[derive(Debug)]
struct AnthropicToResponsesAdapter;

impl ProtocolAdapter for AnthropicToResponsesAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::OpenaiResponses
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        super::anthropic_to_openai_responses(request)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        Err(TransformError::InvalidFormat(
            "AnthropicToResponsesAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        headers.clone()
    }
}

/// `OpenAI` Responses -> `Anthropic` Messages adapter.
#[derive(Debug)]
struct ResponsesToAnthropicAdapter;

impl ProtocolAdapter for ResponsesToAnthropicAdapter {
    fn target_format(&self) -> ApiFormat {
        ApiFormat::AnthropicMessages
    }

    fn convert_request(
        &self,
        request: &TransformRequest,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        super::responses_to_anthropic(request)
    }

    fn convert_response(
        &self,
        _response: &TransformResponse,
        _options: &TransformOptions,
    ) -> Result<TransformResponse, TransformError> {
        Err(TransformError::InvalidFormat(
            "ResponsesToAnthropicAdapter does not convert responses".into(),
        ))
    }

    fn convert_headers(&self, headers: &HashMap<String, String>) -> HashMap<String, String> {
        headers.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_register_and_retrieve_adapter() {
        let registry = default_registry();
        assert!(
            registry
                .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat)
                .is_some()
        );
        assert!(
            registry
                .get(ApiFormat::OpenaiChat, ApiFormat::AnthropicMessages)
                .is_some()
        );
        assert!(
            registry
                .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiResponses)
                .is_some()
        );
        assert!(
            registry
                .get(ApiFormat::OpenaiResponses, ApiFormat::AnthropicMessages)
                .is_some()
        );
    }

    #[test]
    fn test_should_return_none_for_unregistered_pair() {
        let registry = default_registry();
        assert!(
            registry
                .get(ApiFormat::OpenaiChat, ApiFormat::OpenaiResponses)
                .is_none()
        );
    }

    #[test]
    fn test_should_report_correct_target_format() {
        let registry = default_registry();
        let adapter = registry
            .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat)
            .unwrap();
        assert_eq!(adapter.target_format(), ApiFormat::OpenaiChat);
    }

    #[test]
    fn test_should_reject_response_conversion_for_request_adapters() {
        let registry = default_registry();
        let adapter = registry
            .get(ApiFormat::AnthropicMessages, ApiFormat::OpenaiChat)
            .unwrap();
        let resp = TransformResponse {
            headers: HashMap::new(),
            path: String::new(),
            body: bytes::Bytes::new(),
            conversion_trail: vec![],
        };
        let opts = TransformOptions::default();
        let result = adapter.convert_response(&resp, &opts);
        assert!(result.is_err());
    }
}
