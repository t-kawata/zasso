//! Centralized stop-reason mapping between canonical `StopReason` and
//! provider-specific string codes.
//!
//! Replaces inline `match` expressions scattered across transform files with
//! a single source of truth.

use crate::model::StopReason;

/// Anthropic stop reason strings → canonical `StopReason`.
pub(crate) const ANTHROPIC_TO_CANONICAL: &[(&str, StopReason)] = &[
    ("end_turn", StopReason::EndTurn),
    ("max_tokens", StopReason::MaxTokens),
    ("tool_use", StopReason::ToolUse),
    ("stop_sequence", StopReason::StopSequence),
    ("content_filter", StopReason::ContentFilter),
    ("refusal", StopReason::ContentFilter),
];

/// `OpenAI` stop reason strings → canonical `StopReason`.
pub(crate) const OPENAI_TO_CANONICAL: &[(&str, StopReason)] = &[
    ("stop", StopReason::EndTurn),
    ("length", StopReason::MaxTokens),
    ("tool_calls", StopReason::ToolUse),
    ("content_filter", StopReason::ContentFilter),
];

/// Look up the canonical `StopReason` for an Anthropic stop reason string.
///
/// Returns `None` for unknown strings; callers should log and downgrade.
pub(crate) fn anthropic_to_canonical(s: &str) -> Option<StopReason> {
    ANTHROPIC_TO_CANONICAL
        .iter()
        .find(|(k, _)| *k == s)
        .map(|(_, v)| *v)
}

/// Look up the canonical `StopReason` for an `OpenAI` stop reason string.
pub(crate) fn openai_to_canonical(s: &str) -> Option<StopReason> {
    OPENAI_TO_CANONICAL
        .iter()
        .find(|(k, _)| *k == s)
        .map(|(_, v)| *v)
}

/// Map canonical `StopReason` to Anthropic string code.
pub(crate) fn canonical_to_anthropic(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end_turn",
        StopReason::MaxTokens => "max_tokens",
        StopReason::ToolUse => "tool_use",
        StopReason::StopSequence => "stop_sequence",
        StopReason::ContentFilter => "content_filter",
    }
}

/// Map canonical `StopReason` to `OpenAI` string code.
///
/// # Lossy mappings
///
/// `StopSequence` has no `OpenAI` equivalent and is mapped to `"stop"`.
/// `ContentFilter` maps to `"content_filter"` (supported by `OpenAI`
/// as a finish reason).
pub(crate) fn canonical_to_openai(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn | StopReason::StopSequence => "stop",
        StopReason::MaxTokens => "length",
        StopReason::ToolUse => "tool_calls",
        StopReason::ContentFilter => "content_filter",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_map_anthropic_known_reasons() {
        assert_eq!(
            anthropic_to_canonical("end_turn"),
            Some(StopReason::EndTurn)
        );
        assert_eq!(
            anthropic_to_canonical("max_tokens"),
            Some(StopReason::MaxTokens)
        );
        assert_eq!(
            anthropic_to_canonical("tool_use"),
            Some(StopReason::ToolUse)
        );
        assert_eq!(
            anthropic_to_canonical("refusal"),
            Some(StopReason::ContentFilter)
        );
    }

    #[test]
    fn test_should_return_none_for_unknown_anthropic() {
        assert_eq!(anthropic_to_canonical("bogus"), None);
    }

    #[test]
    fn test_should_map_openai_known_reasons() {
        assert_eq!(openai_to_canonical("stop"), Some(StopReason::EndTurn));
        assert_eq!(openai_to_canonical("length"), Some(StopReason::MaxTokens));
        assert_eq!(openai_to_canonical("tool_calls"), Some(StopReason::ToolUse));
    }

    #[test]
    fn test_should_round_trip_anthropic() {
        for reason in [
            StopReason::EndTurn,
            StopReason::MaxTokens,
            StopReason::ToolUse,
            StopReason::StopSequence,
            StopReason::ContentFilter,
        ] {
            let s = canonical_to_anthropic(reason);
            assert_eq!(anthropic_to_canonical(s), Some(reason));
        }
    }

    #[test]
    fn test_should_round_trip_openai() {
        for reason in [
            StopReason::EndTurn,
            StopReason::MaxTokens,
            StopReason::ToolUse,
            StopReason::ContentFilter,
        ] {
            let s = canonical_to_openai(reason);
            assert_eq!(openai_to_canonical(s), Some(reason));
        }
    }
}
