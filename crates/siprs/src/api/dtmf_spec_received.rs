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
//   - NODE_ID=N0028:  §20 DTMF Specification & DtmfReceived
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0028 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! DTMF received event specification.
//!
//! Defines `DtmfReceivedInfo` — a pure data container representing a received
//! DTMF digit with its method, duration, and volume metadata. The `DtmfMethod`
//! enum is shared with the `m20_dtmfsent_twophase` module so that both inbound
//! (DtmfReceived) and outbound (DtmfSent) DTMF use the same method definition.
//!
//! ## N0028 → N0027 (C029)
//!
//! Relies on the Call API (P5-1) defining `send_dtmf()`; this module provides
//! the received-DTMF data structure consumed by the event bus.

use crate::api::m20_dtmfsent_twophase::DtmfMethod;

// ---------------------------------------------------------------------------
// DtmfReceivedInfo — payload for received DTMF events
// ---------------------------------------------------------------------------

/// Metadata for a received DTMF digit.
///
/// Emitted via `SipEventPayload::DtmfReceived(DtmfReceivedInfo)` when the
/// PJSIP `on_dtmf_digit` callback fires (or when a digit is extracted from
/// the RTP stream by the media layer).
///
/// All fields are public; the struct is a pure data container with no
/// behavioural methods. Validation (e.g., policy-based method allow-listing)
/// occurs at the event emission point (the runtime reactor, P3-2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DtmfReceivedInfo {
    /// DTMF signalling method used for this received digit.
    pub method: DtmfMethod,
    /// The received digit character ('0'–'9', '*', '#', 'A'–'D', or any
    /// other char the PSTN might deliver).
    pub digit: char,
    /// Duration of the tone in milliseconds, if reported by the PJSIP
    /// callback. `None` when duration information is unavailable.
    pub duration_ms: Option<u16>,
    /// Signal volume in dBm0, if reported by the PJSIP callback.
    /// Range: -128 (minimum) to 127 (maximum); 0 dBm0 is the reference
    /// tone level. `None` when volume information is unavailable.
    pub volume_dbm0: Option<i8>,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C029: DTMF specification & DtmfReceived ────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C029-precondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_method_all_variants_constructible() {
        let inband = DtmfMethod::Inband;
        let sip_info = DtmfMethod::SipInfo;
        let rfc4733 = DtmfMethod::Rfc4733;

        assert_eq!(inband, DtmfMethod::Inband);
        assert_ne!(inband, sip_info);
        assert_ne!(inband, rfc4733);
        assert_ne!(sip_info, rfc4733);
    }

    /// @verifies C029-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_all_fields_accessible() {
        let info = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '5',
            duration_ms: Some(250),
            volume_dbm0: Some(-5),
        };
        assert_eq!(info.method, DtmfMethod::Rfc4733);
        assert_eq!(info.digit, '5');
        assert_eq!(info.duration_ms, Some(250));
        assert_eq!(info.volume_dbm0, Some(-5));
    }

    /// @verifies C029-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_with_none_fields() {
        let info = DtmfReceivedInfo {
            method: DtmfMethod::Inband,
            digit: '*',
            duration_ms: None,
            volume_dbm0: None,
        };
        assert_eq!(info.method, DtmfMethod::Inband);
        assert_eq!(info.digit, '*');
        assert_eq!(info.duration_ms, None);
        assert_eq!(info.volume_dbm0, None);
    }

    /// @verifies C029-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_non_ascii_digit() {
        let info = DtmfReceivedInfo {
            method: DtmfMethod::SipInfo,
            digit: '\u{2665}',
            duration_ms: None,
            volume_dbm0: None,
        };
        assert_eq!(info.digit, '\u{2665}');
    }

    /// @verifies C029-postcondition
    /// @verifies C029-boundary
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_duration_boundaries() {
        let min = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '1',
            duration_ms: Some(0),
            volume_dbm0: None,
        };
        assert_eq!(min.duration_ms, Some(0));

        let max = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '2',
            duration_ms: Some(u16::MAX),
            volume_dbm0: None,
        };
        assert_eq!(max.duration_ms, Some(u16::MAX));
    }

    /// @verifies C029-postcondition
    /// @verifies C029-boundary
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_volume_boundaries() {
        let min = DtmfReceivedInfo {
            method: DtmfMethod::Inband,
            digit: '0',
            duration_ms: None,
            volume_dbm0: Some(i8::MIN),
        };
        assert_eq!(min.volume_dbm0, Some(i8::MIN));

        let max = DtmfReceivedInfo {
            method: DtmfMethod::Inband,
            digit: '0',
            duration_ms: None,
            volume_dbm0: Some(i8::MAX),
        };
        assert_eq!(max.volume_dbm0, Some(i8::MAX));

        let reference = DtmfReceivedInfo {
            method: DtmfMethod::Inband,
            digit: '0',
            duration_ms: None,
            volume_dbm0: Some(0),
        };
        assert_eq!(reference.volume_dbm0, Some(0));
    }

    /// @verifies C029-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_implements_traits() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}

        assert_debug::<DtmfReceivedInfo>();
        assert_clone::<DtmfReceivedInfo>();
        assert_partial_eq::<DtmfReceivedInfo>();
        assert_eq_trait::<DtmfReceivedInfo>();
    }

    /// @verifies C029-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_method_three_variants_discriminable() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_discriminant(m: DtmfMethod) -> &'static str {
            match m {
                DtmfMethod::Inband => "inband",
                DtmfMethod::SipInfo => "sipinfo",
                DtmfMethod::Rfc4733 => "rfc4733",
            }
        }
        assert_eq!(assert_discriminant(DtmfMethod::Inband), "inband");
        assert_eq!(assert_discriminant(DtmfMethod::SipInfo), "sipinfo");
        assert_eq!(assert_discriminant(DtmfMethod::Rfc4733), "rfc4733");
    }

    // -----------------------------------------------------------------------
    // ── C030: Shared DtmfMethod with DtmfSentInfo ──────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C030-precondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_received_info_uses_shared_dtmf_method() {
        // DtmfReceivedInfo.method accepts the DtmfMethod from m20_dtmfsent_twophase
        let _info = DtmfReceivedInfo {
            method: crate::api::m20_dtmfsent_twophase::DtmfMethod::Inband,
            digit: '1',
            duration_ms: None,
            volume_dbm0: None,
        };
    }

    /// @verifies C030-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_uses_same_dtmf_method() {
        // Same DtmfMethod type used across DtmfReceivedInfo and DtmfSentInfo
        let method = DtmfMethod::SipInfo;
        let _received = DtmfReceivedInfo {
            method,
            digit: '3',
            duration_ms: None,
            volume_dbm0: None,
        };
        // DtmfSentInfo from m20_dtmfsent_twophase also accepts DtmfMethod
        let _sent = crate::api::m20_dtmfsent_twophase::DtmfSentInfo {
            method,
            digit: '3',
            status: Ok(()),
            pjsip_status: None,
        };
    }
}
