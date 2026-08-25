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
//   - NODE_ID=N0068:  §62 実装整合設計 — RESIDUE 解消のための設計判断確定
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0068 --hops=2)
//   - NODE_ID=N0069:  62.0 進化スコープと根因
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0069 --hops=2)
//   - NODE_ID=N0078:  62.9 I/O 境界参照情報（graphify / boundify 用）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0078 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================


/// Identifier for each §62 design decision (62.1–62.8).
///
/// Every value names one decision that resolves a RESIDUE root cause; the
/// `section()` / `label()` methods mirror the RFC §62 headings so that other
/// tickets and graphify/boundify can reference decisions by their stable id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesignDecisionId {
    /// 62.1 Config unification — promote RFC §10 ClientConfig.
    ConfigUnification,
    /// 62.2 Backend selection — PjsuaBackend full unification, MockBackend deletion.
    BackendSelection,
    /// 62.3 Event bus unification — single EventBus owned by SipClient.
    EventBusUnification,
    /// 62.4 Registration state machine production wiring.
    RegistrationWiring,
    /// 62.5 Call API expansion — answer/hangup/hold/transfer/send_dtmf/call_state(call_id).
    CallApiExpansion,
    /// 62.6 Media path architecture — per-call AudioMixer, ChannelSelector injection.
    MediaPathArchitecture,
    /// 62.7 Shutdown wiring — ShutdownSpec.execute_sequence production wiring.
    ShutdownWiring,
    /// 62.8 Error conversion — SipError native_status preservation.
    ErrorNativeStatus,
}

// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
impl DesignDecisionId {
    /// RFC §62 subsection number (e.g. "62.1").
    pub fn section(self) -> &'static str {
        match self {
            DesignDecisionId::ConfigUnification => "62.1",
            DesignDecisionId::BackendSelection => "62.2",
            DesignDecisionId::EventBusUnification => "62.3",
            DesignDecisionId::RegistrationWiring => "62.4",
            DesignDecisionId::CallApiExpansion => "62.5",
            DesignDecisionId::MediaPathArchitecture => "62.6",
            DesignDecisionId::ShutdownWiring => "62.7",
            DesignDecisionId::ErrorNativeStatus => "62.8",
        }
    }

    /// Full RFC §62 heading used by the §62.9 I/O boundary reference table.
    pub fn label(self) -> &'static str {
        match self {
            DesignDecisionId::ConfigUnification => {
                "62.1 公開設定 API の一本化（ClientConfig / STUN/TURN/ICE）"
            }
            DesignDecisionId::BackendSelection => {
                "62.2 バックエンド選択機構（PjsuaBackend 完全統一・MockBackend 削除）"
            }
            DesignDecisionId::EventBusUnification => "62.3 イベントバス一元化トポロジ",
            DesignDecisionId::RegistrationWiring => "62.4 登録状態機械の production 配線",
            DesignDecisionId::CallApiExpansion => "62.5 公開 API 拡充（通話 API 群）",
            DesignDecisionId::MediaPathArchitecture => "62.6 メディア経路アーキテクチャと統一音声注入",
            DesignDecisionId::ShutdownWiring => "62.7 シャットダウン手順の production 配線",
            DesignDecisionId::ErrorNativeStatus => "62.8 エラー変換の native_status 保持",
        }
    }
}

/// One RESIDUE divergence root cause (RFC §62.0).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResidueRootCause {
    /// Short stable identifier (R1..R3).
    pub id: &'static str,
    /// One-line title of the root cause.
    pub title: &'static str,
    /// Concrete source location that proves the root cause exists today.
    pub evidence: &'static str,
    /// RFC section / graph node that defines the expected (correct) design.
    pub rfc_ref: &'static str,
    /// §62 design decision that resolves this root cause.
    pub resolution_section: DesignDecisionId,
}

/// The three RESIDUE root causes in RFC §62.0 order.
pub const RESIDUE_ROOT_CAUSES: [ResidueRootCause; 3] = [
    ResidueRootCause {
        id: "R1",
        title: "public ClientConfig is not RFC-typed",
        evidence: "src/config.rs:141 ClientConfig; turn_server: Option<StunServerConfig> (TURN-as-STUN type bug)",
        rfc_ref: "§10 ClientConfig Full Specification / N0013",
        resolution_section: DesignDecisionId::ConfigUnification,
    },
    ResidueRootCause {
        id: "R2",
        title: "backend is Mock-fixed",
        evidence: "src/runtime/reactor.rs:74-75 Box::new(MockBackend::new()) unconditional",
        rfc_ref: "§62.0",
        resolution_section: DesignDecisionId::BackendSelection,
    },
    ResidueRootCause {
        id: "R3",
        title: "event bus split between client and reactor",
        evidence: "src/client.rs:111 and src/runtime/reactor.rs:88-96 create separate EventBus instances",
        rfc_ref: "§62.0",
        resolution_section: DesignDecisionId::EventBusUnification,
    },
];

/// One row of the §62.9 I/O boundary reference table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IoBoundaryRow {
    /// The design decision whose I/O boundary this row describes.
    pub decision: DesignDecisionId,
    /// Inputs (consumes) at the boundary.
    pub consumes: &'static str,
    /// Outputs (produces) at the boundary.
    pub produces: &'static str,
    /// Related RFC graph node IDs that constrain the boundary.
    pub graph_node_ids: &'static [&'static str],
}

/// The §62.9 I/O boundary table — 8 rows, one per design decision (62.1–62.8).
pub const IO_BOUNDARY_TABLE: [IoBoundaryRow; 8] = [
    IoBoundaryRow {
        decision: DesignDecisionId::ConfigUnification,
        consumes: "ClientConfig 全フィールド（§10）",
        produces: "SipClient::new の検証結果、EventBus 初期化",
        graph_node_ids: &["N0013", "N0015"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::BackendSelection,
        consumes: "RuntimeCommand 群",
        produces: "NativeEvent 群（PjsuaBackend）",
        graph_node_ids: &["N0011", "N0008"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::EventBusUnification,
        consumes: "reactor 内部 SipEvent",
        produces: "3 種の subscribe receiver",
        graph_node_ids: &["N0018", "N0020"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::RegistrationWiring,
        consumes: "NativeEvent::RegistrationStateChanged",
        produces: "SipEventPayload::RegistrationStateChanged",
        graph_node_ids: &["N0023", "N0025"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::CallApiExpansion,
        consumes: "CallId + パラメータ",
        produces: "RuntimeCommand submit、CallState / Vec<CallEntry>",
        graph_node_ids: &["N0011", "N0027", "N0028"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::MediaPathArchitecture,
        consumes: "AddAudioSource / SubscribeAudio",
        produces: "AudioChunkPair、conf port 送話フレーム",
        graph_node_ids: &["N0031", "N0033", "N0034"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::ShutdownWiring,
        consumes: "RuntimeCommand::Shutdown",
        produces: "ClientShutdown、is_terminated",
        graph_node_ids: &["N0043", "N0044"],
    },
    IoBoundaryRow {
        decision: DesignDecisionId::ErrorNativeStatus,
        consumes: "pjsip_status_code",
        produces: "SipError { native_status }",
        graph_node_ids: &["N0016", "N0017"],
    },
];

/// A legacy location that boundify must prune once its resolving decision lands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeleteTarget {
    /// Repo-relative path of the file/location to delete.
    pub path: &'static str,
    /// What exactly is deleted at that location.
    pub description: &'static str,
    /// The design decision whose implementation makes this target deletable.
    pub resolved_by: DesignDecisionId,
}

/// The three delete targets listed in RFC §62.9.
pub const DELETE_TARGETS: [DeleteTarget; 3] = [
    DeleteTarget {
        path: "src/config.rs",
        description: "old ClientConfig / StunServerConfig / ClientConfigBuilder",
        resolved_by: DesignDecisionId::ConfigUnification,
    },
    DeleteTarget {
        path: "src/runtime/backend.rs",
        description: "MockBackend production implementation",
        resolved_by: DesignDecisionId::BackendSelection,
    },
    DeleteTarget {
        path: "src/runtime/reactor.rs",
        description: "unconditional MockBackend creation at 74-75",
        resolved_by: DesignDecisionId::BackendSelection,
    },
];

/// Prescribed order for completing the breaking changes in the v0.x phase.
pub const BREAKING_CHANGE_ORDER: [DesignDecisionId; 8] = [
    DesignDecisionId::ConfigUnification,
    DesignDecisionId::BackendSelection,
    DesignDecisionId::EventBusUnification,
    DesignDecisionId::RegistrationWiring,
    DesignDecisionId::CallApiExpansion,
    DesignDecisionId::MediaPathArchitecture,
    DesignDecisionId::ShutdownWiring,
    DesignDecisionId::ErrorNativeStatus,
];

/// The set of graph node IDs referenced by §62.9 (including the §61 boundary
/// reference node N0067); used to catch typo'd node references at test time.
pub fn known_graph_node_ids() -> &'static [&'static str] {
    &[
        "N0008", "N0011", "N0013", "N0015", "N0016", "N0017", "N0018",
        "N0020", "N0023", "N0025", "N0027", "N0028", "N0031", "N0033",
        "N0034", "N0043", "N0044", "N0067",
    ]
}

/// The breaking-change order as a slice (convenience for iteration).
pub fn breaking_change_order() -> &'static [DesignDecisionId; 8] {
    &BREAKING_CHANGE_ORDER
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C069  -- precondition: §62 進化スコープが定義される
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn residue_root_causes_are_defined() {
        assert_eq!(RESIDUE_ROOT_CAUSES.len(), 3, "must cover exactly the 3 RFC §62.0 root causes");
        let mut ids: Vec<&str> = RESIDUE_ROOT_CAUSES.iter().map(|r| r.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 3, "root cause ids must be unique");
        for cause in &RESIDUE_ROOT_CAUSES {
            assert!(!cause.title.is_empty());
            assert!(!cause.evidence.is_empty());
            assert!(!cause.rfc_ref.is_empty());
        }
    }

    #[test]
    // @verifies C069  -- postcondition: 62.0 が §62 の一部として記述される
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn root_cause_data_is_part_of_module() {
        let r1 = &RESIDUE_ROOT_CAUSES[0];
        assert_eq!(r1.id, "R1", "first root cause id must be R1");
        assert!(r1.evidence.contains("src/config.rs"), "R1 evidence must point at the legacy config");
        assert!(r1.title.contains("ClientConfig"), "R1 title must name ClientConfig");
    }

    #[test]
    // @verifies C069  -- invariant: 根因3点の記述は §62 の他の節と整合する
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn root_causes_resolve_to_existing_design_decisions() {
        let decisions: Vec<DesignDecisionId> =
            IO_BOUNDARY_TABLE.iter().map(|row| row.decision).collect();
        for cause in &RESIDUE_ROOT_CAUSES {
            assert!(
                decisions.contains(&cause.resolution_section),
                "root cause {} resolution {} missing from IO_BOUNDARY_TABLE",
                cause.id,
                cause.resolution_section.section()
            );
        }
    }

    #[test]
    // @verifies C078  -- precondition: §62 親セクションが存在する
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn io_boundary_table_covers_all_sections() {
        assert_eq!(IO_BOUNDARY_TABLE.len(), 8, "§62.9 table has exactly 8 design decisions");
        let decisions: Vec<DesignDecisionId> =
            IO_BOUNDARY_TABLE.iter().map(|row| row.decision).collect();
        for step in breaking_change_order() {
            assert!(decisions.contains(step), "section {} must be present in IO_BOUNDARY_TABLE", step.section());
        }
    }

    #[test]
    // @verifies C078  -- postcondition: 62.9 が §62 の一部として記述される
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn io_boundary_rows_have_consumes_and_produces() {
        for row in &IO_BOUNDARY_TABLE {
            assert!(!row.consumes.is_empty(), "{} consumes must be non-empty", row.decision.section());
            assert!(!row.produces.is_empty(), "{} produces must be non-empty", row.decision.section());
        }
    }

    #[test]
    // @verifies C078  -- invariant: I/O 境界参照は §61 の情報と整合する
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn io_boundary_graph_nodes_are_known() {
        let known = known_graph_node_ids();
        for row in &IO_BOUNDARY_TABLE {
            for node in row.graph_node_ids {
                assert!(known.contains(node), "unknown graph node {node} in section {}", row.decision.section());
            }
        }
    }

    #[test]
    // @verifies C079  -- precondition: 進化スコープが設定乖離を言及する
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn r1_mentions_config_divergence() {
        let r1 = &RESIDUE_ROOT_CAUSES[0];
        assert!(r1.evidence.contains("config.rs"), "R1 evidence must mention the legacy config file");
        assert!(r1.evidence.contains("turn_server"), "R1 evidence must mention the turn_server type bug");
    }

    #[test]
    // @verifies C079  -- postcondition: 62.0 が N0013 の乖離を参照する
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn r1_references_n0013_divergence() {
        let r1 = &RESIDUE_ROOT_CAUSES[0];
        assert!(r1.rfc_ref.contains("N0013") || r1.rfc_ref.contains("§10"), "R1 rfc_ref must reference the ClientConfig spec node");
    }

    #[test]
    // @verifies C079  -- invariant: 公開 ClientConfig が RFC 型でない根因が記述される
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn r1_describes_turn_server_type_bug() {
        let r1 = &RESIDUE_ROOT_CAUSES[0];
        assert!(r1.evidence.contains("turn_server: Option<StunServerConfig>"), "R1 must record the TURN-as-STUN type bug");
        assert!(r1.title.contains("ClientConfig"), "R1 title must name the public ClientConfig");
    }

    #[test]
    // @verifies C090  -- precondition: N0067 が §61 I/O 境界参照情報を定義する
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn known_nodes_include_section61_and_clientconfig() {
        let known = known_graph_node_ids();
        assert!(known.contains(&"N0067"), "§61 I/O boundary reference node N0067 must be known");
        assert!(known.contains(&"N0013"), "ClientConfig spec node N0013 must be known");
    }

    #[test]
    // @verifies C090  -- postcondition: 62.9 が各設計判断の I/O 境界を参照可能にする
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn delete_targets_reference_real_files() {
        assert_eq!(DELETE_TARGETS.len(), 3, "§62.9 lists exactly 3 delete targets");
        for target in &DELETE_TARGETS {
            assert!(std::path::Path::new(target.path).exists(), "delete target {} must exist on disk", target.path);
        }
    }

    #[test]
    // @verifies C090  -- invariant: 分割判断が既存の境界情報と矛盾しない
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
    fn breaking_change_order_is_complete_and_unique() {
        let order = breaking_change_order();
        assert_eq!(order.len(), 8, "breaking change order covers sections 62.1..62.8");
        let mut sections: Vec<&str> = order.iter().map(|d| d.section()).collect();
        sections.sort_unstable();
        sections.dedup();
        assert_eq!(sections.len(), 8, "sections must not repeat");
    }

    #[test]
    // @verifies C069 @verifies C078 @verifies C079 @verifies C090  -- source consistency
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn evidence_matches_actual_source() -> Result<(), std::io::Error> {
        // R1 (ConfigUnification) is resolved by P15-2: the legacy config.rs
        // ClientConfig and the TURN-as-STUN type bug are gone, and config.rs
        // re-exports the RFC §10 ClientConfig.
        let config_src = std::fs::read_to_string("src/config.rs")?;
        assert!(
            !config_src.contains("turn_server: Option<StunServerConfig>"),
            "R1 resolved: legacy turn_server type bug must be gone from config.rs"
        );
        assert!(
            !config_src.contains("pub struct ClientConfig"),
            "R1 resolved: config.rs must not define a legacy ClientConfig"
        );
        assert!(
            config_src.contains("pub use client_config_spec::"),
            "R1 resolved: config.rs must re-export the RFC ClientConfig"
        );
        // R2 / R3 are still open (P15-3 / P15-4): MockBackend and the
        // split EventBus remain in the source tree.
        let reactor_src = std::fs::read_to_string("src/runtime/reactor.rs")?;
        assert!(reactor_src.contains("MockBackend::new()"), "R2 still open: reactor.rs must still create MockBackend unconditionally");
        let client_src = std::fs::read_to_string("src/client.rs")?;
        assert!(client_src.contains("EventBus::new"), "R3 still open: client.rs must still create its own EventBus");
        Ok(())
    }
}
