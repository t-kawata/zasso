//! Shared constants and utility functions for protocol transforms.

use std::time::{SystemTime, UNIX_EPOCH};

/// Base64-encoded synthetic thinking signature used when converting `OpenAI`
/// `reasoning_content` to Anthropic thinking blocks.
pub const SYNTHETIC_THINKING_SIGNATURE: &str =
    "bGxtLWJyaWRnZS1zeW50aGV0aWMtdGhpbmtpbmctc2lnbmF0dXJl";

pub(crate) fn default_responses_id() -> String {
    "resp_llm_bridge".to_string()
}

pub(crate) fn default_model_name() -> String {
    "llm-bridge".to_string()
}

pub(crate) fn current_unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

/// Recursively strip all `null` values from a JSON value.
///
/// Objects: keys whose value is `null` are removed; other values are recursed.
/// Arrays: elements are recursed, `null` elements are filtered out.
/// Scalars: passed through unchanged.
///
/// This is a safety net to ensure strict Chat Completions validators (e.g.
/// `DeepSeek`) never receive `null` where a proper value is expected.
pub(crate) fn strip_all_nulls(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Null => serde_json::Value::Null,
        serde_json::Value::Array(arr) => {
            let cleaned: Vec<serde_json::Value> = arr
                .iter()
                .map(strip_all_nulls)
                .filter(|v| !v.is_null())
                .collect();
            serde_json::Value::Array(cleaned)
        }
        serde_json::Value::Object(map) => {
            let mut cleaned = serde_json::Map::new();
            for (key, val) in map {
                if val.is_null() {
                    continue;
                }
                cleaned.insert(key.clone(), strip_all_nulls(val));
            }
            serde_json::Value::Object(cleaned)
        }
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_nulls_removes_null_values_from_object() {
        let input = serde_json::json!({
            "name": "test",
            "required": null,
            "properties": {
                "x": { "type": "string", "description": null },
                "y": null
            }
        });
        let output = strip_all_nulls(&input);
        let obj = output.as_object().unwrap();
        assert_eq!(obj["name"], "test");
        assert!(obj.get("required").is_none()); // null removed
        let props = obj["properties"].as_object().unwrap();
        assert_eq!(props["x"]["type"], "string");
        assert!(props["x"].get("description").is_none()); // null removed
        assert!(props.get("y").is_none()); // null removed
    }

    #[test]
    fn test_strip_nulls_filters_null_from_array() {
        let input = serde_json::json!(["a", null, "b", null]);
        let output = strip_all_nulls(&input);
        let arr = output.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0], "a");
        assert_eq!(arr[1], "b");
    }

    #[test]
    fn test_strip_nulls_preserves_non_null_values() {
        let input = serde_json::json!({
            "string": "hello",
            "number": 42,
            "bool": true,
            "array": [1, 2, 3],
            "object": { "key": "value" }
        });
        let output = strip_all_nulls(&input);
        assert_eq!(input, output);
    }
}
