//! Cross-protocol mapping for thinking / reasoning parameters.
//!
//! Maps `OpenAI` `reasoning_effort` strings to Anthropic `ThinkingConfig` budget
//! values, and Anthropic thinking content to `OpenAI` `reasoning_content` JSON.

// Functions in this module are not yet consumed by other modules.
#![allow(dead_code)]

use serde_json::{Value, json};

/// `reasoning_effort` level -> thinking token budget.
pub(crate) const REASONING_EFFORT_BUDGETS: &[(&str, u64)] =
    &[("low", 1280), ("medium", 2048), ("high", 4096)];

/// Convert an `OpenAI` `reasoning_effort` string to an Anthropic thinking budget.
///
/// Returns `None` if the effort string is unrecognized.
pub(crate) fn openai_effort_to_budget(effort: &str) -> Option<u64> {
    REASONING_EFFORT_BUDGETS
        .iter()
        .find(|(k, _)| *k == effort)
        .map(|(_, v)| *v)
}

/// Convert Anthropic thinking content to an `OpenAI` `reasoning_content` JSON value.
pub(crate) fn anthropic_thinking_to_openai_reasoning(
    thinking_text: &str,
    thinking_usage: Option<u64>,
) -> Value {
    let mut obj = serde_json::Map::new();
    obj.insert("reasoning_content".into(), json!(thinking_text));
    if let Some(usage) = thinking_usage {
        obj.insert("reasoning_tokens".into(), json!(usage));
    }
    Value::Object(obj)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_map_effort_levels() {
        assert_eq!(openai_effort_to_budget("low"), Some(1280));
        assert_eq!(openai_effort_to_budget("medium"), Some(2048));
        assert_eq!(openai_effort_to_budget("high"), Some(4096));
    }

    #[test]
    fn test_should_return_none_for_unknown_effort() {
        assert_eq!(openai_effort_to_budget("minimal"), None);
    }

    #[test]
    fn test_should_convert_thinking_without_usage() {
        let v = anthropic_thinking_to_openai_reasoning("thinking text", None);
        assert_eq!(v["reasoning_content"], "thinking text");
        assert!(v.get("reasoning_tokens").is_none());
    }

    #[test]
    fn test_should_convert_thinking_with_usage() {
        let v = anthropic_thinking_to_openai_reasoning("thinking text", Some(42));
        assert_eq!(v["reasoning_content"], "thinking text");
        assert_eq!(v["reasoning_tokens"], 42);
    }
}
