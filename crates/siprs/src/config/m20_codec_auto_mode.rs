// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0041:  §29 M20 Explicit Codec & Auto Mode Policy
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0041 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::collections::HashMap;

use crate::error::SipError;

// ---------------------------------------------------------------------------
// Constants — codec priority values for auto mode
// ---------------------------------------------------------------------------

/// Opus codec priority in auto mode — always 255 (highest).
const OPUS_PRIORITY: u8 = 255;

/// PCMU codec priority in auto mode — always 254 (fallback).
const PCMU_PRIORITY: u8 = 254;

// ---------------------------------------------------------------------------
// CodecInfo — lightweight native codec descriptor
// ---------------------------------------------------------------------------

/// A lightweight descriptor for a single native codec.
///
/// Represents a codec enumerated from the PJSUA stack without requiring
/// FFI bindings. Used as input to `CodecAutoMode::apply()`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodecInfo {
    /// The codec identifier string (e.g., "PCMU/8000/1", "opus/48000/2").
    pub codec_id: String,
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl CodecInfo {
    /// Create a new `CodecInfo` with the given codec identifier.
    pub fn new(codec_id: impl Into<String>) -> Self {
        Self {
            codec_id: codec_id.into(),
        }
    }
}

// ---------------------------------------------------------------------------
// CodecAutoMode — auto-mode priority assignment
// ---------------------------------------------------------------------------

/// Pure-function codec auto-mode implementation.
///
/// When `preferred_codecs` is empty, assigns Opus=255, PCMU=254, and all
/// other codecs=0 (disabled). When `preferred_codecs` is non-empty, the
/// auto mode is bypassed and no priorities are changed (returns empty map).
///
/// This function is a pure computation with no side effects, FFI calls,
/// or mutable state. The returned `HashMap<String, u8>` maps each codec_id
/// to its assigned priority value.
///
/// # Errors
/// Returns `Err(SipError)` with `SipErrorKind::NativeError` if the input
/// codec list is internally inconsistent (e.g., duplicate codec_id entries).
pub struct CodecAutoMode;

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl CodecAutoMode {
    /// Apply auto-mode priority assignment.
    ///
    /// - `codecs` — the list of native codecs enumerated from the stack
    /// - `preferred_codecs` — user-specified codec IDs; empty => auto mode
    ///
    /// Returns a map of `{ codec_id → priority }` with priority values as
    /// defined by the auto-mode invariants. Returns an empty map if
    /// `preferred_codecs` is non-empty (explicit mode bypasses auto mode).
    pub fn apply(
        codecs: &[CodecInfo],
        preferred_codecs: &[String],
    ) -> Result<HashMap<String, u8>, SipError> {
        // Explicit user selection bypasses auto mode entirely.
        if !preferred_codecs.is_empty() {
            return Ok(HashMap::new());
        }

        let mut priorities = HashMap::new();

        for info in codecs {
            let priority = assign_auto_priority(&info.codec_id);
            if priorities.contains_key(&info.codec_id) {
                return Err(SipError::internal_error(format!(
                    "duplicate codec_id in enumeration: {}",
                    info.codec_id
                )));
            }
            priorities.insert(info.codec_id.clone(), priority);
        }

        Ok(priorities)
    }
}

/// Assign the auto-mode priority for a single codec identifier.
///
/// - Codecs starting with "opus/" => 255 (highest)
/// - "PCMU/8000/1" => 254 (fallback for Opus-incapable peers)
/// - Everything else => 0 (disabled)
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
fn assign_auto_priority(codec_id: &str) -> u8 {
    if codec_id.starts_with("opus/") {
        OPUS_PRIORITY
    } else if codec_id == "PCMU/8000/1" {
        PCMU_PRIORITY
    } else {
        0
    }
}

// ---------------------------------------------------------------------------
// Tests — TDD Red: failing → Green: passing
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::SipError;

    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    type TestResult = Result<(), SipError>;

    // ── C042-Pre: Precondition — codecs defined, preferred_codecs empty → auto mode

    #[test]
    // @verifies C042
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn apply_assigns_opus_255_and_pcmu_254_in_auto_mode() -> TestResult {
        let codecs = vec![
            CodecInfo::new("PCMU/8000/1"),
            CodecInfo::new("opus/48000/2"),
            CodecInfo::new("G722/8000/1"),
        ];
        let preferred: Vec<String> = vec![];

        let result = CodecAutoMode::apply(&codecs, &preferred)?;

        assert_eq!(result.get("PCMU/8000/1"), Some(&254));
        assert_eq!(result.get("opus/48000/2"), Some(&255));
        assert_eq!(result.get("G722/8000/1"), Some(&0));
        Ok(())
    }

    #[test]
    // @verifies C042
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn apply_bypasses_auto_mode_when_preferred_codecs_non_empty() -> TestResult {
        let codecs = vec![
            CodecInfo::new("PCMU/8000/1"),
            CodecInfo::new("opus/48000/2"),
        ];
        let preferred: Vec<String> = vec!["opus/48000/2".to_string()];

        let result = CodecAutoMode::apply(&codecs, &preferred)?;

        assert!(result.is_empty(), "preferred_codecs non-empty => empty map");
        Ok(())
    }

    // ── C042-Post: Postcondition — correct priority values

    #[test]
    // @verifies C042
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn apply_returns_exact_priority_values() -> TestResult {
        let codecs = vec![
            CodecInfo::new("opus/48000/2"),
            CodecInfo::new("PCMU/8000/1"),
            CodecInfo::new("opus/48000/1"),
        ];
        let preferred: Vec<String> = vec![];

        let result = CodecAutoMode::apply(&codecs, &preferred)?;

        assert_eq!(result.get("opus/48000/2"), Some(&255));
        assert_eq!(result.get("opus/48000/1"), Some(&255));
        assert_eq!(result.get("PCMU/8000/1"), Some(&254));
        Ok(())
    }

    // ── C042-Inv: Invariant — Opus always 255, PCMU always 254

    #[test]
    // @verifies C042
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn opus_invariant_always_255_in_auto_mode() -> TestResult {
        let codecs = vec![
            CodecInfo::new("opus/48000/2"),
            CodecInfo::new("opus/48000/1"),
            CodecInfo::new("PCMU/8000/1"),
        ];
        let preferred: Vec<String> = vec![];

        let result = CodecAutoMode::apply(&codecs, &preferred)?;

        for (id, priority) in &result {
            if id.starts_with("opus/") {
                assert_eq!(*priority, 255, "Opus codec must be 255: {id}");
            }
            if *id == "PCMU/8000/1" {
                assert_eq!(*priority, 254, "PCMU must be 254");
            }
        }
        Ok(())
    }

    // ── Error cases

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn apply_rejects_duplicate_codec_id() {
        let codecs = vec![
            CodecInfo::new("opus/48000/2"),
            CodecInfo::new("opus/48000/2"), // duplicate
        ];
        let preferred: Vec<String> = vec![];

        let err = CodecAutoMode::apply(&codecs, &preferred).unwrap_err();
        assert_eq!(err.kind, crate::error::SipErrorKind::NativeError);
        assert!(err.message.contains("duplicate"));
    }

    // ── Boundary cases

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn apply_empty_codec_list_returns_empty_map() -> TestResult {
        let codecs: Vec<CodecInfo> = vec![];
        let preferred: Vec<String> = vec![];

        let result = CodecAutoMode::apply(&codecs, &preferred)?;

        assert!(result.is_empty(), "empty codec list => empty priority map");
        Ok(())
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn apply_unknown_codec_receives_priority_zero() -> TestResult {
        let codecs = vec![CodecInfo::new("G722/8000/1"), CodecInfo::new("iLBC/8000/1")];
        let preferred: Vec<String> = vec![];

        let result = CodecAutoMode::apply(&codecs, &preferred)?;

        assert_eq!(result.get("G722/8000/1"), Some(&0));
        assert_eq!(result.get("iLBC/8000/1"), Some(&0));
        Ok(())
    }
}
