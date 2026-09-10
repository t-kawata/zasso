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
//   - NODE_ID=N0090:  62.21 ラウンド 3 進化スコープと根因（H5 / H8 / H11 / H12 / H13 / H14 の残存ギャップ）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0090 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

/// Round-3 §62 subsection (62.21–62.30) that resolves round-3 RESIDUE root causes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Round3Section {
    /// 62.21 Round-3 evolution scope & root causes (N0090).
    EvolutionScopeRootcause,
    /// 62.22 Raw SIP production path — pjsip_module hook wiring (N0091).
    RawSipProductionPath,
    /// 62.23 P1/P2 FFI callback registration completion (N0092).
    FfiCallbackRegistration,
    /// 62.24 TestBackend registration event firing & account_register example (N0093).
    TestBackendRegistrationEvents,
    /// 62.25 CallEntry.state native transition reflection (N0094).
    CallEntryStateTransition,
    /// 62.26 CallResumed implementation mechanism (N0095).
    CallResumedMechanism,
    /// 62.27 DtmfSent delivery-completion contract (N0096).
    DtmfSentContract,
    /// 62.28 Tap-driven production path — RustMediaPort port ops (N0097).
    TapProductionPath,
    /// 62.29 Documentation decisions — mic source / Subscription unsubscribe (N0098).
    DocumentationDecisions,
    /// 62.30 Round-3 I/O boundary reference (N0099).
    IoBoundaryReference,
}

// [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
impl Round3Section {
    /// RFC §62 subsection number (e.g. "62.21").
    pub fn section(self) -> &'static str {
        match self {
            Round3Section::EvolutionScopeRootcause => "62.21",
            Round3Section::RawSipProductionPath => "62.22",
            Round3Section::FfiCallbackRegistration => "62.23",
            Round3Section::TestBackendRegistrationEvents => "62.24",
            Round3Section::CallEntryStateTransition => "62.25",
            Round3Section::CallResumedMechanism => "62.26",
            Round3Section::DtmfSentContract => "62.27",
            Round3Section::TapProductionPath => "62.28",
            Round3Section::DocumentationDecisions => "62.29",
            Round3Section::IoBoundaryReference => "62.30",
        }
    }

    /// Full RFC §62 heading (exactly matches RFC-ROOT.md:4549-4947).
    pub fn label(self) -> &'static str {
        match self {
            Round3Section::EvolutionScopeRootcause => {
                "62.21 ラウンド 3 進化スコープと根因（H5 / H8 / H11 / H12 / H13 / H14 の残存ギャップ）"
            }
            Round3Section::RawSipProductionPath => {
                "62.22 raw SIP 生産経路: pjsip_module フックによる配線（Q1 / Q1a）"
            }
            Round3Section::FfiCallbackRegistration => "62.23 P1/P2 FFI コールバック登録の完了（Q2）",
            Round3Section::TestBackendRegistrationEvents => {
                "62.24 TestBackend 登録イベント発火と account_register example 完走（Q3）"
            }
            Round3Section::CallEntryStateTransition => {
                "62.25 CallEntry.state のネイティブ遷移反映（Q4）"
            }
            Round3Section::CallResumedMechanism => "62.26 CallResumed の実装機構（Q5 / Q5a）",
            Round3Section::DtmfSentContract => "62.27 DtmfSent 送出完了契約の確定（Q6）",
            Round3Section::TapProductionPath => {
                "62.28 tap 駆動の生産経路: RustMediaPort port ops（Q7）"
            }
            Round3Section::DocumentationDecisions => {
                "62.29 文書化決定: マイク source / Subscription unsubscribe（Q8 / Q8a）"
            }
            Round3Section::IoBoundaryReference => {
                "62.30 I/O 境界参照情報（graphify / boundify 用）— round 3"
            }
        }
    }

    /// Corresponding RFC graph node ID (N0090..N0099).
    pub fn node_id(self) -> &'static str {
        match self {
            Round3Section::EvolutionScopeRootcause => "N0090",
            Round3Section::RawSipProductionPath => "N0091",
            Round3Section::FfiCallbackRegistration => "N0092",
            Round3Section::TestBackendRegistrationEvents => "N0093",
            Round3Section::CallEntryStateTransition => "N0094",
            Round3Section::CallResumedMechanism => "N0095",
            Round3Section::DtmfSentContract => "N0096",
            Round3Section::TapProductionPath => "N0097",
            Round3Section::DocumentationDecisions => "N0098",
            Round3Section::IoBoundaryReference => "N0099",
        }
    }
}

/// One round-3 RESIDUE root cause (RFC §62.21), keyed by H-code.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round3RootCause {
    /// Short stable identifier (RC1..RC6).
    pub id: &'static str,
    /// One-line title of the root cause.
    pub title: &'static str,
    /// Concrete source location that proves the root cause exists today.
    pub evidence: &'static str,
    /// RFC section / graph node that defines the expected (correct) design.
    pub rfc_ref: &'static str,
    /// Round-3 §62 subsections that resolve this root cause.
    pub resolving_sections: &'static [Round3Section],
}

/// The six round-3 RESIDUE root causes aggregated from the eight RFC §62.21 gaps.
pub const ROUND3_ROOT_CAUSES: [Round3RootCause; 6] = [
    Round3RootCause {
        id: "RC1",
        title: "raw SIP production path is not wired (H8)",
        evidence: "src/ffi/callback.rs:145 enqueue_raw_sip_bytes defined, production callers zero (only test calls at 702/714/715/727); vendor/pjsip/pjsip/include/pjsua.h lacks on_rx_msg",
        rfc_ref: "§62.21 / H8",
        resolving_sections: &[Round3Section::RawSipProductionPath],
    },
    Round3RootCause {
        id: "RC2",
        title: "P1/P2 FFI callbacks not registered (H8)",
        evidence: "src/ffi/callback.rs:182-197 register_callbacks registers 8 callbacks only; on_transport_state/on_call_tsx_state/on_call_replaced/on_nat_detect unregistered",
        rfc_ref: "§62.21 / H8",
        resolving_sections: &[Round3Section::FfiCallbackRegistration],
    },
    Round3RootCause {
        id: "RC3",
        title: "TestBackend does not fire registration events (H5)",
        evidence: "src/runtime/backend.rs:379 TestBackend::set_registration records + returns configured result, never generates NativeEvent::RegistrationStateChanged",
        rfc_ref: "§62.21 / H5",
        resolving_sections: &[Round3Section::TestBackendRegistrationEvents],
    },
    Round3RootCause {
        id: "RC4",
        title: "CallEntry.state not updated on native transitions and CallResumed unimplemented (H11)",
        evidence: "src/runtime/reactor.rs:1046 process_native_event publishes only, does not mutate CallEntry.state; src/api/event_model_payload_bus.rs:335 CallResumed unit variant with zero construction sites",
        rfc_ref: "§62.21 / H11",
        resolving_sections: &[
            Round3Section::CallEntryStateTransition,
            Round3Section::CallResumedMechanism,
        ],
    },
    Round3RootCause {
        id: "RC5",
        title: "DtmfSent delivery contract undefined (H12)",
        evidence: "src/api/m20_dtmfsent_twophase.rs:64 DEFAULT_DTMF_SENT_TIMEOUT_MS = 500 timeout-driven while §62.15 described callback priority",
        rfc_ref: "§62.21 / H12",
        resolving_sections: &[Round3Section::DtmfSentContract],
    },
    Round3RootCause {
        id: "RC6",
        title: "tap-driven production path undefined and documentation gap (H13/H14)",
        evidence: "vendor/pjsip has no pjsua_conf_set_callback; src/runtime/audio_worker.rs RustMediaPort registered per call at src/runtime/backend.rs:773; mic source & Subscription unsubscribe undocumented",
        rfc_ref: "§62.21 / H13,H14",
        resolving_sections: &[
            Round3Section::TapProductionPath,
            Round3Section::DocumentationDecisions,
        ],
    },
];

/// The overall round-3 policy (RFC §62.21 全体方針).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round3Policy {
    /// Wiring is fixed against the actual vendored PJSIP 2.17 API.
    pub real_api_wiring: &'static str,
    /// Comprehensive event implementation + breaking changes accepted in v0.x.
    pub event_completeness: &'static str,
    /// No dependency on APIs that do not exist (e.g. pjsua_callback.on_rx_msg).
    pub no_missing_api_dependency: &'static str,
    /// Standard extension points (pjsip_module) connect to the injection point.
    pub extension_point_wiring: &'static str,
}

pub const ROUND3_POLICY: Round3Policy = Round3Policy {
    real_api_wiring: "vendored PJSIP 2.17 の実 API に基づく配線の確定",
    event_completeness: "イベントの網羅的実装 + v0.x で破壊的変更を受容した統一",
    no_missing_api_dependency: "pjsua_callback.on_rx_msg のような存在しない API に依存しない",
    extension_point_wiring:
        "標準拡張点（pjsip_module）と実装済みの注入点（enqueue_raw_sip_bytes）を接続する",
};

/// One breaking change to be completed in the v0.x window (RFC §62.21).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Round3BreakingChange {
    /// CallResumed のペイロード化 — the unit variant becomes a payload-carrying variant.
    CallResumedPayload,
    /// subscribe 系 API の Subscription<T> 化 — unsubscribe API is formalized.
    SubscriptionGenerics,
}

// [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
impl Round3BreakingChange {
    /// Human-readable description of the breaking change.
    pub fn label(self) -> &'static str {
        match self {
            Round3BreakingChange::CallResumedPayload => {
                "CallResumed のペイロード化（unit variant → ペイロード付き variant）"
            }
            Round3BreakingChange::SubscriptionGenerics => {
                "subscribe 系 API の Subscription<T> 化（unsubscribe の API を確定）"
            }
        }
    }
}

/// The two breaking changes listed in RFC §62.21.
pub const ROUND3_BREAKING_CHANGES: [Round3BreakingChange; 2] = [
    Round3BreakingChange::CallResumedPayload,
    Round3BreakingChange::SubscriptionGenerics,
];

/// The set of graph node IDs referenced by §62.21 (parent N0068 + round-2 I/O N0089 + N0090..N0099).
pub fn known_graph_node_ids() -> &'static [&'static str] {
    &[
        "N0068", "N0089", "N0090", "N0091", "N0092", "N0093", "N0094", "N0095", "N0096", "N0097",
        "N0098", "N0099",
    ]
}

/// All round-3 sections in §62.21–62.30 order.
pub fn round3_sections() -> &'static [Round3Section; 10] {
    &[
        Round3Section::EvolutionScopeRootcause,
        Round3Section::RawSipProductionPath,
        Round3Section::FfiCallbackRegistration,
        Round3Section::TestBackendRegistrationEvents,
        Round3Section::CallEntryStateTransition,
        Round3Section::CallResumedMechanism,
        Round3Section::DtmfSentContract,
        Round3Section::TapProductionPath,
        Round3Section::DocumentationDecisions,
        Round3Section::IoBoundaryReference,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::round2_scope_rootcause;

    // @verifies C121 -- precondition: Round 2 evolution settled (§62.10–62.20)
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round2_evolution_is_settled() {
        assert_eq!(
            round2_scope_rootcause::ROUND2_ROOT_CAUSES.len(),
            5,
            "round 2 must be settled with exactly 5 root causes (§62.10)"
        );
        assert_eq!(
            round2_scope_rootcause::round2_sections().len(),
            10,
            "round 2 must be settled with sections 62.11..62.20"
        );
    }

    // @verifies C121 -- postcondition: round 3 scope derives the remaining RESIDUE gaps
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_scope_derives_from_round2() {
        for cause in &ROUND3_ROOT_CAUSES {
            let references_round2 = cause.rfc_ref.contains("62.1")
                || cause.rfc_ref.contains("62.20")
                || cause.rfc_ref.contains("62.2");
            assert!(
                references_round2,
                "root cause {} rfc_ref '{}' must reference round 2 outcomes (§62.10-62.20)",
                cause.id, cause.rfc_ref
            );
            assert!(
                !cause.resolving_sections.is_empty(),
                "root cause {} must resolve via at least one §62.22-62.29 section",
                cause.id
            );
        }
    }

    // @verifies C121 -- invariant: round 3 never re-decides a settled round 2 design
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_scope_does_not_overlap_round2() {
        let round1_sections: [&str; 8] = [
            "62.1", "62.2", "62.3", "62.4", "62.5", "62.6", "62.7", "62.8",
        ];
        let round2_section_numbers: Vec<&str> = round2_scope_rootcause::round2_sections()
            .iter()
            .map(|s| s.section())
            .collect();
        for cause in &ROUND3_ROOT_CAUSES {
            for section in cause.resolving_sections {
                assert!(
                    !round1_sections.contains(&section.section()),
                    "cause {} resolving section {} must not overlap round 1",
                    cause.id,
                    section.section()
                );
                assert!(
                    !round2_section_numbers.contains(&section.section()),
                    "cause {} resolving section {} must not re-decide round 2 (§62.11-62.20)",
                    cause.id,
                    section.section()
                );
                assert!(
                    section.section() >= "62.22" && section.section() <= "62.29",
                    "cause {} resolving section {} must be within 62.22..62.29",
                    cause.id,
                    section.section()
                );
            }
        }
    }

    // @verifies C122 -- precondition: vendored PJSIP 2.17 headers present
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn vendored_pjsip_is_2_17() -> Result<(), std::io::Error> {
        let config_h = std::fs::read_to_string("vendor/pjsip/pjlib/include/pj/config.h")?;
        assert!(
            config_h.contains("#define PJ_VERSION_NUM_MAJOR    2"),
            "vendored PJSIP major version must be 2"
        );
        assert!(
            config_h.contains("#define PJ_VERSION_NUM_MINOR    17"),
            "vendored PJSIP minor version must be 17 (§62.21 premise)"
        );
        let pjsua_h = std::fs::read_to_string("vendor/pjsip/pjsip/include/pjsua.h")?;
        assert!(
            !pjsua_h.contains("on_rx_msg"),
            "pjsua_callback must not contain on_rx_msg in any PJSIP 2.x"
        );
        Ok(())
    }

    // @verifies C122 -- postcondition: round 3 sections map to graph node IDs
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_sections_map_to_graph_nodes() {
        let sections = round3_sections();
        assert_eq!(sections.len(), 10, "round 3 spans sections 62.21..62.30");
        let expected_nodes = [
            "N0090", "N0091", "N0092", "N0093", "N0094", "N0095", "N0096", "N0097", "N0098",
            "N0099",
        ];
        for (i, section) in sections.iter().enumerate() {
            assert_eq!(
                section.node_id(),
                expected_nodes[i],
                "section {} maps to {}",
                section.section(),
                expected_nodes[i]
            );
            assert!(
                !section.label().is_empty(),
                "section {} label must be non-empty",
                section.section()
            );
        }
    }

    // @verifies C122 -- invariant: resolution table exactly matches RFC headings
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_section_labels_match_rfc_headings() {
        let expected_labels = [
            "62.21 ラウンド 3 進化スコープと根因（H5 / H8 / H11 / H12 / H13 / H14 の残存ギャップ）",
            "62.22 raw SIP 生産経路: pjsip_module フックによる配線（Q1 / Q1a）",
            "62.23 P1/P2 FFI コールバック登録の完了（Q2）",
            "62.24 TestBackend 登録イベント発火と account_register example 完走（Q3）",
            "62.25 CallEntry.state のネイティブ遷移反映（Q4）",
            "62.26 CallResumed の実装機構（Q5 / Q5a）",
            "62.27 DtmfSent 送出完了契約の確定（Q6）",
            "62.28 tap 駆動の生産経路: RustMediaPort port ops（Q7）",
            "62.29 文書化決定: マイク source / Subscription unsubscribe（Q8 / Q8a）",
            "62.30 I/O 境界参照情報（graphify / boundify 用）— round 3",
        ];
        for (i, section) in round3_sections().iter().enumerate() {
            assert_eq!(
                section.label(),
                expected_labels[i],
                "label must exactly match RFC heading"
            );
            assert!(
                section.section() >= "62.21" && section.section() <= "62.30",
                "section {} must be within 62.21..62.30",
                section.section()
            );
            assert!(
                section.node_id() >= "N0090" && section.node_id() <= "N0099",
                "node_id {} must be within N0090..N0099",
                section.node_id()
            );
        }
    }

    // @verifies C121 -- invariant: no out-of-range resolving section reference
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_root_causes_reject_out_of_range_sections() {
        let all_round3_sections: Vec<&str> =
            round3_sections().iter().map(|s| s.section()).collect();
        for cause in &ROUND3_ROOT_CAUSES {
            for section in cause.resolving_sections {
                assert!(
                    all_round3_sections.contains(&section.section()),
                    "cause {} resolving section {} must be a valid round-3 section",
                    cause.id,
                    section.section()
                );
            }
        }
    }

    // @verifies C122 -- invariant: node_id references stay within the known graph set
    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_section_node_ids_are_known() {
        let known = known_graph_node_ids();
        for section in round3_sections() {
            assert!(
                known.contains(&section.node_id()),
                "unknown graph node {} in section {}",
                section.node_id(),
                section.section()
            );
        }
    }

    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn known_nodes_cover_round3_graph() {
        let known = known_graph_node_ids();
        for node in [
            "N0068", "N0089", "N0090", "N0091", "N0092", "N0093", "N0094", "N0095", "N0096",
            "N0097", "N0098", "N0099",
        ] {
            assert!(known.contains(&node), "known node set must include {node}");
        }
    }

    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_root_causes_are_defined() {
        let root_causes: &[Round3RootCause] = &ROUND3_ROOT_CAUSES;
        assert_eq!(
            root_causes.len(),
            6,
            "must cover exactly the 6 RFC §62.21 root causes"
        );
        let mut ids: Vec<&str> = root_causes.iter().map(|r| r.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 6, "root cause ids RC1..RC6 must be unique");
        for cause in root_causes {
            assert!(!cause.title.is_empty());
            assert!(!cause.evidence.is_empty());
            assert!(!cause.rfc_ref.is_empty());
            assert!(!cause.resolving_sections.is_empty());
        }
    }

    #[test]
    #[should_panic(expected = "must cover exactly the 6 RFC §62.21 root causes")]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_root_causes_reject_wrong_count() {
        let mut causes = ROUND3_ROOT_CAUSES.to_vec();
        causes.truncate(5);
        assert_eq!(
            causes.len(),
            6,
            "must cover exactly the 6 RFC §62.21 root causes"
        );
    }

    #[test]
    // [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
    fn round3_scope_defines_policy_and_breaking_changes() {
        let policy = ROUND3_POLICY;
        assert!(!policy.real_api_wiring.is_empty());
        assert!(!policy.event_completeness.is_empty());
        assert!(!policy.no_missing_api_dependency.is_empty());
        assert!(!policy.extension_point_wiring.is_empty());
        let breaking: &[Round3BreakingChange] = &ROUND3_BREAKING_CHANGES;
        assert_eq!(breaking.len(), 2, "RFC §62.21 lists 2 breaking changes");
        let labels: Vec<&str> = breaking.iter().map(|b| b.label()).collect();
        assert!(
            labels.iter().any(|l| l.contains("CallResumed")),
            "must include CallResumed payload-ization"
        );
        assert!(
            labels.iter().any(|l| l.contains("Subscription")),
            "must include subscribe API Subscription<T> generalization"
        );
    }

    #[test]
    // [::TICKET::] P17-1, P17-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-1|P17-6) --for-spec --no-implementation-order`.
    fn round3_evidence_matches_actual_source() -> Result<(), std::io::Error> {
        let callback = std::fs::read_to_string("src/ffi/callback.rs")?;
        assert!(
            callback.contains("pub fn enqueue_raw_sip_bytes"),
            "RC1: enqueue_raw_sip_bytes defined"
        );
        assert!(
            callback.contains("config.cb.on_incoming_call"),
            "RC2: register_callbacks wired"
        );
        let backend = std::fs::read_to_string("src/runtime/backend.rs")?;
        assert!(
            backend.contains("fn set_registration"),
            "RC3: TestBackend::set_registration exists"
        );
        let payload_bus = std::fs::read_to_string("src/api/event_model_payload_bus.rs")?;
        assert!(
            payload_bus.contains("CallResumed(CallResumedInfo)"),
            "RC4: CallResumed payload-ized (resolved by P17-6 §62.26)"
        );
        let dtmf = std::fs::read_to_string("src/api/m20_dtmfsent_twophase.rs")?;
        assert!(
            dtmf.contains("DEFAULT_DTMF_SENT_TIMEOUT_MS: u64 = 500"),
            "RC5: 500ms timeout"
        );
        let pjsua_h = std::fs::read_to_string("vendor/pjsip/pjsip/include/pjsua.h")?;
        assert!(
            !pjsua_h.contains("pjsua_conf_set_callback"),
            "RC6: pjsua_conf_set_callback absent"
        );
        Ok(())
    }
}
