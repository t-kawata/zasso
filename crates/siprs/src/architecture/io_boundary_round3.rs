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
//   - NODE_ID=N0099:  62.30 I/O 境界参照情報（graphify / boundify 用）— round 3
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0099 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::architecture::round3_scope_rootcause::Round3Section;

/// One row of the §62.30 round-3 I/O boundary reference table.
///
/// Each row describes one round-3 design decision's I/O boundary so that
/// graphify / boundify can make split and prune decisions without reading the
/// RFC prose (§62.22–62.29).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round3IoBoundaryRow {
    /// The round-3 design decision whose I/O boundary this row describes.
    pub decision: Round3Section,
    /// Inputs (consumes) at the boundary.
    pub consumes: &'static str,
    /// Outputs (produces) at the boundary.
    pub produces: &'static str,
    /// File/module candidates that graphify / boundify inspect for this boundary.
    pub file_candidates: &'static [&'static str],
    /// Related RFC graph node IDs that constrain the boundary.
    pub graph_node_ids: &'static [&'static str],
}

/// A round-3 prune/update target that boundify must track once the resolving
/// round-3 decision lands (RFC §62.30 削除対象の整理).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round3DeleteTarget {
    /// Repo-relative path of the file/location to prune or update.
    pub path: &'static str,
    /// What exactly is pruned/updated at that location.
    pub description: &'static str,
    /// The round-3 design decision whose implementation resolves this target.
    pub resolved_by: Round3Section,
}

/// The §62.30 I/O boundary table — 8 rows, one per round-3 design decision
/// (62.22–62.29). Each row maps the decision to its consumes / produces /
/// file candidates so graphify / boundify can partition and prune.
pub const ROUND3_IO_BOUNDARY_TABLE: [Round3IoBoundaryRow; 8] = [
    Round3IoBoundaryRow {
        decision: Round3Section::RawSipProductionPath,
        consumes: "pjsip_rx_data.pkt_info.msg / len（PJSIP endpoint 受信）",
        produces: "enqueue_raw_sip_bytes → RAW_SIP_QUEUE → RawSipMessage → subscribe_raw_sip()",
        file_candidates: &[
            "src/ffi/raw_sip_module.rs",
            "src/ffi/callback.rs",
            "src/api/eventbus_receiver.rs",
        ],
        graph_node_ids: &["N0038", "N0080"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::FfiCallbackRegistration,
        consumes: "PJSIP トランスポート / tx / replace / NAT イベント（pjsua_callback フィールド）",
        produces: "NativeEvent（4 種: TransportStateChanged / CallTsxStateChanged / CallReplaced / NatDetected）→ SipEventPayload",
        file_candidates: &["src/ffi/callback.rs", "src/state/m20_native_event_conv.rs"],
        graph_node_ids: &["N0021", "N0038"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::TestBackendRegistrationEvents,
        consumes: "SetRegistration{native_id, enabled}（TestBackend への命令）",
        produces: "NativeEvent::RegistrationStateChanged → reactor",
        file_candidates: &[
            "src/runtime/backend.rs",
            "src/runtime/reactor.rs",
            "src/runtime/registr_wiring.rs",
        ],
        graph_node_ids: &["N0071"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::CallEntryStateTransition,
        consumes: "NativeEvent::CallStateChanged { call_id, state }",
        produces: "CallStateTransition（publish 用 SipEventPayload + 状態更新用 CallState）→ CallEntry.state 更新",
        file_candidates: &["src/state/m20_callstate_mapping.rs", "src/runtime/reactor.rs"],
        graph_node_ids: &["N0045", "N0083"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::CallResumedMechanism,
        consumes: "pjsua_call_media_status（on_call_media_state 由来）",
        produces: "CallResumed(CallResumedInfo{call_id}) / MediaActive",
        file_candidates: &["src/state/m20_native_event_conv.rs", "src/api/event_model_payload_bus.rs"],
        graph_node_ids: &["N0026"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::DtmfSentContract,
        consumes: "SendDtmf{call_id, digits, method}",
        produces: "pjsua_call_send_dtmf / dial_dtmf、500ms 後 DtmfSent{Ok}",
        file_candidates: &["src/runtime/reactor.rs", "src/api/m20_dtmfsent_twophase.rs"],
        graph_node_ids: &["N0029", "N0084"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::TapProductionPath,
        consumes: "conf bridge フレーム（RustMediaPort port ops: get_frame / put_frame）",
        produces: "AudioTapSender::try_push（AudioChunkPair）",
        file_candidates: &[
            "src/runtime/audio_worker.rs",
            "src/runtime/backend.rs",
            "src/api/audio_subscribe_bp.rs",
        ],
        graph_node_ids: &["N0049", "N0085"],
    },
    Round3IoBoundaryRow {
        decision: Round3Section::DocumentationDecisions,
        consumes: "購読 API 呼び出し（subscribe_account / subscribe_raw_sip）",
        produces: "Subscription<T>（recv() / unsubscribe()）",
        file_candidates: &["src/client.rs", "src/api/eventbus_receiver.rs"],
        graph_node_ids: &["N0031", "N0074"],
    },
];

/// The four prune/update targets listed in RFC §62.30.
pub const ROUND3_DELETE_TARGETS: [Round3DeleteTarget; 4] = [
    Round3DeleteTarget {
        path: "src/ffi/callback.rs",
        description: "pjsua_callback.on_rx_msg 前提の stale コメントを pjsip_module 方式（raw_sip_module.rs の on_rx_request / on_rx_response フック）へ更新",
        resolved_by: Round3Section::RawSipProductionPath,
    },
    Round3DeleteTarget {
        path: "src/state/m20_native_event_conv.rs",
        description: "「P1/P2 returns None」という stale doc comment を Some() 化された実挙動（P16-4 §62.13）へ更新",
        resolved_by: Round3Section::FfiCallbackRegistration,
    },
    Round3DeleteTarget {
        path: "src/api/event_model_payload_bus.rs",
        description: "CallResumed の unit variant 参照を CallResumed(CallResumedInfo) ペイロード化（§62.26）",
        resolved_by: Round3Section::CallResumedMechanism,
    },
    Round3DeleteTarget {
        path: "src/api/m20_dtmfsent_twophase.rs",
        description: "DtmfSent の「コールバック優先」記述（§62.15 の該当文）を backend 受理 + 500ms タイムアウト契約（§62.27）へ更新",
        resolved_by: Round3Section::DtmfSentContract,
    },
];

/// The set of graph node IDs referenced by §62.30 — the §61/§62 boundary chain
/// (N0067 / N0068 / N0078 / N0089), every round-3 section node (N0090–N0099),
/// and the per-row references (N0021 / N0026 / N0029 / N0031 / N0038 / N0045 /
/// N0049 / N0071 / N0074 / N0080 / N0083 / N0084 / N0085). Used to catch typo'd
/// node references at test time.
pub fn known_round3_graph_node_ids() -> &'static [&'static str] {
    &[
        "N0067", "N0068", "N0078", "N0089", "N0090", "N0091", "N0092", "N0093", "N0094", "N0095",
        "N0096", "N0097", "N0098", "N0099", "N0021", "N0026", "N0029", "N0031", "N0038", "N0045",
        "N0049", "N0071", "N0074", "N0080", "N0083", "N0084", "N0085",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::io_boundary_round2::{
        ROUND2_DELETE_TARGETS, ROUND2_IO_BOUNDARY_TABLE,
    };

    #[test]
    // @verifies C136 -- precondition: Round 2 I/O boundary reference exists (§62.20)
    // [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
    fn round2_io_boundary_reference_exists() {
        assert_eq!(
            ROUND2_IO_BOUNDARY_TABLE.len(),
            10,
            "round-2 §62.20 table must have 10 rows"
        );
        assert_eq!(
            ROUND2_DELETE_TARGETS.len(),
            3,
            "round-2 §62.20 must list 3 delete targets"
        );
    }

    #[test]
    // @verifies C136 -- postcondition: Round 3 I/O boundaries are listed
    // [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
    fn round3_table_lists_eight_boundaries() {
        assert_eq!(
            ROUND3_IO_BOUNDARY_TABLE.len(),
            8,
            "§62.30 table must have 8 rows"
        );
        for row in &ROUND3_IO_BOUNDARY_TABLE {
            assert!(
                !row.consumes.is_empty(),
                "{} consumes must be non-empty",
                row.decision.section()
            );
            assert!(
                !row.produces.is_empty(),
                "{} produces must be non-empty",
                row.decision.section()
            );
            assert!(
                !row.file_candidates.is_empty(),
                "{} file_candidates must be non-empty",
                row.decision.section()
            );
            assert!(
                !row.graph_node_ids.is_empty(),
                "{} graph_node_ids must be non-empty",
                row.decision.section()
            );
        }
        assert_eq!(
            ROUND3_DELETE_TARGETS.len(),
            4,
            "§62.30 lists exactly 4 prune/update targets"
        );
        for target in &ROUND3_DELETE_TARGETS {
            assert!(
                std::path::Path::new(target.path).exists(),
                "delete target {} must exist",
                target.path
            );
        }
    }

    #[test]
    // @verifies C136 -- invariant: every round-3 decision maps to boundaries
    // [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
    fn every_round3_decision_maps_to_boundaries() {
        let decisions: Vec<Round3Section> = ROUND3_IO_BOUNDARY_TABLE
            .iter()
            .map(|row| row.decision)
            .collect();
        for row in &ROUND3_IO_BOUNDARY_TABLE {
            assert!(
                !row.consumes.is_empty(),
                "{} consumes must be non-empty",
                row.decision.section()
            );
            assert!(
                !row.produces.is_empty(),
                "{} produces must be non-empty",
                row.decision.section()
            );
            assert!(
                !row.file_candidates.is_empty(),
                "{} file_candidates must be non-empty",
                row.decision.section()
            );
        }
        for target in &ROUND3_DELETE_TARGETS {
            assert!(
                decisions.contains(&target.resolved_by),
                "delete target {} resolved_by {} must appear in table",
                target.path,
                target.resolved_by.section()
            );
        }
    }

    #[test]
    // @verifies C136 -- boundary: table covers exactly 62.22..62.29
    // [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
    fn round3_table_covers_62_22_to_62_29_only() {
        let sections: Vec<&str> = ROUND3_IO_BOUNDARY_TABLE
            .iter()
            .map(|row| row.decision.section())
            .collect();
        assert_eq!(sections.len(), 8, "table must have 8 rows");
        for n in 22..=29 {
            let sec = format!("62.{n}");
            assert_eq!(
                sections.iter().filter(|s| **s == sec).count(),
                1,
                "{sec} must appear exactly once"
            );
        }
        assert!(
            !sections.contains(&"62.21"),
            "62.21 must not be a row (root-cause container)"
        );
        assert!(
            !sections.contains(&"62.30"),
            "62.30 itself must not be a row (container)"
        );
    }

    #[test]
    // @verifies C136 -- invariant: graph_node_ids all in known set
    // [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
    fn round3_known_nodes_include_boundary_chain() {
        let known = known_round3_graph_node_ids();
        assert!(known.contains(&"N0068"), "§62 parent N0068 must be known");
        assert!(known.contains(&"N0078"), "§62.9 node N0078 must be known");
        assert!(
            known.contains(&"N0089"),
            "§62.20 round-2 node N0089 must be known"
        );
        for row in &ROUND3_IO_BOUNDARY_TABLE {
            for node in row.graph_node_ids {
                assert!(
                    known.contains(node),
                    "unknown graph node {node} in section {}",
                    row.decision.section()
                );
            }
        }
    }

    #[test]
    // @verifies C136 -- source consistency: prune/update targets resolved
    // [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
    fn round3_delete_targets_source_consistency() -> Result<(), std::io::Error> {
        assert!(
            std::path::Path::new("src/ffi/raw_sip_module.rs").exists(),
            "raw_sip_module.rs must exist (P17-2 §62.22)"
        );
        let callback = std::fs::read_to_string("src/ffi/callback.rs")?;
        assert!(
            callback.contains("pjsip_module"),
            "callback.rs must reference pjsip_module approach"
        );
        let native_conv = std::fs::read_to_string("src/state/m20_native_event_conv.rs")?;
        assert!(
            native_conv.contains("Some(SipEventPayload)"),
            "m20_native_event_conv must reflect Some() behavior"
        );
        let payload_bus = std::fs::read_to_string("src/api/event_model_payload_bus.rs")?;
        assert!(
            payload_bus.contains("CallResumed(CallResumedInfo)"),
            "CallResumed must be payload-ized"
        );
        let dtmf = std::fs::read_to_string("src/api/m20_dtmfsent_twophase.rs")?;
        assert!(
            dtmf.contains("timeout"),
            "DtmfSent must document timeout contract"
        );
        Ok(())
    }
}
