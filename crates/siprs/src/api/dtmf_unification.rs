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
//   - NODE_ID=N0084:  62.15 DTMF 実装整合（DtmfMethod 一元化 / method / DtmfSent）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0084 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P16-6: DTMF unification — the §62.15 integration hub.
//
// Re-exports the single `DtmfMethod` definition and maps each method to the
// PJSIP send API it must use. Keeping this mapping pure keeps the
// FFI layer (`backend_calls::send_dtmf`) a thin dispatch wrapper and the
// whole mapping unit-testable without `pjsua-native`.

pub use crate::model::dtmf_spec::DtmfMethod;

/// The PJSIP call the FFI layer must invoke for a given `DtmfMethod`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfSendApi {
    /// `pjsua_call_send_dtmf` — SIP INFO / RTP event (RFC 2976 / RFC 4733).
    SendDtmf,
    /// `pjsua_call_dial_dtmf` — RFC 2833 payload (in-band method).
    DialDtmf,
}

/// Map a `DtmfMethod` to the PJSIP send API (§62.15 Q5).
///
/// `Info` and `Rfc4733` are carried by `pjsua_call_send_dtmf` (SIP INFO / RTP
/// event), while `Inband` uses `pjsua_call_dial_dtmf`.
pub fn send_api_for(method: DtmfMethod) -> DtmfSendApi {
    match method {
        DtmfMethod::Info | DtmfMethod::Rfc4733 => DtmfSendApi::SendDtmf,
        DtmfMethod::Inband => DtmfSendApi::DialDtmf,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: every method resolves to its PJSIP API ─────────────────

    /// @verifies C106
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    fn send_api_for_maps_rfc4733_and_info_to_send_dtmf() {
        assert_eq!(send_api_for(DtmfMethod::Rfc4733), DtmfSendApi::SendDtmf);
        assert_eq!(send_api_for(DtmfMethod::Info), DtmfSendApi::SendDtmf);
    }

    /// @verifies C106
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    fn send_api_for_maps_inband_to_dial_dtmf() {
        assert_eq!(send_api_for(DtmfMethod::Inband), DtmfSendApi::DialDtmf);
    }

    // ── Invariant: the re-export is the single model definition ───────

    /// @verifies C106
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    fn dtmf_method_is_the_model_single_definition() {
        let model: crate::model::dtmf_spec::DtmfMethod = DtmfMethod::Inband;
        assert_eq!(model, DtmfMethod::Inband);
    }
}
