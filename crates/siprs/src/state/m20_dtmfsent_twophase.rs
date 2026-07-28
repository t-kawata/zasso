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
//   - NODE_ID=N0029:  §20 M20 DtmfSentInfo & Two-Phase Design
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0029 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.

// [::STUB::] P0-5: DTMF_SENT_TIMEOUT_MS, DtmfSentInfo, and SentDtmfError are consumed
// by the P0-5 reactor layer (handle_send_dtmf, spawn_timer, DtmfSent event emission).
// Dead-code warnings are expected until P0-5 ships and constructs these items.
// Once P0-5 is implemented, remove this allow.
#![allow(dead_code)]

use crate::concurrency_contexts::command_serialization::DtmfMethod;

// ============================================================================
// Constants
// ============================================================================

/// Default timeout for DtmfSent fallback (500 milliseconds).
///
/// When a PJSIP callback does not fire after a DTMF send attempt, the reactor
/// uses this duration as the fallback timer before emitting a DtmfSent event
/// with SentDtmfError::Timeout.
///
/// Reads as: "The DTMF sent timeout constant defaults to 500 milliseconds."
pub(crate) const DTMF_SENT_TIMEOUT_MS: u64 = 500;

// ============================================================================
// DtmfSentInfo — struct definition
// ============================================================================

/// Result of a DTMF send attempt.
///
/// Carries the DTMF method, digit, send result, and optional native PJSIP
/// error code. This struct enables two-phase semantics:
///
/// Phase 1 — `send_dtmf()` returns `Ok(())` immediately, meaning the command
///           was accepted by the reactor and forwarded to PJSIP.
/// Phase 2 — A `DtmfSent` event delivers this struct asynchronously, reporting
///           the actual send result (success, PJSIP error, or timeout).
///
/// Reads as: "DTMF sent info with method, digit, result, and native error code."
#[derive(Debug, Clone)]
pub(crate) struct DtmfSentInfo {
    /// DTMF method used for this send attempt (Rfc2833, Info, or Inband).
    pub method: DtmfMethod,
    /// The digit character that was sent (0-9, *, #, A-D).
    pub digit: char,
    /// Outcome of the DTMF send attempt: Ok(()) on success, or a typed error.
    pub status: Result<(), SentDtmfError>,
    /// Native PJSIP error code, present only when status is Err(PjsipError).
    pub pjsip_status: Option<i32>,
}

// ============================================================================
// SentDtmfError — error enum
// ============================================================================

/// Errors that can occur during a DTMF send operation.
///
/// Exactly two variants:
///   - PjsipError(i32) — the PJSIP API returned a non-zero status code.
///   - Timeout — no PJSIP callback was received within the timeout window.
///
/// Reads as: "A DTMF send error: either a PJSIP native error or a timeout."
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SentDtmfError {
    /// PJSIP internal error, wrapping the native pj_status_t value.
    PjsipError(i32),
    /// Timeout: no PJSIP callback received within DTMF_SENT_TIMEOUT_MS.
    Timeout,
}

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::concurrency_contexts::command_serialization::DtmfMethod;

    // =======================================================================
    // C030-precondition — types are constructable
    // =======================================================================

    /// @verifies C030-precondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_precondition_dtmf_method_enum_is_constructable() {
        let rfc2833 = DtmfMethod::Rfc2833;
        let _info = DtmfMethod::Info;
        let _inband = DtmfMethod::Inband;

        // Exactly 3 variants enumerated via an exhaustive array
        let all_variants = [DtmfMethod::Rfc2833, DtmfMethod::Info, DtmfMethod::Inband];
        assert_eq!(all_variants.len(), 3);

        // Debug + Clone + PartialEq
        let _debug = format!("{:?}", rfc2833);
        let _cloned = rfc2833.clone();
        assert_eq!(rfc2833, DtmfMethod::Rfc2833);
    }

    // =======================================================================
    // C030-postcondition — DtmfSentInfo constructs with success
    // =======================================================================

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_postcondition_dtmf_sent_info_success() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc2833,
            digit: '1',
            status: Ok(()),
            pjsip_status: None,
        };
        assert_eq!(info.method, DtmfMethod::Rfc2833);
        assert_eq!(info.digit, '1');
        assert!(info.status.is_ok());
        assert!(info.pjsip_status.is_none());
    }

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_postcondition_dtmf_sent_info_pjsip_error() {
        let pj_status: i32 = -15000;
        let info = DtmfSentInfo {
            method: DtmfMethod::Info,
            digit: '*',
            status: Err(SentDtmfError::PjsipError(pj_status)),
            pjsip_status: Some(pj_status),
        };
        assert!(info.status.is_err());
        assert_eq!(info.pjsip_status, Some(pj_status));
        match info.status.unwrap_err() {
            SentDtmfError::PjsipError(code) => assert_eq!(code, -15000),
            _ => panic!("expected PjsipError"),
        }
    }

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_postcondition_dtmf_sent_info_timeout() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Inband,
            digit: '#',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        };
        assert_eq!(info.method, DtmfMethod::Inband);
        assert_eq!(info.digit, '#');
        assert!(info.status.is_err());
        assert!(info.pjsip_status.is_none());
        match info.status.unwrap_err() {
            SentDtmfError::Timeout => {}
            _ => panic!("expected Timeout"),
        }
    }

    // =======================================================================
    // C030-postcondition — SentDtmfError has exactly 2 variants
    // =======================================================================

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_postcondition_sent_dtmf_error_exactly_two_variants() {
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn exhaust(err: SentDtmfError) -> &'static str {
            match err {
                SentDtmfError::PjsipError(_) => "PjsipError",
                SentDtmfError::Timeout => "Timeout",
            }
        }
        assert_eq!(exhaust(SentDtmfError::PjsipError(0)), "PjsipError");
        assert_eq!(exhaust(SentDtmfError::Timeout), "Timeout");
    }

    // =======================================================================
    // C030-invariant — DTMF_SENT_TIMEOUT_MS constant
    // =======================================================================

    /// @verifies C030-invariant
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_invariant_timeout_constant_is_500() {
        assert_eq!(
            DTMF_SENT_TIMEOUT_MS, 500,
            "default timeout must be 500ms"
        );
        assert!(
            DTMF_SENT_TIMEOUT_MS >= 100,
            "minimum reasonable timeout is 100ms, got {}",
            DTMF_SENT_TIMEOUT_MS
        );
    }

    // =======================================================================
    // C030-invariant — trait implementations
    // =======================================================================

    /// @verifies C030-invariant
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_invariant_dtmf_sent_info_traits() {
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}

        assert_debug::<DtmfSentInfo>();
        assert_clone::<DtmfSentInfo>();

        let dtmf_sent = DtmfSentInfo {
            method: DtmfMethod::Rfc2833,
            digit: '1',
            status: Ok(()),
            pjsip_status: None,
        };
        let _debug = format!("{:?}", dtmf_sent);
        let _cloned = dtmf_sent.clone();
    }

    /// @verifies C030-invariant
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_invariant_sent_dtmf_error_traits() {
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}

        assert_debug::<SentDtmfError>();
        assert_clone::<SentDtmfError>();
        assert_partial_eq::<SentDtmfError>();
        assert_eq_trait::<SentDtmfError>();

        let _debug = format!("{:?}", SentDtmfError::Timeout);
        let _cloned = SentDtmfError::PjsipError(5);
        assert_eq!(
            SentDtmfError::PjsipError(5),
            SentDtmfError::PjsipError(5)
        );
        assert_ne!(SentDtmfError::PjsipError(5), SentDtmfError::Timeout);
    }

    // =======================================================================
    // Boundary tests — digit range and pjsip_status invariants
    // =======================================================================

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn boundary_digit_chars_full_dtmf_range() {
        let valid_digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#', 'A', 'D'];
        for ch in valid_digits {
            let info = DtmfSentInfo {
                method: DtmfMethod::Rfc2833,
                digit: ch,
                status: Ok(()),
                pjsip_status: None,
            };
            assert_eq!(info.digit, ch);
        }
    }

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn boundary_pjsip_status_none_on_success() {
        let success = DtmfSentInfo {
            method: DtmfMethod::Rfc2833,
            digit: '5',
            status: Ok(()),
            pjsip_status: None,
        };
        assert!(
            success.pjsip_status.is_none(),
            "success must not carry native error"
        );

        let timeout = DtmfSentInfo {
            method: DtmfMethod::Rfc2833,
            digit: '5',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        };
        assert!(
            timeout.pjsip_status.is_none(),
            "timeout must not carry native error"
        );

        let error = DtmfSentInfo {
            method: DtmfMethod::Rfc2833,
            digit: '5',
            status: Err(SentDtmfError::PjsipError(7001)),
            pjsip_status: Some(7001),
        };
        assert_eq!(
            error.pjsip_status,
            Some(7001),
            "PjsipError must carry native status"
        );
    }

    /// @verifies C030-postcondition
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn boundary_dtmf_sent_info_null_digit() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc2833,
            digit: '\0',
            status: Ok(()),
            pjsip_status: None,
        };
        assert_eq!(info.digit, '\0');
        let _ = format!("{:?}", info);
    }

    // =======================================================================
    // Invariant — determinism and module structure
    // =======================================================================

    /// @verifies C030-invariant
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn c030_invariant_mod_rs_declares_submodule() {
        let content = match std::fs::read_to_string("src/state/mod.rs") {
            Ok(c) => c,
            Err(e) => {
                panic!("state/mod.rs must exist: {e}");
            }
        };
        assert!(
            content.contains("pub mod m20_dtmfsent_twophase"),
            "state/mod.rs must declare m20_dtmfsent_twophase submodule"
        );
    }
}
