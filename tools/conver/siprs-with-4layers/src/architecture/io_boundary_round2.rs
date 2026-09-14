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
//   - NODE_ID=N0089:  62.20 I/O 境界参照情報
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0089 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::architecture::round2_scope_rootcause::Round2Section;

/// One row of the §62.20 round-2 I/O boundary reference table.
///
/// Each row describes one design decision's I/O boundary so that graphify /
/// boundify can make split and prune decisions without reading the RFC prose.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round2IoBoundaryRow {
    /// The round-2 design decision whose I/O boundary this row describes.
    pub decision: Round2Section,
    /// Inputs (consumes) at the boundary.
    pub consumes: &'static str,
    /// Outputs (produces) at the boundary.
    pub produces: &'static str,
    /// File/module candidates that graphify / boundify inspect for this boundary.
    pub file_candidates: &'static [&'static str],
    /// Related RFC graph node IDs that constrain the boundary.
    pub graph_node_ids: &'static [&'static str],
}

/// A round-2 legacy location that boundify must prune once its resolving
/// decision lands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round2DeleteTarget {
    /// Repo-relative path of the file/location to delete.
    pub path: &'static str,
    /// What exactly is deleted at that location.
    pub description: &'static str,
    /// The round-2 design decision whose implementation makes this target
    /// deletable.
    pub resolved_by: Round2Section,
}

/// The §62.20 I/O boundary table — 10 rows for the round-2 design decisions
/// (62.11–62.19). Section 62.11 contributes two rows (transport creation wiring
/// and the bindgen alignment policy); sections 62.12–62.19 contribute one row
/// each.
pub const ROUND2_IO_BOUNDARY_TABLE: [Round2IoBoundaryRow; 10] = [
    Round2IoBoundaryRow {
        decision: Round2Section::TransportWiring,
        consumes: "ClientConfig.transports（§12）",
        produces: "pjsua_transport_id 一覧、transport_create",
        file_candidates: &["backend.rs", "backend_calls.rs", "transport wiring"],
        graph_node_ids: &["N0015", "N0037"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::TransportWiring,
        consumes: "bindgen allowlist + コード期待",
        produces: "pjsua_config / pjsua_acc_config / 定数・enum の解決",
        file_candidates: &["build.rs", "ffi 層"],
        graph_node_ids: &["N0015", "N0037"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::RegistrationLifecycle,
        consumes: "AccountConfig.register_on_start / RemoveAccount",
        produces: "set_registration / AccountRemoved / RegistrationStateChanged",
        file_candidates: &["reactor.rs", "registr_wiring.rs"],
        graph_node_ids: &["N0025", "N0073"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::EventPathCompletion,
        consumes: "FFI lock-free キュー / on_rx_msg",
        produces: "NativeEvent → SipEventPayload、RawSipMessage",
        file_candidates: &["callback.rs", "m20_native_event_conv.rs", "raw sip"],
        graph_node_ids: &["N0018", "N0037"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::IncomingCallEvents,
        consumes: "IncomingCall / Answer{call_id, code}",
        produces: "ClientState.calls 登録、CallConnected / CallDisconnected",
        file_candidates: &["reactor.rs", "m20_callstate_mapping.rs"],
        graph_node_ids: &["N0022", "N0027", "N0048"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::DtmfUnification,
        consumes: "SendDtmf{call_id, digits, method}",
        produces: "pjsua_call_send_dtmf / dial_dtmf、DtmfSent",
        file_candidates: &["dtmf_spec.rs", "m20_dtmfsent_twophase.rs"],
        graph_node_ids: &["N0028", "N0029"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::MediaPathCompletion,
        consumes: "conf port フレーム / out_queue / in_queue",
        produces: "AudioTapSender::push、RTP 送受信、WAV ファイル",
        file_candidates: &["backend.rs", "audio_worker.rs", "wav ユーティリティ"],
        graph_node_ids: &["N0033", "N0049"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::StunTurnIceWiring,
        consumes: "stun_servers / turn_servers / ice（§13）",
        produces: "pjsua_config.stun_srv / turn_cfg_*、ICE 設定",
        file_candidates: &["backend_calls.rs", "coturn 統合テスト"],
        graph_node_ids: &["N0015", "N0070"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::Examples,
        consumes: "CLI 引数 + API 引数",
        produces: "イベント受信、終了コード",
        file_candidates: &["examples/common/cli.rs", "client.rs", "E1-E5"],
        graph_node_ids: &["N0050"],
    },
    Round2IoBoundaryRow {
        decision: Round2Section::DockerAsteriskBase,
        consumes: "docker 可用性 + Asterisk/coturn 設定",
        produces: "統合テスト結果（PASS / SKIPPED）",
        file_candidates: &["tests/sip_integration.rs", "docker-compose.yml", "Makefile"],
        graph_node_ids: &["N0052", "N0054"],
    },
];

/// The three delete targets listed in RFC §62.20.
pub const ROUND2_DELETE_TARGETS: [Round2DeleteTarget; 3] = [
    Round2DeleteTarget {
        path: "src/state/reg_account_lifecycle.rs",
        description: "RegistrationSucceeded / RegistrationFailed を参照する dead code（登録結果は RegistrationStateChanged に統一）",
        resolved_by: Round2Section::RegistrationLifecycle,
    },
    Round2DeleteTarget {
        path: "src/api/event_model_payload_bus.rs",
        description: "CallRejected を publish する経路（reject は CallDisconnected として観測）",
        resolved_by: Round2Section::IncomingCallEvents,
    },
    Round2DeleteTarget {
        path: "src/config/account_config_spec.rs",
        description: "DtmfMethod の重複定義（account_config_spec.rs / observability_metrics.rs の旧バリアント; src/model/dtmf_spec.rs が単一定義）",
        resolved_by: Round2Section::DtmfUnification,
    },
];

/// The set of graph node IDs referenced by §62.20 (including the §61 boundary
/// reference node N0067, the §62.9 node N0078, the §62 parent N0068, and every
/// round-2 section node N0080–N0089); used to catch typo'd node references at
/// test time.
pub fn known_round2_graph_node_ids() -> &'static [&'static str] {
    &[
        "N0067", "N0068", "N0070", "N0073", "N0078", "N0080", "N0081", "N0082", "N0083", "N0084",
        "N0085", "N0086", "N0087", "N0088", "N0089", "N0015", "N0018", "N0022", "N0025", "N0027",
        "N0028", "N0029", "N0033", "N0037", "N0048", "N0049", "N0050", "N0052", "N0054",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::impl_integration_design::IO_BOUNDARY_TABLE;

    #[test]
    // @verifies C119 -- precondition: §62 親セクションが存在する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round1_io_boundary_table_exists() {
        assert_eq!(
            IO_BOUNDARY_TABLE.len(),
            8,
            "round-1 §62.9 (N0078) table must have 8 rows"
        );
    }

    #[test]
    // @verifies C119 -- postcondition: 62.20 がラウンド 2 の I/O 境界を定義する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round2_table_has_ten_rows_with_concrete_boundaries() {
        assert_eq!(
            ROUND2_IO_BOUNDARY_TABLE.len(),
            10,
            "§62.20 table must have 10 rows"
        );
        for row in &ROUND2_IO_BOUNDARY_TABLE {
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
    }

    #[test]
    // @verifies C119 -- postcondition: 62.20 が削除対象を定義する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round2_delete_targets_are_defined_and_exist() {
        assert_eq!(
            ROUND2_DELETE_TARGETS.len(),
            3,
            "§62.20 lists exactly 3 delete targets"
        );
        for target in &ROUND2_DELETE_TARGETS {
            assert!(
                std::path::Path::new(target.path).exists(),
                "delete target {} must exist",
                target.path
            );
        }
    }

    #[test]
    // @verifies C119 -- invariant: I/O 境界は §61/§62.9 と整合する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round2_known_nodes_include_section61_and_62_9() {
        let known = known_round2_graph_node_ids();
        assert!(known.contains(&"N0067"), "§61 node N0067 must be known");
        assert!(known.contains(&"N0078"), "§62.9 node N0078 must be known");
        assert!(
            known.contains(&"N0068"),
            "§62 parent node N0068 must be known"
        );
        for row in &ROUND2_IO_BOUNDARY_TABLE {
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
    // @verifies C120 -- precondition: N0078 が 62.9 I/O 境界を定義する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round1_io_boundary_table_is_available() {
        assert!(
            !IO_BOUNDARY_TABLE.is_empty(),
            "round-1 §62.9 I/O boundary table must be defined"
        );
    }

    #[test]
    // @verifies C120 -- postcondition: 62.20 がラウンド 2 の I/O 境界を参照する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round2_table_covers_62_11_to_62_19_only() {
        let sections: Vec<&str> = ROUND2_IO_BOUNDARY_TABLE
            .iter()
            .map(|row| row.decision.section())
            .collect();
        assert_eq!(sections.len(), 10, "table must have 10 rows");
        assert_eq!(
            sections.iter().filter(|s| **s == "62.11").count(),
            2,
            "62.11 has 2 rows (transport + bindgen)"
        );
        for n in 12..=19 {
            let sec = format!("62.{n}");
            assert_eq!(
                sections.iter().filter(|s| **s == sec).count(),
                1,
                "{sec} must appear exactly once"
            );
        }
        assert!(
            !sections.contains(&"62.20"),
            "62.20 itself must not be a row (container)"
        );
    }

    #[test]
    // @verifies C120 -- invariant: graphify/boundify が分割判断に使用する
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn delete_targets_resolve_to_table_rows() {
        let decisions: Vec<Round2Section> = ROUND2_IO_BOUNDARY_TABLE
            .iter()
            .map(|row| row.decision)
            .collect();
        for target in &ROUND2_DELETE_TARGETS {
            assert!(
                decisions.contains(&target.resolved_by),
                "delete target {} resolved_by {} must appear in table",
                target.path,
                target.resolved_by.section()
            );
        }
    }

    #[test]
    // @verifies C119 @verifies C120 -- source consistency
    // [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
    fn round2_delete_targets_source_consistency() -> Result<(), std::io::Error> {
        let payload_bus = std::fs::read_to_string("src/api/event_model_payload_bus.rs")?;
        assert!(
            !payload_bus.contains("CallRejected"),
            "CallRejected must be removed from payload bus"
        );
        let model_dtmf = std::fs::read_to_string("src/model/dtmf_spec.rs")?;
        assert!(
            model_dtmf.contains("pub enum DtmfMethod"),
            "dtmf_spec.rs must define DtmfMethod"
        );
        let account_spec = std::fs::read_to_string("src/config/account_config_spec.rs")?;
        assert!(
            !account_spec.contains("pub enum DtmfMethod"),
            "account_config_spec.rs must not define DtmfMethod"
        );
        let obs_metrics = std::fs::read_to_string("src/config/observability_metrics.rs")?;
        assert!(
            !obs_metrics.contains("pub enum DtmfMethod"),
            "observability_metrics.rs must not define DtmfMethod"
        );
        Ok(())
    }
}
