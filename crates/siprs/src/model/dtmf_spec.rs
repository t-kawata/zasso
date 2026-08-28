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

/// DTMF signaling method — the single definition shared across §20, the public
/// API, and the M20 conversion (§62.15 Q5).
///
/// RFC 2833 was obsoleted by RFC 4733, so the legacy `Rfc2833` variant is not
/// part of the unified set: callers that previously used it now use `Rfc4733`.
/// The former `SipInfo` name (RFC 2976 SIP INFO method) is spelled `Info`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DtmfMethod {
    /// RFC 4733 — out-of-band DTMF as an RTP event payload.
    Rfc4733,
    /// SIP INFO method (RFC 2976) — in-band DTMF carried in SIP signaling.
    Info,
    /// In-band audio tones carried in the media stream.
    Inband,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: exactly three variants ─────────────────────────────────

    /// @verifies C105
    /// @verifies C130
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    // [::TICKET::] P17-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-7 --for-spec --no-implementation-order`.
    fn dtmf_method_matches_section20_three_variants() {
        // Exhaustive match proves exactly Inband/Info/Rfc4733 — an Rfc2833
        // arm would fail to compile, making the removed legacy variant a
        // compile-time invariant (§62.15, C106).
        // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
        fn variant(method: DtmfMethod) -> &'static str {
            match method {
                DtmfMethod::Rfc4733 => "rfc4733",
                DtmfMethod::Info => "info",
                DtmfMethod::Inband => "inband",
            }
        }
        assert_eq!(variant(DtmfMethod::Rfc4733), "rfc4733");
        assert_eq!(variant(DtmfMethod::Info), "info");
        assert_eq!(variant(DtmfMethod::Inband), "inband");
    }

    // ── Normal: derive traits ──────────────────────────────────────────

    /// @verifies C106
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    fn dtmf_method_derives_equality_and_copy() {
        let first = DtmfMethod::Info;
        let copied = first; // Copy
        assert_eq!(first, copied); // PartialEq + Eq
        assert_ne!(first, DtmfMethod::Inband);
        // Copy is a subtrait of Clone, so a Copy value also satisfies Clone.
        let cloned = DtmfMethod::Rfc4733;
        assert_eq!(cloned, DtmfMethod::Rfc4733);
    }

    // ── Boundary: serde round-trip for the three canonical names ──────

    /// @verifies C106
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    fn dtmf_method_serde_round_trip() {
        let cases = [
            (DtmfMethod::Rfc4733, "\"Rfc4733\""),
            (DtmfMethod::Info, "\"Info\""),
            (DtmfMethod::Inband, "\"Inband\""),
        ];
        for (method, json) in cases {
            let serialized = serde_json::to_string(&method).expect("serializes");
            assert_eq!(serialized, json);
            let deserialized: DtmfMethod =
                serde_json::from_str(json).expect("deserializes canonical name");
            assert_eq!(deserialized, method);
        }
    }

    // ── Error: legacy names are rejected by serde ──────────────────────

    /// @verifies C106
    #[test]
    // [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
    fn dtmf_method_serde_rejects_legacy_names() {
        for legacy in ["\"Rfc2833\"", "\"SipInfo\""] {
            let result: Result<DtmfMethod, _> = serde_json::from_str(legacy);
            assert!(
                result.is_err(),
                "legacy variant name {legacy} must not deserialize"
            );
        }
    }
}
