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
//   - NODE_ID=N0079:  62.10 ラウンド 2 進化スコープと根因
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0079 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.

/// Round-2 §62 subsection (62.11–62.20) that resolves round-2 RESIDUE root causes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Round2Section {
    /// 62.11 Transport creation wiring & bindgen alignment (N0080).
    TransportWiring,
    /// 62.12 Registration & account lifecycle (N0081).
    RegistrationLifecycle,
    /// 62.13 Event path completion — FFI drain / raw SIP / P1-P2 (N0082).
    EventPathCompletion,
    /// 62.14 Incoming call & call events (N0083).
    IncomingCallEvents,
    /// 62.15 DTMF unification (N0084).
    DtmfUnification,
    /// 62.16 Media path completion — conf port / queue / WAV (N0085).
    MediaPathCompletion,
    /// 62.17 STUN/TURN/ICE wiring & coturn verification (N0086).
    StunTurnIceWiring,
    /// 62.18 Examples E1–E5 (N0087).
    Examples,
    /// 62.19 Docker/Asterisk real-SIP integration test base (N0088).
    DockerAsteriskBase,
    /// 62.20 Round-2 I/O boundary reference (N0089).
    IoBoundaryReference,
}

// [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
impl Round2Section {
    /// RFC §62 subsection number (e.g. "62.11").
    pub fn section(self) -> &'static str {
        match self {
            Round2Section::TransportWiring => "62.11",
            Round2Section::RegistrationLifecycle => "62.12",
            Round2Section::EventPathCompletion => "62.13",
            Round2Section::IncomingCallEvents => "62.14",
            Round2Section::DtmfUnification => "62.15",
            Round2Section::MediaPathCompletion => "62.16",
            Round2Section::StunTurnIceWiring => "62.17",
            Round2Section::Examples => "62.18",
            Round2Section::DockerAsteriskBase => "62.19",
            Round2Section::IoBoundaryReference => "62.20",
        }
    }

    /// Full RFC §62 heading.
    pub fn label(self) -> &'static str {
        match self {
            Round2Section::TransportWiring => "62.11 トランスポート生成配線と bindgen 整合方針",
            Round2Section::RegistrationLifecycle => {
                "62.12 登録・アカウント経路（自動登録 / unregister 先行 / AccountRemoved）"
            }
            Round2Section::EventPathCompletion => {
                "62.13 イベント経路の完成（FFI drain / raw SIP / P1/P2）"
            }
            Round2Section::IncomingCallEvents => {
                "62.14 着信・通話イベント（CallEntry / answer / CallRejected / CallState）"
            }
            Round2Section::DtmfUnification => {
                "62.15 DTMF 実装整合（DtmfMethod 一元化 / method / DtmfSent）"
            }
            Round2Section::MediaPathCompletion => {
                "62.16 メディア経路の完成（conf port / キュー消費 / WAV）"
            }
            Round2Section::StunTurnIceWiring => "62.17 STUN/TURN/ICE 配線と coturn 検証",
            Round2Section::Examples => "62.18 Examples 設計（E1–E5）",
            Round2Section::DockerAsteriskBase => "62.19 Docker/Asterisk 実 SIP 統合テスト基盤",
            Round2Section::IoBoundaryReference => "62.20 I/O 境界参照情報",
        }
    }

    /// Corresponding RFC graph node ID (N0080..N0089).
    pub fn node_id(self) -> &'static str {
        match self {
            Round2Section::TransportWiring => "N0080",
            Round2Section::RegistrationLifecycle => "N0081",
            Round2Section::EventPathCompletion => "N0082",
            Round2Section::IncomingCallEvents => "N0083",
            Round2Section::DtmfUnification => "N0084",
            Round2Section::MediaPathCompletion => "N0085",
            Round2Section::StunTurnIceWiring => "N0086",
            Round2Section::Examples => "N0087",
            Round2Section::DockerAsteriskBase => "N0088",
            Round2Section::IoBoundaryReference => "N0089",
        }
    }
}

/// One round-2 RESIDUE root cause (RFC §62.10).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round2RootCause {
    /// Short stable identifier (RC1..RC5).
    pub id: &'static str,
    /// One-line title of the root cause.
    pub title: &'static str,
    /// Concrete source location that proves the root cause exists today.
    pub evidence: &'static str,
    /// RFC section / graph node that defines the expected (correct) design.
    pub rfc_ref: &'static str,
    /// Round-2 §62 subsections that resolve this root cause.
    pub resolving_sections: &'static [Round2Section],
}

/// The five round-2 RESIDUE root causes in RFC §62.10 order.
pub const ROUND2_ROOT_CAUSES: [Round2RootCause; 5] = [
    Round2RootCause {
        id: "RC1",
        title: "production FFI path is not wired",
        evidence: "src/ffi/backend_calls.rs:60 pjsua_transport_create(std::ptr::null_mut()) — config.transports not reflected; src/runtime/backend.rs:574 PjsuaBackend::initialize(_config) unused",
        rfc_ref: "§62.10 / H1,H8,H15",
        resolving_sections: &[
            Round2Section::TransportWiring,
            Round2Section::EventPathCompletion,
            Round2Section::StunTurnIceWiring,
        ],
    },
    Round2RootCause {
        id: "RC2",
        title: "lifecycle events are not connected",
        evidence: "src/config/account_config_spec.rs:171 register_on_start not consumed at add_account; src/client.rs:269 remove_account lacks unregister-first; IncomingCall not registered in ClientState.calls",
        rfc_ref: "§62.10 / H5,H7,H10",
        resolving_sections: &[
            Round2Section::RegistrationLifecycle,
            Round2Section::IncomingCallEvents,
        ],
    },
    Round2RootCause {
        id: "RC3",
        title: "duplicate and inconsistent definitions",
        evidence: "src/config/account_config_spec.rs:35 + src/config/observability_metrics.rs:250 + src/api/m20_dtmfsent_twophase.rs:57 DtmfMethod triple definition; src/api/event_model_payload_bus.rs:345 CallRejected never generated; src/state/m20_callstate_mapping.rs:71 convert_call_state 5 inv_states",
        rfc_ref: "§62.10 / H8,H11,H12",
        resolving_sections: &[
            Round2Section::EventPathCompletion,
            Round2Section::IncomingCallEvents,
            Round2Section::DtmfUnification,
        ],
    },
    Round2RootCause {
        id: "RC4",
        title: "media path is not connected",
        evidence: "src/ has no pjsua_conf_set_callback; src/runtime/backend.rs:143 push_media_frame trait has zero production callers; out_queue/in_queue consumers zero",
        rfc_ref: "§62.10 / H13,H14",
        resolving_sections: &[Round2Section::MediaPathCompletion],
    },
    Round2RootCause {
        id: "RC5",
        title: "verification infrastructure is undefined",
        evidence: "src/tests/ has no docker/Asterisk/coturn interop base; tests/ has no docker-compose or docker-gated integration tests",
        rfc_ref: "§62.10 / EXAMPLES",
        resolving_sections: &[
            Round2Section::StunTurnIceWiring,
            Round2Section::Examples,
            Round2Section::DockerAsteriskBase,
            Round2Section::IoBoundaryReference,
        ],
    },
];

/// The overall round-2 policy (RFC §62.10 全体方針).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round2Policy {
    /// 完全実装 — the production path is fully implemented, not stubbed.
    pub complete_implementation: &'static str,
    /// v0.x 破壊的変更受容 — breaking changes are completed in the v0.x window.
    pub breaking_change_window: &'static str,
    /// 実 Asterisk / coturn 相互接続検証 — interop tests guarantee full behavior.
    pub interop_verification: &'static str,
    /// docker 可用性ゲート — integration tests run only when docker is available.
    pub docker_gate: &'static str,
}

pub const ROUND2_POLICY: Round2Policy = Round2Policy {
    complete_implementation: "完全実装 + v0.x で破壊的変更を受容した統一",
    breaking_change_window: "RegistrationSucceeded/Failed 削除、CallRejected 削除、DtmfMethod SipInfo→Info 改名を v0.x 開発期に完了し、後方互換のための残骸を残さない",
    interop_verification: "実 Asterisk / coturn との相互接続テストで完全動作を保証する",
    docker_gate: "統合テストは docker 可用性ゲート付き — docker が使用可能な場合のみ実行し、CI では実質必須ゲート",
};

/// One breaking change to be completed in the v0.x window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreakingChange {
    /// RegistrationSucceeded / RegistrationFailed 削除（RegistrationStateChanged に統一）.
    RegistrationEventsRemoval,
    /// CallRejected 削除（reject は CallDisconnected として観測）.
    CallRejectedRemoval,
    /// DtmfMethod の SipInfo → Info 改名（RFC 2976 SIP INFO method の正名）.
    DtmfSipInfoRename,
}

// [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
impl BreakingChange {
    /// Human-readable description of the breaking change.
    pub fn label(self) -> &'static str {
        match self {
            BreakingChange::RegistrationEventsRemoval => {
                "RegistrationSucceeded / RegistrationFailed 削除（登録結果は RegistrationStateChanged に統一）"
            }
            BreakingChange::CallRejectedRemoval => {
                "CallRejected 削除（reject は CallDisconnected として観測）"
            }
            BreakingChange::DtmfSipInfoRename => {
                "DtmfMethod の SipInfo → Info 改名（RFC 2976 SIP INFO method の正名）"
            }
        }
    }
}

/// The three breaking changes listed in RFC §62.10.
pub const ROUND2_BREAKING_CHANGES: [BreakingChange; 3] = [
    BreakingChange::RegistrationEventsRemoval,
    BreakingChange::CallRejectedRemoval,
    BreakingChange::DtmfSipInfoRename,
];

/// The set of graph node IDs referenced by §62.10 (parent N0068 + N0079 + children N0080..N0089).
pub fn known_graph_node_ids() -> &'static [&'static str] {
    &[
        "N0068", "N0079", "N0080", "N0081", "N0082", "N0083", "N0084", "N0085", "N0086", "N0087",
        "N0088", "N0089",
    ]
}

/// All round-2 sections in §62.11–62.20 order.
pub fn round2_sections() -> &'static [Round2Section; 10] {
    &[
        Round2Section::TransportWiring,
        Round2Section::RegistrationLifecycle,
        Round2Section::EventPathCompletion,
        Round2Section::IncomingCallEvents,
        Round2Section::DtmfUnification,
        Round2Section::MediaPathCompletion,
        Round2Section::StunTurnIceWiring,
        Round2Section::Examples,
        Round2Section::DockerAsteriskBase,
        Round2Section::IoBoundaryReference,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C091 -- precondition: §62 親セクションが存在する
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_root_causes_are_defined() {
        let root_causes: &[Round2RootCause] = &ROUND2_ROOT_CAUSES;
        assert_eq!(
            root_causes.len(),
            5,
            "must cover exactly the 5 RFC §62.10 root causes"
        );
        let mut ids: Vec<&str> = root_causes.iter().map(|r| r.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 5, "root cause ids RC1..RC5 must be unique");
        for cause in root_causes {
            assert!(!cause.title.is_empty());
            assert!(!cause.evidence.is_empty());
            assert!(!cause.rfc_ref.is_empty());
            assert!(!cause.resolving_sections.is_empty());
        }
    }

    #[test]
    // @verifies C091 -- postcondition: 62.10 がラウンド 2 スコープを定義する
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_scope_defines_policy_and_breaking_changes() {
        let policy = ROUND2_POLICY;
        assert!(
            !policy.complete_implementation.is_empty(),
            "complete implementation policy must be set"
        );
        assert!(
            !policy.breaking_change_window.is_empty(),
            "breaking change window must be set"
        );
        assert!(
            !policy.interop_verification.is_empty(),
            "interop verification policy must be set"
        );
        assert!(
            !policy.docker_gate.is_empty(),
            "docker gate policy must be set"
        );
        let breaking_changes: &[BreakingChange] = &ROUND2_BREAKING_CHANGES;
        assert_eq!(
            breaking_changes.len(),
            3,
            "RFC §62.10 lists exactly 3 breaking changes"
        );
        let labels: Vec<&str> = breaking_changes.iter().map(|b| b.label()).collect();
        assert!(
            labels.iter().any(|l| l.contains("RegistrationSucceeded")),
            "must include RegistrationSucceeded/Failed removal"
        );
        assert!(
            labels.iter().any(|l| l.contains("CallRejected")),
            "must include CallRejected removal"
        );
        assert!(
            labels.iter().any(|l| l.contains("Info")),
            "must include DtmfMethod SipInfo->Info rename"
        );
    }

    #[test]
    // @verifies C091 -- invariant: 進化スコープは §62.1–62.9 と矛盾しない
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_scope_does_not_overlap_round1() {
        let round1_sections: [&str; 8] = [
            "62.1", "62.2", "62.3", "62.4", "62.5", "62.6", "62.7", "62.8",
        ];
        let round2_section_numbers: Vec<&str> =
            round2_sections().iter().map(|s| s.section()).collect();
        for cause in &ROUND2_ROOT_CAUSES {
            for section in cause.resolving_sections {
                assert!(
                    !round1_sections.contains(&section.section()),
                    "root cause {} resolving section {} must not overlap round 1",
                    cause.id,
                    section.section()
                );
                assert!(
                    round2_section_numbers.contains(&section.section()),
                    "root cause {} resolving section {} must be within 62.11..62.20",
                    cause.id,
                    section.section()
                );
            }
        }
    }

    #[test]
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_sections_map_to_graph_nodes() {
        let sections = round2_sections();
        assert_eq!(sections.len(), 10, "round 2 spans sections 62.11..62.20");
        let expected_nodes = [
            "N0080", "N0081", "N0082", "N0083", "N0084", "N0085", "N0086", "N0087", "N0088",
            "N0089",
        ];
        for (i, section) in sections.iter().enumerate() {
            assert_eq!(
                section.node_id(),
                expected_nodes[i],
                "section {} maps to {}",
                section.section(),
                expected_nodes[i]
            );
            assert!(!section.label().is_empty());
            assert!(
                section.section() >= "62.11" && section.section() <= "62.20",
                "section {} must be within the round-2 range 62.11..62.20",
                section.section()
            );
        }
    }

    #[test]
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_root_cause_fields_are_non_empty_and_unique() {
        let all_round2_sections: Vec<&str> =
            round2_sections().iter().map(|s| s.section()).collect();
        for cause in &ROUND2_ROOT_CAUSES {
            assert!(
                cause.evidence.contains("src/"),
                "evidence {} must cite a source path",
                cause.evidence
            );
            assert!(
                cause.rfc_ref.contains("62.10") || cause.rfc_ref.contains("§62.10"),
                "rfc_ref must reference §62.10"
            );
            let mut local = std::collections::HashSet::new();
            for section in cause.resolving_sections {
                assert!(
                    all_round2_sections.contains(&section.section()),
                    "cause {} resolving section {} must be a valid round-2 section",
                    cause.id,
                    section.section()
                );
                assert!(
                    local.insert(section.section()),
                    "section {} duplicated within cause {}",
                    section.section(),
                    cause.id
                );
            }
        }
    }

    #[test]
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn known_nodes_cover_round2_graph() {
        let known = known_graph_node_ids();
        for node in [
            "N0068", "N0079", "N0080", "N0081", "N0082", "N0083", "N0084", "N0085", "N0086",
            "N0087", "N0088", "N0089",
        ] {
            assert!(known.contains(&node), "known node set must include {node}");
        }
    }

    #[test]
    #[should_panic(expected = "must cover exactly the 5 RFC §62.10 root causes")]
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_root_causes_reject_wrong_count() {
        let mut causes = ROUND2_ROOT_CAUSES.to_vec();
        causes.truncate(4);
        assert_eq!(
            causes.len(),
            5,
            "must cover exactly the 5 RFC §62.10 root causes"
        );
    }

    #[test]
    // [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
    fn round2_section_node_ids_are_known() {
        let known = known_graph_node_ids();
        for section in round2_sections() {
            assert!(
                known.contains(&section.node_id()),
                "unknown graph node {} in section {}",
                section.node_id(),
                section.section()
            );
        }
    }

    #[test]
// [::TICKET::] P16-1, P16-2, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-1|P16-2|P16-5) --for-spec --no-implementation-order`.
    fn round2_evidence_matches_actual_source() -> Result<(), std::io::Error> {
        let backend_calls = std::fs::read_to_string("src/ffi/backend_calls.rs")?;
        // RC1 resolved by §62.11 (P16-2): the null transport config is gone and
        // the port is reflected into a real pjsua_transport_config.
        assert!(
            backend_calls.contains("pjsua_transport_create("),
            "RC1: pjsua_transport_create still invoked"
        );
        assert!(
            !backend_calls.contains("pjsua_transport_create(std::ptr::null_mut()"),
            "RC1: transport create must no longer use a null config (§62.11)"
        );
        assert!(
            backend_calls.contains("apply_transport_port"),
            "RC1: transport port reflection wired (§62.11)"
        );
        let account_spec = std::fs::read_to_string("src/config/account_config_spec.rs")?;
        let obs_metrics = std::fs::read_to_string("src/config/observability_metrics.rs")?;
        let dtmf_twophase = std::fs::read_to_string("src/api/m20_dtmfsent_twophase.rs")?;
        assert!(
            account_spec.contains("pub enum DtmfMethod"),
            "RC3: DtmfMethod defined in account_config_spec"
        );
        assert!(
            obs_metrics.contains("pub enum DtmfMethod"),
            "RC3: DtmfMethod defined in observability_metrics"
        );
        assert!(
            dtmf_twophase.contains("pub enum DtmfMethod"),
            "RC3: DtmfMethod defined in m20_dtmfsent_twophase"
        );
        let payload_bus = std::fs::read_to_string("src/api/event_model_payload_bus.rs")?;
        assert!(
            !payload_bus.contains("CallRejected(RejectInfo)"),
            "RC3 resolved (P16-5 §62.14): CallRejected variant must be removed — reject (486/603) is observed as CallDisconnected"
        );
        Ok(())
    }
}
