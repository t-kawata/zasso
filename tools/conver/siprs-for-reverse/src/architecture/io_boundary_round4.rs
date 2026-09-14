
//! Round-4 I/O boundary reference for graphify / boundify (§62.44 / N0113).
//!
//! Records the I/O boundary of every round-4 design decision (§62.31–62.43) so
//! that graphify / boundify can make split and prune decisions without reading
//! the RFC prose. The producer side (crates/pjsip-prebuilt + CI commit) is split
//! from the consumer side (build repair) per design brief §5.3 / §5.5.

/// Round-4 RFC §62 subsections (62.31–62.44 / N0100–N0113).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Round4Section {
    EvolutionScopeRootcause,
    VendoredVersionStrategy,
    BindgenEnumConstStrategy,
    StaticLibLinkStrategy,
    BuildRsFourStagePipeline,
    ProducerTool,
    CiOperationAndCommit,
    RawSipRealVerification,
    IceTransportErrorRegistration,
    PushMediaFrameWiring,
    ConfBridgeReregistration,
    RealPjsipIntegrationTests,
    TicketStructure,
    IoBoundaryReference,
}

impl Round4Section {
    /// RFC §62 subsection number (e.g. "62.31").
    pub fn section(self) -> &'static str {
        match self {
            Round4Section::EvolutionScopeRootcause => "62.31",
            Round4Section::VendoredVersionStrategy => "62.32",
            Round4Section::BindgenEnumConstStrategy => "62.33",
            Round4Section::StaticLibLinkStrategy => "62.34",
            Round4Section::BuildRsFourStagePipeline => "62.35",
            Round4Section::ProducerTool => "62.36",
            Round4Section::CiOperationAndCommit => "62.37",
            Round4Section::RawSipRealVerification => "62.38",
            Round4Section::IceTransportErrorRegistration => "62.39",
            Round4Section::PushMediaFrameWiring => "62.40",
            Round4Section::ConfBridgeReregistration => "62.41",
            Round4Section::RealPjsipIntegrationTests => "62.42",
            Round4Section::TicketStructure => "62.43",
            Round4Section::IoBoundaryReference => "62.44",
        }
    }

    /// The RFC graph node ID for this section (N0100–N0113).
    pub fn node_id(self) -> &'static str {
        match self {
            Round4Section::EvolutionScopeRootcause => "N0100",
            Round4Section::VendoredVersionStrategy => "N0101",
            Round4Section::BindgenEnumConstStrategy => "N0102",
            Round4Section::StaticLibLinkStrategy => "N0103",
            Round4Section::BuildRsFourStagePipeline => "N0104",
            Round4Section::ProducerTool => "N0105",
            Round4Section::CiOperationAndCommit => "N0106",
            Round4Section::RawSipRealVerification => "N0107",
            Round4Section::IceTransportErrorRegistration => "N0108",
            Round4Section::PushMediaFrameWiring => "N0109",
            Round4Section::ConfBridgeReregistration => "N0110",
            Round4Section::RealPjsipIntegrationTests => "N0111",
            Round4Section::TicketStructure => "N0112",
            Round4Section::IoBoundaryReference => "N0113",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Round4Section::EvolutionScopeRootcause => "62.31 ラウンド 4 進化スコープと根因（Q9–Q22）",
            Round4Section::VendoredVersionStrategy => "62.32 vendored PJSIP バージョン戦略（Q9）",
            Round4Section::BindgenEnumConstStrategy => "62.33 bindgen enum/const 生成戦略（Q10）",
            Round4Section::StaticLibLinkStrategy => "62.34 静的ライブラリのリンク戦略（Q11 / Q11a）",
            Round4Section::BuildRsFourStagePipeline => {
                "62.35 build.rs 4 段階解決パイプラインと vendored-source build フォールバック（Q12）"
            }
            Round4Section::ProducerTool => "62.36 producer ツール crates/pjsip-prebuilt（Q13 / Q14 / Q16）",
            Round4Section::CiOperationAndCommit => "62.37 CI 運用と prebuilt コミット（Q15）",
            Round4Section::RawSipRealVerification => "62.38 raw SIP 実 PJSIP 検証経路（Q17）",
            Round4Section::IceTransportErrorRegistration => "62.39 on_ice_transport_error 登録（Q18）",
            Round4Section::PushMediaFrameWiring => "62.40 push_media_frame 生産経路配線（Q19）",
            Round4Section::ConfBridgeReregistration => {
                "62.41 AddAudioSource 時 RustMediaPort conf bridge 再登録（Q20）"
            }
            Round4Section::RealPjsipIntegrationTests => "62.42 実 PJSIP 統合テストスコープ（Q21）",
            Round4Section::TicketStructure => "62.43 チケット構造とフェーズ割当（Q22）",
            Round4Section::IoBoundaryReference => {
                "62.44 I/O 境界参照情報（graphify / boundify 用）— round 4"
            }
        }
    }
}

/// One row of the §62.44 round-4 I/O boundary reference table.
///
/// Each row describes one round-4 design decision's I/O boundary so that
/// graphify / boundify can make split and prune decisions without reading the
/// RFC prose (§62.31–62.43).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round4IoBoundaryRow {
    /// The round-4 design decision whose I/O boundary this row describes.
    pub decision: Round4Section,
    /// Inputs (consumes) at the boundary.
    pub consumes: &'static str,
    /// Outputs (produces) at the boundary.
    pub produces: &'static str,
    /// File/module candidates that graphify / boundify inspect for this boundary.
    pub file_candidates: &'static [&'static str],
    /// Related RFC graph node IDs that constrain the boundary.
    pub graph_node_ids: &'static [&'static str],
}

/// A round-4 prune/update target that boundify must track once the resolving
/// round-4 decision lands (RFC §62.44 削除/整理対象).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Round4DeleteTarget {
    /// Repo-relative path of the file/location to prune or update.
    pub path: &'static str,
    /// What exactly is pruned/updated at that location.
    pub description: &'static str,
    /// The round-4 design decision whose implementation resolves this target.
    pub resolved_by: Round4Section,
}

/// The §62.44 I/O boundary table — 13 rows, one per round-4 design decision
/// (62.31–62.43). The 62.44 container itself is excluded.
pub const ROUND4_IO_BOUNDARY_TABLE: [Round4IoBoundaryRow; 13] = [
    Round4IoBoundaryRow {
        decision: Round4Section::EvolutionScopeRootcause,
        consumes: "README H1 RESIDUE / 設計ブリーフ §3.2（69 エラー, 7 カテゴリ）",
        produces: "ビルド修復 playbook（7 カテゴリ）/ ROUND4_SCOPE_TARGETS（9 ファイル）",
        file_candidates: &[
            "src/architecture/round4_scope_rootcause.rs",
            "src/build/build_script_bindgen.rs",
        ],
        graph_node_ids: &["N0100", "N0090", "N0039"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::VendoredVersionStrategy,
        consumes: "定数参照（PJ_SUCCESS 等）/ codec_id 文字列 / pjsua_config.turn_cfg フィールド",
        produces:
            "実在シンボル参照 / codec name・rate 導出（codec_id パース）/ 定数移動（constants.rs）",
        file_candidates: &[
            "src/ffi/constants.rs",
            "src/ffi/backend_calls.rs",
            "src/ffi/callback.rs",
            "src/config/observability_metrics.rs",
            "src/config/stun_turn_ice_wiring.rs",
        ],
        graph_node_ids: &["N0101", "N0039"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::BindgenEnumConstStrategy,
        consumes:
            "bindgen allowlist + 設定（BINDGEN_ALLOWLIST_VARS / PJSIP_CRED_DATA_PLAIN_PASSWD）",
        produces: "bindings.rs（enum / const / pjsua_config 全体）",
        file_candidates: &[
            "src/build/build_script_bindgen.rs",
            "src/ffi/bindings.rs",
            "src/state/m20_callstate_mapping.rs",
        ],
        graph_node_ids: &["N0102", "N0080"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::StaticLibLinkStrategy,
        consumes: "lib/ 実ファイル（vendor/prebuilt/<target>/lib）",
        produces: "link-search / link-lib / Linux --start-group（emit_cargo_directive）",
        file_candidates: &["build.rs", "vendor/prebuilt/aarch64-apple-darwin/lib"],
        graph_node_ids: &["N0103", "N0039"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::BuildRsFourStagePipeline,
        consumes: "prebuilt / system / vendored source",
        produces: "リンク指令 / ヘッダルート / 任意 stage（resolve_pjsip）",
        file_candidates: &["build.rs", "vendor/pjsip"],
        graph_node_ids: &["N0104", "N0039"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::ProducerTool,
        consumes: "vendor/pjsip / Dockerfile / ホスト OS",
        produces: "vendor/prebuilt/<target>/{include,lib}",
        file_candidates: &["crates/pjsip-prebuilt", "crates/pjsip-prebuilt/Dockerfile"],
        graph_node_ids: &["N0105", "N0054"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::CiOperationAndCommit,
        consumes: "3 OS ランナー（macos-latest / ubuntu-latest / windows-latest）",
        produces: "vendor/prebuilt コミット",
        file_candidates: &[".github/workflows/prebuilt.yml"],
        graph_node_ids: &["N0106", "N0054"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::RawSipRealVerification,
        consumes: "実 SIP メッセージ（Docker）",
        produces: "RawSipMessage → subscribe_raw_sip()",
        file_candidates: &[
            "src/ffi/raw_sip_module.rs",
            "src/tests/raw_sip_real_test.rs",
            "tests/sip_integration.rs",
        ],
        graph_node_ids: &["N0107", "N0091", "N0088"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::IceTransportErrorRegistration,
        consumes: "on_ice_transport_error コールバック",
        produces: "NativeEvent::IceTransportError",
        file_candidates: &[
            "src/ffi/bindings.rs",
            "src/ffi/callback.rs",
            "src/runtime/backend.rs",
        ],
        graph_node_ids: &["N0108", "N0092"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::PushMediaFrameWiring,
        consumes: "conf bridge フレーム（port ops: get_frame / put_frame）",
        produces: "AudioTapSender::try_push（AudioChunkPair）",
        file_candidates: &["src/runtime/audio_worker.rs", "src/runtime/backend.rs"],
        graph_node_ids: &["N0109", "N0097"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::ConfBridgeReregistration,
        consumes: "AddAudioSource",
        produces: "pjsua_conf_add_port（RustMediaPort）",
        file_candidates: &["src/runtime/command.rs", "src/runtime/backend.rs"],
        graph_node_ids: &["N0110", "N0085"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::RealPjsipIntegrationTests,
        consumes: "Docker Asterisk / coturn",
        produces: "プロトコル + RTP 保証",
        file_candidates: &[
            "tests/sip_integration.rs",
            "src/tests/docker_asterisk_it.rs",
            "src/tests/real_pjsip_itest.rs",
        ],
        graph_node_ids: &["N0111", "N0088", "N0052"],
    },
    Round4IoBoundaryRow {
        decision: Round4Section::TicketStructure,
        consumes: "設計ブリーフ §5.5 / ユーザー指示（A/B 最優先、ギャップは後に連ねる）",
        produces: "phase 18–22 配置（Tickets.json）",
        file_candidates: &["src/architecture/round4_tickets.rs", "Tickets.json"],
        graph_node_ids: &["N0112", "N0100"],
    },
];

/// The four prune/update targets listed in RFC §62.44 — all pre-resolved by
/// P18-1 (Ticket A); boundify tracks them for Prune bookkeeping.
pub const ROUND4_DELETE_TARGETS: [Round4DeleteTarget; 4] = [
    Round4DeleteTarget {
        path: "build.rs",
        description: "static=pjsua2 単独リンクを 4 段階解決パイプラインのリンク導出（link-search / link-lib / --start-group）へ置換",
        resolved_by: Round4Section::StaticLibLinkStrategy,
    },
    Round4DeleteTarget {
        path: "src/ffi/backend_calls.rs",
        description: "PJSUA_CALL_NULL の bindings 依存をクレート内定数（constants.rs）へ置換",
        resolved_by: Round4Section::VendoredVersionStrategy,
    },
    Round4DeleteTarget {
        path: "src/build/build_script_bindgen.rs",
        description: "PJ_CRED_DATA_PLAIN_PASSWD の allowlist エントリを PJSIP_CRED_DATA_PLAIN_PASSWD へ修正",
        resolved_by: Round4Section::BindgenEnumConstStrategy,
    },
    Round4DeleteTarget {
        path: "src/config/observability_metrics.rs",
        description: "pjsua_codec_info の encoding_name / clock_rate 直接参照を codec_id パース（codec_id_to_name_rate）へ置換",
        resolved_by: Round4Section::VendoredVersionStrategy,
    },
];

/// The producer-side round-4 sections (§62.36–62.37): prebuilt generation + CI commit.
pub const ROUND4_PRODUCER_SECTIONS: [Round4Section; 2] = [
    Round4Section::ProducerTool,
    Round4Section::CiOperationAndCommit,
];

/// The consumer-side round-4 sections (§62.31–62.35): build repair.
pub const ROUND4_CONSUMER_SECTIONS: [Round4Section; 5] = [
    Round4Section::EvolutionScopeRootcause,
    Round4Section::VendoredVersionStrategy,
    Round4Section::BindgenEnumConstStrategy,
    Round4Section::StaticLibLinkStrategy,
    Round4Section::BuildRsFourStagePipeline,
];

/// Paths referenced by §62.44 that do not exist at implementation time
/// (producer artifacts to be generated by P18-2 / CI). These are excluded
/// from existence checks.
pub const ROUND4_NOT_YET_CREATED_PATHS: &[&str] = &[
    "crates/pjsip-prebuilt",
    "crates/pjsip-prebuilt/Dockerfile",
    ".github/workflows/prebuilt.yml",
    "vendor/prebuilt/x86_64-unknown-linux-gnu",
    "vendor/prebuilt/x86_64-pc-windows-msvc",
];

/// The set of graph node IDs referenced by §62.44 — the round-3 boundary node
pub fn known_round4_graph_node_ids() -> &'static [&'static str] {
    &[
        "N0099", "N0100", "N0101", "N0102", "N0103", "N0104", "N0105", "N0106", "N0107", "N0108",
        "N0109", "N0110", "N0111", "N0112", "N0113", "N0039", "N0080", "N0085", "N0088", "N0090",
        "N0091", "N0092", "N0097", "N0052", "N0054",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::io_boundary_round3::{
        ROUND3_DELETE_TARGETS, ROUND3_IO_BOUNDARY_TABLE,
    };
    use crate::architecture::round4_scope_rootcause::ROUND4_SCOPE_TARGETS;

    #[test]
    fn round3_io_boundary_reference_exists() {
        assert_eq!(ROUND3_IO_BOUNDARY_TABLE.len(), 8);
        assert_eq!(ROUND3_DELETE_TARGETS.len(), 4);
    }

    #[test]
    fn round4_boundary_splits_producer_consumer() {
        assert_eq!(ROUND4_IO_BOUNDARY_TABLE.len(), 13);
        assert_eq!(ROUND4_CONSUMER_SECTIONS.len(), 5);
        assert_eq!(ROUND4_PRODUCER_SECTIONS.len(), 2);
        assert_eq!(ROUND4_PRODUCER_SECTIONS[0].section(), "62.36");
        assert_eq!(ROUND4_PRODUCER_SECTIONS[1].section(), "62.37");
        for sec in ROUND4_CONSUMER_SECTIONS {
            assert!(sec.section() >= "62.31" && sec.section() <= "62.35");
        }
    }

    #[test]
    fn all_round4_nodes_map_to_files() {
        let known = known_round4_graph_node_ids();
        assert!(
            known.contains(&"N0099"),
            "round-3 §62.30 node N0099 must be known"
        );
        for row in &ROUND4_IO_BOUNDARY_TABLE {
            assert!(
                !row.file_candidates.is_empty(),
                "{} no file candidates",
                row.decision.section()
            );
            for node in row.graph_node_ids {
                assert!(
                    known.contains(node),
                    "unknown graph node {node} in {}",
                    row.decision.section()
                );
            }
        }
        assert!(!ROUND4_NOT_YET_CREATED_PATHS.is_empty());
    }

    #[test]
    fn round4_table_lists_thirteen_boundaries() {
        assert_eq!(ROUND4_IO_BOUNDARY_TABLE.len(), 13);
        for row in &ROUND4_IO_BOUNDARY_TABLE {
            assert!(
                !row.consumes.is_empty(),
                "{} consumes empty",
                row.decision.section()
            );
            assert!(
                !row.produces.is_empty(),
                "{} produces empty",
                row.decision.section()
            );
            assert!(
                !row.file_candidates.is_empty(),
                "{} file_candidates empty",
                row.decision.section()
            );
            assert!(
                !row.graph_node_ids.is_empty(),
                "{} graph_node_ids empty",
                row.decision.section()
            );
        }
    }

    #[test]
    fn round4_rows_are_non_empty() {
        for row in &ROUND4_IO_BOUNDARY_TABLE {
            let section = row.decision.section();
            assert!(!row.consumes.is_empty(), "{section} consumes empty");
            assert!(!row.produces.is_empty(), "{section} produces empty");
            assert!(
                !row.file_candidates.is_empty(),
                "{section} file_candidates empty"
            );
            assert!(
                !row.graph_node_ids.is_empty(),
                "{section} graph_node_ids empty"
            );
        }
    }

    #[test]
    fn round4_table_covers_62_31_to_62_43_only() {
        let sections: Vec<&str> = ROUND4_IO_BOUNDARY_TABLE
            .iter()
            .map(|r| r.decision.section())
            .collect();
        assert_eq!(sections.len(), 13);
        for n in 31..=43 {
            let sec = format!("62.{n}");
            assert_eq!(
                sections.iter().filter(|s| **s == sec).count(),
                1,
                "{sec} must appear once"
            );
        }
        assert!(
            !sections.contains(&"62.44"),
            "62.44 (container) must not be a row"
        );
        assert!(
            !sections.contains(&"62.30"),
            "62.30 (round-3 container) must not be a row"
        );
    }

    #[test]
    fn round4_delete_targets_resolve_to_table_rows() -> Result<(), std::io::Error> {
        let decisions: Vec<_> = ROUND4_IO_BOUNDARY_TABLE
            .iter()
            .map(|r| r.decision)
            .collect();
        assert_eq!(ROUND4_DELETE_TARGETS.len(), 4);
        for target in &ROUND4_DELETE_TARGETS {
            assert!(
                decisions.contains(&target.resolved_by),
                "resolved_by {} not in table",
                target.resolved_by.section()
            );
            assert!(
                std::path::Path::new(target.path).exists(),
                "delete target path must exist: {}",
                target.path
            );
        }
        // All 4 prune targets are pre-resolved by P18-1 (Ticket A):
        // 1. build.rs static=pjsua2 single link -> 4-stage link derivation
        let build = std::fs::read_to_string("build.rs")?;
        assert!(
            !build.contains("static=pjsua2"),
            "build.rs must not keep the single static=pjsua2 link"
        );
        // 2. PJSUA_CALL_NULL moved into crate constants.rs
        let constants = std::fs::read_to_string("src/ffi/constants.rs")?;
        assert!(
            constants.contains("PJSUA_CALL_NULL"),
            "PJSUA_CALL_NULL must live in constants.rs"
        );
        // 3. bindgen allowlist uses the corrected PJSIP_CRED_DATA_PLAIN_PASSWD symbol
        let bindgen = std::fs::read_to_string("src/build/build_script_bindgen.rs")?;
        assert!(
            bindgen.contains("PJSIP_CRED_DATA_PLAIN_PASSWD"),
            "allowlist must use PJSIP_CRED_DATA_PLAIN_PASSWD"
        );
        // 4. codec name/rate derived from codec_id, not direct pjsua_codec_info fields
        let obs = std::fs::read_to_string("src/config/observability_metrics.rs")?;
        assert!(
            obs.contains("codec_id_to_name_rate"),
            "observability_metrics must derive name/rate from codec_id"
        );
        Ok(())
    }

    #[test]
    fn round4_consumer_file_candidates_stay_in_scope() {
        // a round-3-settled architecture file.
        for row in &ROUND4_IO_BOUNDARY_TABLE {
            if !ROUND4_CONSUMER_SECTIONS.contains(&row.decision) {
                continue;
            }
            for path in row.file_candidates {
                assert_ne!(path, &"src/architecture/io_boundary_round3.rs");
                assert_ne!(path, &"src/architecture/round3_scope_rootcause.rs");
            }
        }
        // Every round-4 scope-change target is referenced by at least one
        // consumer row, except backend.rs which is wired by §62.39–62.41.
        for target in ROUND4_SCOPE_TARGETS {
            let referenced = ROUND4_IO_BOUNDARY_TABLE.iter().any(|row| {
                ROUND4_CONSUMER_SECTIONS.contains(&row.decision)
                    && row.file_candidates.contains(target)
            });
            if target != &"src/runtime/backend.rs" {
                assert!(
                    referenced,
                    "scope target {target} must be referenced by a consumer row"
                );
            }
        }
    }
}
