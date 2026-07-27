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

// ---------------------------------------------------------------------------
// pj_status_t — FFI type alias for PJSIP error codes
// ---------------------------------------------------------------------------

/// PJSIP native status code. Defined as `u32` in this spec phase; replaced by
/// the actual FFI `pj_status_t` once the FFI crate (P0-9) is available.
// [::STUB::] P0-9: Replace with actual pj_status_t from pj_sys FFI crate.
#[allow(non_camel_case_types)]
pub(crate) type pj_status_t = u32;

// ---------------------------------------------------------------------------
// DtmfMethod — DTMF signaling method enumeration
// ---------------------------------------------------------------------------

/// DTMF transmission method.
///
/// Each variant corresponds to a distinct DTMF signaling mechanism supported
/// by PJSIP. The same enum is shared between `DtmfReceivedInfo` (inbound) and
/// `DtmfSentInfo` (outbound) — there is exactly one definition.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
// [::STUB::] P0-8: DtmfMethod enum is consumed by AudioWorker/Reactor for
// SendDtmf dispatch. Only tests construct it in this phase.
#[allow(dead_code)]
pub(crate) enum DtmfMethod {
    /// In-band audio tone transmission.
    Inband,
    /// SIP INFO message-based DTMF delivery.
    SipInfo,
    /// RFC 4733 (RTP payload) DTMF transmission.
    Rfc4733,
}

// ---------------------------------------------------------------------------
// SentDtmfError — DTMF send attempt error classification
// ---------------------------------------------------------------------------

/// Errors that can occur during a DTMF send attempt.
///
/// `PjsipError` carries the native PJSIP status code when the underlying
/// `pjsua_call_dial_dtmf()` call fails. `Timeout` indicates that no PJSIP
/// callback arrived within the configured timeout window.
// [::STUB::] P0-8: SentDtmfError is consumed by AudioWorker/Reactor when
// DtmfSent timeout fires. Only tests construct it in this phase.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SentDtmfError {
    /// PJSIP internal error, carrying the translated `pj_status_t` code.
    PjsipError(pj_status_t),
    /// The send attempt timed out (no PJSIP callback response).
    Timeout,
}

// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
impl std::fmt::Display for SentDtmfError {
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SentDtmfError::PjsipError(code) => {
                write!(f, "PJSIP error code {code}")
            }
            SentDtmfError::Timeout => {
                write!(f, "DTMF send timed out")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// DtmfSentInfo — DTMF send attempt result payload
// ---------------------------------------------------------------------------

/// Result of a DTMF send attempt.
///
/// Unlike `DtmfReceivedInfo` (which carries the remote peer's reception
/// details), `DtmfSentInfo` reports the **local** outcome of a send attempt:
/// whether the digit was queued successfully (`Ok(())`) or failed with an
/// error. The `pjsip_status` field provides the raw PJSIP error code when
/// the attempt failed; it is `None` on success.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DtmfSentInfo {
    /// DTMF signaling method used for this send attempt.
    pub method: DtmfMethod,
    /// The digit character that was sent.
    pub digit: char,
    /// Outcome of the send attempt — `Ok(())` on success, or
    /// `Err(SentDtmfError)` on failure.
    pub status: Result<(), SentDtmfError>,
    /// Raw PJSIP error code, present only when `status` is `Err`.
    pub pjsip_status: Option<pj_status_t>,
}

// ---------------------------------------------------------------------------
// DtmfConfig — DTMF-specific configuration
// ---------------------------------------------------------------------------

/// DTMF subsystem configuration.
///
/// Embedded in `ClientConfig` (P0-1) once the config module is finalized.
/// Currently defined as a standalone struct for testability.
// [::STUB::] P0-8: DtmfConfig is integrated into ClientConfig by P0-1 and
// consumed by AudioWorker/Reactor. Struct defined here for testability.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub(crate) struct DtmfConfig {
    /// Timeout in milliseconds after which a DTMF send attempt without a
    /// PJSIP callback is considered failed. `None` means the default value
    /// defined by `DEFAULT_SENT_TIMEOUT_MS` (500ms) is used.
    pub sent_timeout_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// DEFAULT_SENT_TIMEOUT_MS — default DTMF send timeout
// ---------------------------------------------------------------------------

/// Default timeout for DTMF send completion, in milliseconds.
///
/// Per §20 (N0029), when PJSIP does not fire a send-completion callback
/// within this window, the reactor fallback timer auto-publishes a
/// `DtmfSent` event with `status: Err(SentDtmfError::Timeout)`.
// [::STUB::] P0-8: DEFAULT_SENT_TIMEOUT_MS is consumed by AudioWorker/Reactor
// fallback timer logic.
#[allow(dead_code)]
pub(crate) const DEFAULT_SENT_TIMEOUT_MS: u64 = 500;

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::SipEventPayload;
    use crate::concurrency_contexts::command_serialization::RuntimeCommand;
    use crate::error::SipError;

    // -----------------------------------------------------------------------
    // ── C031 ── N0029→N0029 (self): DtmfSentInfo struct
    // -----------------------------------------------------------------------

    /// @verifies C031-precondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_method_all_variants_constructible() {
        let inband = DtmfMethod::Inband;
        let sip_info = DtmfMethod::SipInfo;
        let rfc4733 = DtmfMethod::Rfc4733;

// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}

        assert_debug::<DtmfMethod>();
        assert_clone::<DtmfMethod>();
        assert_partial_eq::<DtmfMethod>();
        assert_eq_trait::<DtmfMethod>();

        assert_eq!(inband, DtmfMethod::Inband);
        assert_ne!(inband, sip_info);
        assert_ne!(inband, rfc4733);
        assert_ne!(sip_info, rfc4733);
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_all_fields_accessible() {
        let info = DtmfSentInfo {
            method: DtmfMethod::SipInfo,
            digit: '5',
            status: Ok(()),
            pjsip_status: None,
        };

        assert_eq!(info.method, DtmfMethod::SipInfo);
        assert_eq!(info.digit, '5');
        assert!(info.status.is_ok());
        assert_eq!(info.pjsip_status, None);
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_with_timeout_error() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Inband,
            digit: '0',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        };

        assert_eq!(info.status, Err(SentDtmfError::Timeout));
        assert_eq!(info.pjsip_status, None);
    }

    /// @verifies C031-invariant
    /// @verifies C032-invariant
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_debug_and_clone() {
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_debug::<DtmfSentInfo>();
        assert_clone::<DtmfSentInfo>();
    }

    // -----------------------------------------------------------------------
    // ── C032 ── N0029→N0029 (self): Two-phase semantics
    // -----------------------------------------------------------------------

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_event_payload_independent_of_return() {
        let event_payload = SipEventPayload::DtmfSent(DtmfSentInfo {
            method: DtmfMethod::Inband,
            digit: '1',
            status: Ok(()),
            pjsip_status: None,
        });

        assert!(matches!(event_payload, SipEventPayload::DtmfSent(_)));
        if let SipEventPayload::DtmfSent(info) = &event_payload {
            assert_eq!(info.digit, '1');
        }
    }

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn two_phase_signal_separation() {
        // Return type: Result<(), SipError> (synchronous command acceptance)
        let _return_type: Result<(), SipError> = Ok(());

        // Event type: SipEventPayload::DtmfSent(DtmfSentInfo) (async completion)
        let _event_type = SipEventPayload::DtmfSent(DtmfSentInfo {
            method: DtmfMethod::Rfc4733,
            digit: '*',
            status: Ok(()),
            pjsip_status: None,
        });
    }

    // -----------------------------------------------------------------------
    // ── C033 ── N0029→N0029 (self): 500ms timeout fallback
    // -----------------------------------------------------------------------

    /// @verifies C033-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn default_sent_timeout_is_500() {
        assert_eq!(DEFAULT_SENT_TIMEOUT_MS, 500);
    }

    /// @verifies C033-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_config_sent_timeout_defaults_to_500() {
        // When sent_timeout_ms is None, effective timeout is 500ms
        let config = DtmfConfig { sent_timeout_ms: None };
        let effective = config.sent_timeout_ms.unwrap_or(DEFAULT_SENT_TIMEOUT_MS);
        assert_eq!(effective, 500);

        // Explicit value overrides default
        let config_explicit = DtmfConfig {
            sent_timeout_ms: Some(1000),
        };
        assert_eq!(config_explicit.sent_timeout_ms, Some(1000));
        let effective_explicit = config_explicit
            .sent_timeout_ms
            .unwrap_or(DEFAULT_SENT_TIMEOUT_MS);
        assert_eq!(effective_explicit, 1000);
    }

    /// @verifies C033-invariant
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_config_zero_timeout_constructs() {
        // Edge case: sent_timeout_ms = 0 means "fire immediately"
        let config = DtmfConfig {
            sent_timeout_ms: Some(0),
        };
        assert_eq!(config.sent_timeout_ms, Some(0));
    }

    // -----------------------------------------------------------------------
    // ── C034 ── N0029→N0028: DtmfMethod shared definition
    // -----------------------------------------------------------------------

    /// @verifies C034-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_method_shared_across_types() {
        // DtmfMethod is used by both DtmfSentInfo and would be used by
        // DtmfReceivedInfo. Verify the enum is importable at the module level.
        let sent_method = DtmfMethod::Inband;
        let _ = DtmfSentInfo {
            method: sent_method,
            digit: '3',
            status: Ok(()),
            pjsip_status: None,
        };
    }

    // -----------------------------------------------------------------------
    // ── C035 ── N0029→N0018: SipEventPayload::DtmfSent payload
    // -----------------------------------------------------------------------

    /// @verifies C035-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_variant_carries_payload() {
        let dtmf_sent = SipEventPayload::DtmfSent(DtmfSentInfo {
            method: DtmfMethod::Inband,
            digit: '9',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        });

        match dtmf_sent {
            SipEventPayload::DtmfSent(info) => {
                assert_eq!(info.digit, '9');
                assert_eq!(info.status, Err(SentDtmfError::Timeout));
                assert_eq!(info.pjsip_status, None);
            }
            _ => panic!("expected DtmfSent variant"),
        }
    }

    // -----------------------------------------------------------------------
    // ── SentDtmfError::Display
    // -----------------------------------------------------------------------

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn sent_dtmf_error_display_timeout() {
        let timeout = SentDtmfError::Timeout;
        assert_eq!(format!("{}", timeout), "DTMF send timed out");
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn sent_dtmf_error_display_pjsip_error() {
        let pjsip_err = SentDtmfError::PjsipError(12345);
        let display = format!("{}", pjsip_err);
        assert!(
            display.contains("12345"),
            "PjsipError Display must include the error code, got: {display}"
        );
    }

    // -----------------------------------------------------------------------
    // ── Boundary cases
    // -----------------------------------------------------------------------

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_null_digit() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Inband,
            digit: '\0',
            status: Ok(()),
            pjsip_status: None,
        };
        assert_eq!(info.digit, '\0');
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_unicode_digit() {
        let info = DtmfSentInfo {
            method: DtmfMethod::SipInfo,
            digit: '\u{263A}',
            status: Ok(()),
            pjsip_status: None,
        };
        assert_eq!(info.digit, '\u{263A}');
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_ok_status_no_pjsip_code() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Inband,
            digit: '5',
            status: Ok(()),
            pjsip_status: None,
        };
        assert!(info.status.is_ok());
        assert_eq!(info.pjsip_status, None);
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_error_with_pjsip_code() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc4733,
            digit: '#',
            status: Err(SentDtmfError::PjsipError(1717)),
            pjsip_status: Some(1717),
        };
        assert_eq!(info.status, Err(SentDtmfError::PjsipError(1717)));
        assert_eq!(info.pjsip_status, Some(1717));
    }

    // -----------------------------------------------------------------------
    // ── RuntimeCommand::SendDtmf integration
    // -----------------------------------------------------------------------

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn runtime_command_send_dtmf_has_dtmf_method_type() {
        // Verify that the `method` field in SendDtmf is of type DtmfMethod
        // by exhaustive pattern matching. The ReplySender field is private
        // so we can't construct the variant directly; we assert the type
        // exists at the RuntimeCommand enum level.
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
        fn assert_refutability(cmd: &RuntimeCommand) {
            match cmd {
                RuntimeCommand::SendDtmf {
                    ref method,
                    ref digits,
                    ..
                } => {
                    let _: &DtmfMethod = method;
                    let _: &String = digits;
                }
                _ => {}
            }
        }
        // Compile-time guard: _ prefix avoids unused-variable warning
        let _ = assert_refutability;
    }

    // -----------------------------------------------------------------------
    // ── Cross-module integration (local compilation check)
    // -----------------------------------------------------------------------

    /// @verifies C035-postcondition
    #[test]
// [::TICKET::] P0-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
    fn sip_event_payload_dtmf_sent_with_info() {
        let _payload = SipEventPayload::DtmfSent(DtmfSentInfo {
            method: DtmfMethod::SipInfo,
            digit: '7',
            status: Ok(()),
            pjsip_status: None,
        });
    }
}
