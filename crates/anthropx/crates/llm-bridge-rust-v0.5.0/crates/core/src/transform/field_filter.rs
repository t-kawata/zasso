//! Configurable field stripping for transform bodies.
//!
//! Removes dangerous or provider-specific fields before forwarding.

use serde_json::Value;

/// Recursively remove keys from a JSON value (object and all nested objects).
///
/// Note: dead-code allowed until the adapter (Task 9) wires this in.
#[allow(dead_code)]
pub(crate) fn strip_fields(value: &mut Value, fields: &[String]) {
    match value {
        Value::Object(map) => {
            for field in fields {
                map.remove(field.as_str());
            }
            for v in map.values_mut() {
                strip_fields(v, fields);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_fields(v, fields);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn test_should_strip_top_level_fields() {
        let mut v =
            json!({"service_tier": "priority", "model": "claude-opus-4-8", "speed": "fast"});
        strip_fields(&mut v, &["service_tier".into(), "speed".into()]);
        assert_eq!(v, json!({"model": "claude-opus-4-8"}));
    }

    #[test]
    fn test_should_strip_nested_fields() {
        let mut v = json!({"outer": {"service_tier": "x", "keep": 1}});
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!({"outer": {"keep": 1}}));
    }

    #[test]
    fn test_should_strip_inside_arrays() {
        let mut v = json!({"items": [{"service_tier": 1}, {"service_tier": 2}]});
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!({"items": [{}, {}]}));
    }

    #[test]
    fn test_should_noop_on_primitives() {
        let mut v = json!("just a string");
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!("just a string"));
    }

    #[test]
    fn test_should_noop_when_fields_absent() {
        let mut v = json!({"model": "claude-opus-4-8"});
        strip_fields(&mut v, &["service_tier".into()]);
        assert_eq!(v, json!({"model": "claude-opus-4-8"}));
    }
}
