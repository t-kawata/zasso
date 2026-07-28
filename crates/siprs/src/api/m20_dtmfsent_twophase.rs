// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
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
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// ============================================================================
//
// [::TICKET::] P0-5: DtmfSentInfo two-phase design — command acceptance + async completion

/// Result of a DTMF send attempt.
///
/// Separates synchronous command acceptance (`send_dtmf()` returning `Ok(())`)
/// from asynchronous completion (DtmfSent event). This two-phase design allows
/// callers to confirm the command was queued immediately while receiving the
/// actual send result asynchronously via the EventBus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DtmfSentInfo {
    /// The DTMF method used for sending.
    pub method: DtmfMethod,
    /// The digit that was sent.
    pub digit: char,
    /// Whether the send succeeded or failed.
    pub status: Result<(), SentDtmfError>,
    /// Raw PJSIP error code, if applicable.
    pub pjsip_status: Option<u32>,
}

/// Errors that can occur during DTMF sending.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SentDtmfError {
    /// PJSIP returned an error code.
    PjsipError(u32),
    /// The PJSIP callback did not fire within the timeout window.
    Timeout,
}

/// DTMF transmission method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfMethod {
    /// RFC 2833 / RFC 4733 out-of-band DTMF (RTP event).
    Rfc4733,
    /// SIP INFO in-band DTMF.
    Info,
}

/// Default timeout (ms) for DtmfSent fallback when PJSIP callback is unavailable.
pub const DEFAULT_DTMF_SENT_TIMEOUT_MS: u64 = 500;

#[cfg(test)]
mod tests {
    use super::*;

    // ── DtmfSentInfo Normal ────────────────────────────────────────────

    /// @verifies C030
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_ok_status() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc4733,
            digit: '1',
            status: Ok(()),
            pjsip_status: None,
        };
        assert!(info.status.is_ok());
        assert_eq!(info.digit, '1');
        assert_eq!(info.method, DtmfMethod::Rfc4733);
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_pjsip_error() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Info,
            digit: '5',
            status: Err(SentDtmfError::PjsipError(12345)),
            pjsip_status: Some(12345),
        };
        assert!(info.status.is_err());
        match info.status.unwrap_err() {
            SentDtmfError::PjsipError(code) => assert_eq!(code, 12345),
            _ => panic!("expected PjsipError"),
        }
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_timeout() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc4733,
            digit: '9',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        };
        assert!(info.status.is_err());
        match info.status.unwrap_err() {
            SentDtmfError::Timeout => {} // expected
            _ => panic!("expected Timeout"),
        }
    }

    // ── DtmfMethod ─────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_method_variants() {
        assert_ne!(DtmfMethod::Rfc4733, DtmfMethod::Info);
    }

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_method_debug() {
        let method = DtmfMethod::Rfc4733;
        assert!(!format!("{method:?}").is_empty());
    }

    // ── Default timeout constant ───────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn default_dtmf_timeout_is_500ms() {
        assert_eq!(DEFAULT_DTMF_SENT_TIMEOUT_MS, 500);
    }

    // ── Clone + Debug invariants ───────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_is_clone_and_debug() {
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<DtmfSentInfo>();
        assert_clone_debug::<SentDtmfError>();
        assert_clone_debug::<DtmfMethod>();
    }

    // ── Edge: DtmfSentInfo with empty digit ───────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_empty_digit() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Info,
            digit: '\0',
            status: Ok(()),
            pjsip_status: None,
        };
        assert_eq!(info.digit, '\0');
    }
}
