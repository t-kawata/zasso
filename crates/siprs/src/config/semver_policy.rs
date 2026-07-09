// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0096:  §58 セマンティックバージョニング
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --id=N0096)
//
// Cross-referenced design context:
//   - requirement/§5 機能要求の確定化 [NODE_ID=N0007]
//     (implements ← src/concurrency_model/command_serialization.rs)
//     (implements ← src/config/client_config.rs)
//     (implements ← src/config/account_config.rs)
//     (implements ← src/config/transport_config.rs)
//     (implements ← src/config/ice_stun_turn.rs)
//     (implements ← src/config/audio_backpressure.rs)
//     (implements ← src/config/codec_policy.rs)
//     (implements ← src/config/m20_codec_auto.rs)
//     (implements ← src/config/srtp_spec.rs)
//     (implements ← src/config/observability.rs)
//     (implements ← src/config/audio_device_policy.rs)
//     (implements ← src/config/defaults_and_librs.rs)
//     (implements ← src/config/semver_policy.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --id=N0007)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

