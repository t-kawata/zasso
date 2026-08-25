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
//   - NODE_ID=N0077:  62.8 エラー変換の native_status 保持
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0077 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! §62.8 Error conversion — SipError native_status preservation (NODE_ID=N0077).
//!
//! The reactor error path must preserve the PJSUA `pj_status_t` diagnostic code
//! end-to-end: FFI status → `map_native_error`/`ReactorError::NativeError` →
//! `From<ReactorError> for SipError` → public `SipError.native_status()`.
//!
//! §14.1 compliance is centralized in `m20_runtime_command_error::classify` —
//! the single source of truth for the `pj_status_t → SipErrorKind` mapping.
//! `SipError::with_status` is the only constructor that stores the native code.
//!
//! The integration tests below prove the invariant: no conversion step drops
//! `native_status` once set.

#[cfg(test)]
mod tests {
    use crate::error::error_design_siperror::{SipError, SipErrorKind};
    use crate::runtime::command::ReactorError;

    // ── C089: reactor path never loses native_status ─────────────────

    #[test]
    // @verifies C089
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn reactor_native_error_conversion_preserves_native_status() {
        let sip: SipError = ReactorError::NativeError {
            message: "make_call failed".into(),
            native_status: crate::ffi::bindings::PJ_EUNKNOWN,
        }
        .into();
        assert_eq!(sip.native_status(), Some(crate::ffi::bindings::PJ_EUNKNOWN));
        assert_eq!(sip.kind, SipErrorKind::NativeError);
    }

    #[test]
    // @verifies C089
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn with_status_round_trips_native_status() {
        let err = SipError::with_status(SipErrorKind::NativeError, "hangup failed", 70001);
        let _: Option<i32> = err.native_status;
        assert_eq!(err.native_status(), Some(70001));
    }

    // ── C090: map_native_error is the backend conversion entry point ─

    #[test]
    // @verifies C090
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn backend_map_native_error_preserves_status() {
        let err = crate::runtime::backend::map_native_error(
            crate::ffi::bindings::PJ_EBUSY,
            "conf_connect failed",
        );
        assert_eq!(err.native_status(), Some(crate::ffi::bindings::PJ_EBUSY));
        assert_eq!(err.kind, SipErrorKind::NativeError);
    }
}
