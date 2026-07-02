//! Header transform helpers.

use std::collections::HashMap;

/// Transform headers from Anthropic to `OpenAI` format.
pub fn transform_headers_anthropic_to_openai(
    headers: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut result = HashMap::new();
    if let Some(api_key) = headers.get("x-api-key") {
        result.insert("authorization".to_string(), format!("Bearer {api_key}"));
    }
    result.insert("content-type".to_string(), "application/json".to_string());
    result
}
