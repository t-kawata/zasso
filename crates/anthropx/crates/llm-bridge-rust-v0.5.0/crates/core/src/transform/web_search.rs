//! Cross-protocol mapping for web search tool configuration.
//!
//! Translates `OpenAI` `web_search_options` into an Anthropic
//! `web_search_20250305` tool definition.

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// `OpenAI` `web_search_options` structure.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct WebSearchOptions {
    /// Search context size: "low", "medium", or "high".
    #[serde(default = "default_context_size")]
    pub search_context_size: String,
    /// Optional user location for geo-targeted results.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_location: Option<WebSearchUserLocation>,
}

/// User location for geo-targeted web search.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct WebSearchUserLocation {
    /// Approximate location fields.
    pub approximate: Option<ApproximateLocation>,
}

/// Approximate geographic location.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ApproximateLocation {
    /// Two-letter country code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// Region or state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    /// City name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    /// IANA timezone.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
}

fn default_context_size() -> String {
    "medium".into()
}

/// Map `search_context_size` to Anthropic `max_uses`.
fn context_size_to_max_uses(size: &str) -> u32 {
    match size {
        "low" => 1,
        "high" => 10,
        _ => 5,
    }
}

/// Convert `OpenAI` `web_search_options` to an Anthropic `web_search_20250305` tool.
pub(crate) fn openai_web_search_to_anthropic_tool(options: &WebSearchOptions) -> Value {
    let max_uses = context_size_to_max_uses(&options.search_context_size);
    let mut tool = json!({
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": max_uses,
    });

    if let Some(ref loc) = options.user_location
        && let Some(ref approx) = loc.approximate
    {
        let mut user_location = serde_json::Map::new();
        if let Some(ref country) = approx.country {
            user_location.insert("country".into(), json!(country));
        }
        if let Some(ref region) = approx.region {
            user_location.insert("region".into(), json!(region));
        }
        if let Some(ref city) = approx.city {
            user_location.insert("city".into(), json!(city));
        }
        if let Some(ref tz) = approx.timezone {
            user_location.insert("timezone".into(), json!(tz));
        }
        if let Some(obj) = tool.as_object_mut() {
            obj.insert("user_location".into(), Value::Object(user_location));
        }
    }

    tool
}

/// Extract and remove `web_search_options` from an `OpenAI` request body.
///
/// Returns `None` if the field is absent.
pub(crate) fn extract_web_search_options(body: &mut Value) -> Option<WebSearchOptions> {
    let obj = body.as_object_mut()?;
    let raw = obj.remove("web_search_options")?;
    serde_json::from_value(raw).ok()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn test_should_map_context_sizes() {
        assert_eq!(context_size_to_max_uses("low"), 1);
        assert_eq!(context_size_to_max_uses("medium"), 5);
        assert_eq!(context_size_to_max_uses("high"), 10);
        assert_eq!(context_size_to_max_uses("unknown"), 5);
    }

    #[test]
    fn test_should_convert_basic_web_search() {
        let opts = WebSearchOptions::default();
        let tool = openai_web_search_to_anthropic_tool(&opts);
        assert_eq!(tool["type"], "web_search_20250305");
        assert_eq!(tool["max_uses"], 5);
        assert!(tool.get("user_location").is_none());
    }

    #[test]
    fn test_should_convert_with_user_location() {
        let opts = WebSearchOptions {
            search_context_size: "high".into(),
            user_location: Some(WebSearchUserLocation {
                approximate: Some(ApproximateLocation {
                    country: Some("US".into()),
                    region: Some("CA".into()),
                    city: None,
                    timezone: Some("America/Los_Angeles".into()),
                }),
            }),
        };
        let tool = openai_web_search_to_anthropic_tool(&opts);
        assert_eq!(tool["max_uses"], 10);
        assert_eq!(tool["user_location"]["country"], "US");
        assert_eq!(tool["user_location"]["timezone"], "America/Los_Angeles");
    }

    #[test]
    fn test_should_extract_web_search_options() {
        let mut body = json!({
            "model": "gpt-4",
            "web_search_options": {"search_context_size": "low"}
        });
        let opts = extract_web_search_options(&mut body).unwrap();
        assert_eq!(opts.search_context_size, "low");
        assert!(body.get("web_search_options").is_none());
    }

    #[test]
    fn test_should_return_none_when_absent() {
        let mut body = json!({"model": "gpt-4"});
        assert!(extract_web_search_options(&mut body).is_none());
    }
}
