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
//   - NODE_ID=N0021:  §15 M20 NativeEvent to SipEventPayload Conversion
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0021 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::concurrency_contexts::command_serialization::{AccountId, CallId};
use crate::state::m20_callstate_mapping::{
    convert_call_media_state, convert_call_state, CallState,
};

// ============================================================================
// NativeEvent enum — PJSIP callback events
// ============================================================================

/// Typed representation of a PJSIP callback event.
///
/// This enum bridges the PJSIP C callback layer and the Rust event system.
/// Variants are grouped into three priority tiers:
///
///   P0 — mandatory for integration tests: Registration, Call, Media, DTMF
///   P1 — operational observability: Transport, ICE
///   P2 — supplementary: transaction state, redirects, transfer, NAT
///
/// The enum is `#[non_exhaustive]` to allow future M20 extensions (TLS, DNS)
/// without breaking exhaustive match sites.
///
/// Reads as: "An event from the PJSIP callback bridge, typed by variant."
#[derive(Debug, Clone)]
#[non_exhaustive]
pub(crate) enum NativeEvent {
    // ── P0: Registration ──
    RegistrationStateChanged {
        acc_id: AccountId,
    },
    RegistrationStarted {
        acc_id: AccountId,
        renew: bool,
    },

    // ── P0: Call ──
    CallStateChanged {
        call_id: CallId,
        state: u8,
    },
    CallMediaStateChanged {
        call_id: CallId,
    },

    // ── P0: DTMF ──
    DtmfDigit {
        call_id: CallId,
        digit: char,
    },

    // ── P1: Transport/ICE ──
    TransportStateChanged {
        transport_id: u32,
        state: u8,
    },
    IceTransportError {
        call_id: CallId,
        status: i32,
    },

    // ── P2: Supplementary ──
    CallTsxStateChanged {
        call_id: CallId,
        tsx_state: u8,
    },
    CallRedirected {
        call_id: CallId,
        target: String,
    },
    CallTransferStatus {
        call_id: CallId,
        status_code: u16,
    },
    CallReplaced {
        old_call_id: CallId,
        new_call_id: CallId,
    },
    NatDetected {
        nat_type: u8,
        ip_address: String,
    },
}

// ============================================================================
// SipEventPayload — minimal definition for the conversion layer
// ============================================================================

/// Minimal SipEventPayload enum for M20 NativeEvent conversion.
///
/// Only the variants needed for P0 NativeEvent→SipEventPayload mapping are
/// defined here. This will be replaced by the canonical SipEventPayload from
/// `src/api/event_model_payload_bus.rs` (P1-1) which includes all 30+ variants
/// with typed payload structs.
///
/// The variants here are deliberately payload-free (unit variants) because the
/// actual payload struct types (RegistrationInfo, OutgoingCallInfo, etc.) are
/// defined in P1-1. Once P1-1 ships, the conversion functions in this module
/// will be updated to emit the typed payload structs.
// [::STUB::] P1-1: Replace with canonical SipEventPayload from event_model_payload_bus.rs.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub(crate) enum SipEventPayload {
    RegistrationStarted,
    RegistrationSucceeded,
    RegistrationFailed,
    OutgoingCallStarted,
    OutgoingCallTrying,
    IncomingCall,
    CallConnected,
    CallDisconnected,
    CallHeld,
    MediaActive,
    MediaError,
    DtmfReceived,
}

// ============================================================================
// Main conversion function
// ============================================================================

/// Converts a NativeEvent to the corresponding SipEventPayload.
///
/// Dispatches each NativeEvent variant to its specific conversion logic:
///
///   P0 variants (5 patterns):
///     - RegistrationStateChanged → delegates to GetAccountInfo pattern (returns None here)
///     - RegistrationStarted → RegistrationStarted
///     - CallStateChanged → delegates to convert_call_state()
///     - CallMediaStateChanged → delegates to convert_call_media_state()
///     - DtmfDigit → DtmfReceived
///
///   P1 variants (2 patterns): TransportStateChanged, IceTransportError → None (deferred)
///   P2 variants (5 patterns): CallTsxStateChanged, etc. → None (out of scope)
///
/// All 12 P0-P2 variants are matched explicitly — no wildcard `_` arm.
/// The `previous_call_state` parameter enables CONNECTING discrimination.
///
/// Reads as: "Convert a native event: for P0 events produce a typed payload;
/// for P1/P2 events skip (return None) as they are out of scope for this phase."
pub(crate) fn convert_native_event_to_payload(
    event: NativeEvent,
    previous_call_state: Option<CallState>,
) -> Option<SipEventPayload> {
    match event {
        // ── P0: Registration ──
        NativeEvent::RegistrationStateChanged { .. } => {
            // RegistrationStateChanged delegates to RuntimeCommand::GetAccountInfo.
            // At the conversion layer we return None; the caller (Reactor) spawns
            // the GetAccountInfo command and publishes the resulting event.
            None
        }
        NativeEvent::RegistrationStarted { .. } => Some(SipEventPayload::RegistrationStarted),

        // ── P0: Call ──
        NativeEvent::CallStateChanged { call_id, state } => {
            convert_call_state(call_id, state, previous_call_state)
        }
        NativeEvent::CallMediaStateChanged { call_id } => {
            // Media status is passed as a parameter from the backend query.
            // At the conversion layer we default to ACTIVE (1) since the actual
            // media_status comes from PjsuaBackend::get_call_media_status.
            // [::STUB::] P0-5: Replace hardcoded media_status with backend query.
            convert_call_media_state(call_id, 1)
        }

        // ── P0: DTMF ──
        NativeEvent::DtmfDigit { .. } => Some(SipEventPayload::DtmfReceived),

        // ── P1: Transport/ICE (deferred to P0-5 reactor) ──
        NativeEvent::TransportStateChanged { .. } => None,
        NativeEvent::IceTransportError { .. } => None,

        // ── P2: Supplementary (out of scope for SipEventPayload) ──
        NativeEvent::CallTsxStateChanged { .. } => None,
        NativeEvent::CallRedirected { .. } => None,
        NativeEvent::CallTransferStatus { .. } => None,
        NativeEvent::CallReplaced { .. } => None,
        NativeEvent::NatDetected { .. } => None,
    }
}

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::m20_callstate_mapping::PJSIP_INV_STATE_CALLING;

    // =======================================================================
    // C022-precondition — NativeEvent enum is constructable
    // =======================================================================

    /// @verifies C022-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_precondition_all_p0_variants_constructable() {
        let _reg_changed = NativeEvent::RegistrationStateChanged {
            acc_id: AccountId(1),
        };
        let _reg_started = NativeEvent::RegistrationStarted {
            acc_id: AccountId(2),
            renew: false,
        };
        let _call_state = NativeEvent::CallStateChanged {
            call_id: CallId(10),
            state: PJSIP_INV_STATE_CALLING,
        };
        let _media_state = NativeEvent::CallMediaStateChanged {
            call_id: CallId(10),
        };
        let _dtmf = NativeEvent::DtmfDigit {
            call_id: CallId(11),
            digit: '1',
        };
    }

    /// @verifies C022-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_precondition_all_p1_p2_variants_constructable() {
        let _transport = NativeEvent::TransportStateChanged {
            transport_id: 0,
            state: 1,
        };
        let _ice = NativeEvent::IceTransportError {
            call_id: CallId(0),
            status: -100,
        };
        let _tsx = NativeEvent::CallTsxStateChanged {
            call_id: CallId(0),
            tsx_state: 0,
        };
        let _redirect = NativeEvent::CallRedirected {
            call_id: CallId(0),
            target: String::new(),
        };
        let _transfer = NativeEvent::CallTransferStatus {
            call_id: CallId(0),
            status_code: 200,
        };
        let _replaced = NativeEvent::CallReplaced {
            old_call_id: CallId(0),
            new_call_id: CallId(1),
        };
        let _nat = NativeEvent::NatDetected {
            nat_type: 0,
            ip_address: String::new(),
        };
    }

    /// @verifies C022-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_precondition_native_event_is_debug_and_clone() {
        let event = NativeEvent::RegistrationStarted {
            acc_id: AccountId(1),
            renew: true,
        };
        let _debug = format!("{:?}", event);
        let _cloned = event.clone();
    }

    // =======================================================================
    // C022-postcondition — P0 variants produce correct payloads
    // =======================================================================

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_registration_started_with_renew_false() {
        let event = NativeEvent::RegistrationStarted {
            acc_id: AccountId(3),
            renew: false,
        };
        let result = convert_native_event_to_payload(event, None);
        assert!(result.is_some(), "RegistrationStarted must return Some");
        assert_eq!(
            result.unwrap(),
            SipEventPayload::RegistrationStarted,
            "RegistrationStarted(renew=false) must produce RegistrationStarted"
        );
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_registration_started_with_renew_true() {
        let event = NativeEvent::RegistrationStarted {
            acc_id: AccountId(4),
            renew: true,
        };
        let result = convert_native_event_to_payload(event, None);
        assert!(result.is_some(), "RegistrationStarted(renew=true) must return Some");
        assert_eq!(result.unwrap(), SipEventPayload::RegistrationStarted);
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_call_state_changed_delegates_to_convert_call_state() {
        let event = NativeEvent::CallStateChanged {
            call_id: CallId(10),
            state: PJSIP_INV_STATE_CALLING,
        };
        let result = convert_native_event_to_payload(event, None);
        assert!(result.is_some(), "CallStateChanged(CALLING) must return Some");
        assert_eq!(result.unwrap(), SipEventPayload::OutgoingCallStarted);
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_dtmf_digit_returns_dtmf_received() {
        let event = NativeEvent::DtmfDigit {
            call_id: CallId(11),
            digit: '5',
        };
        let result = convert_native_event_to_payload(event, None);
        assert!(result.is_some(), "DtmfDigit must return Some");
        assert_eq!(result.unwrap(), SipEventPayload::DtmfReceived);
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_dtmf_digit_zero_char() {
        let event = NativeEvent::DtmfDigit {
            call_id: CallId(11),
            digit: '0',
        };
        let result = convert_native_event_to_payload(event, None);
        assert!(result.is_some());
    }

    // =======================================================================
    // C022-postcondition — P1/P2 variants return None
    // =======================================================================

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_p1_transport_state_changed_returns_none() {
        let event = NativeEvent::TransportStateChanged {
            transport_id: 0,
            state: 1,
        };
        let result = convert_native_event_to_payload(event, None);
        assert!(result.is_none(), "P1 TransportStateChanged must return None");
    }

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_postcondition_p2_variants_return_none() {
        let tsx = NativeEvent::CallTsxStateChanged {
            call_id: CallId(0),
            tsx_state: 0,
        };
        assert!(
            convert_native_event_to_payload(tsx, None).is_none(),
            "P2 CallTsxStateChanged must return None"
        );

        let redirect = NativeEvent::CallRedirected {
            call_id: CallId(0),
            target: String::new(),
        };
        assert!(
            convert_native_event_to_payload(redirect, None).is_none(),
            "P2 CallRedirected must return None"
        );

        let replaced = NativeEvent::CallReplaced {
            old_call_id: CallId(0),
            new_call_id: CallId(1),
        };
        assert!(
            convert_native_event_to_payload(replaced, None).is_none(),
            "P2 CallReplaced must return None"
        );
    }

    // =======================================================================
    // C022-invariant
    // =======================================================================

    /// @verifies C022-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_invariant_does_not_panic_for_any_variant() {
        let variants: Vec<NativeEvent> = vec![
            NativeEvent::RegistrationStateChanged {
                acc_id: AccountId(0),
            },
            NativeEvent::RegistrationStarted {
                acc_id: AccountId(0),
                renew: false,
            },
            NativeEvent::CallStateChanged {
                call_id: CallId(0),
                state: 0,
            },
            NativeEvent::CallMediaStateChanged {
                call_id: CallId(0),
            },
            NativeEvent::DtmfDigit {
                call_id: CallId(0),
                digit: '1',
            },
            NativeEvent::TransportStateChanged {
                transport_id: 0,
                state: 0,
            },
            NativeEvent::IceTransportError {
                call_id: CallId(0),
                status: 0,
            },
            NativeEvent::CallTsxStateChanged {
                call_id: CallId(0),
                tsx_state: 0,
            },
            NativeEvent::CallRedirected {
                call_id: CallId(0),
                target: String::new(),
            },
            NativeEvent::CallTransferStatus {
                call_id: CallId(0),
                status_code: 200,
            },
            NativeEvent::CallReplaced {
                old_call_id: CallId(0),
                new_call_id: CallId(1),
            },
            NativeEvent::NatDetected {
                nat_type: 0,
                ip_address: String::new(),
            },
        ];
        for ev in variants {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                convert_native_event_to_payload(ev, None);
            }));
            assert!(
                result.is_ok(),
                "convert_native_event_to_payload must not panic"
            );
        }
    }

    // =======================================================================
    // Boundary — call_id propagation
    // =======================================================================

    /// @verifies C022-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_boundary_call_id_propagation() {
        let _r0 = convert_native_event_to_payload(
            NativeEvent::CallStateChanged {
                call_id: CallId(0),
                state: PJSIP_INV_STATE_CALLING,
            },
            None,
        );
        let _rmax = convert_native_event_to_payload(
            NativeEvent::CallStateChanged {
                call_id: CallId(u64::MAX),
                state: PJSIP_INV_STATE_CALLING,
            },
            None,
        );
    }

    // =======================================================================
    // Module structure — compile-time verification
    // =======================================================================

    /// @verifies C022-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_precondition_mod_rs_exists() {
        let content =
            std::fs::read_to_string("src/state/mod.rs")
                .expect("src/state/mod.rs must exist");
        assert!(
            content.contains("pub mod m20_native_event_conv"),
            "mod.rs must declare m20_native_event_conv"
        );
        assert!(
            content.contains("pub mod m20_callstate_mapping"),
            "mod.rs must declare m20_callstate_mapping"
        );
        assert!(
            content.contains("pub mod m20_registr_cmd_pat"),
            "mod.rs must declare m20_registr_cmd_pat"
        );
    }

    /// @verifies C022-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c022_precondition_lib_rs_declares_state() {
        let content =
            std::fs::read_to_string("src/lib.rs")
                .expect("src/lib.rs must exist");
        assert!(
            content.contains("pub mod state"),
            "lib.rs must declare pub mod state"
        );
    }
}
