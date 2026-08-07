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
//   - NODE_ID=N0065:  §57 Test Strategy Layer 5 — API Integration
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0065 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P12-10: Layer 5 API integration test modules.
// Full integration tests for REST and WebSocket endpoints live in
// siprs-server/tests/api/ and siprs-server/tests/ws/ respectively.
// These tests run in the siprs-server crate context, not siprs.
// This file carries the siprs-side Layer 5 declarations: protocol-type
// regression tests and the route-path mirror that keeps the lib and the
// server test layout in lockstep.

/// Layer 5 test module for the siprs crate.
///
/// The protocol wire types are already covered by `http_ws_protocol.rs`
/// unit tests; this module adds the cross-cutting Layer 5 assertions:
/// - route-path mirror (REST/WS constants ↔ siprs-server test files)
/// - event-audio sequence correlation (C063 invariant)
/// - auth-mode default (C064 invariant)
#[cfg(test)]
mod tests {
    use crate::api::http_ws_protocol::{
        AudioFrameHeader, SequenceGenerator, WsTextFrame, PATH_ACCOUNTS, PATH_AUTH_TOKEN,
        PATH_HEALTH, PATH_WS, PATH_WS_AUDIO,
    };
    use crate::api::standalone_server_config::{AuthMode, ServerConfig};
    use std::path::Path;

    #[test]
    // @verifies C061
    fn test_crate_license() {
        let manifest = include_str!("../../Cargo.toml");
        assert!(
            manifest.contains("MIT OR Apache-2.0"),
            "Cargo.toml must declare MIT/Apache 2.0 dual license"
        );
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    fn test_route_path_mirror() {
        // The 18 REST + 2 WS path constants must match the /api/v1/... layout.
        assert_eq!(PATH_HEALTH, "/api/v1/health");
        assert_eq!(PATH_AUTH_TOKEN, "/api/v1/auth/token");
        assert_eq!(PATH_ACCOUNTS, "/api/v1/accounts");
        assert_eq!(PATH_WS, "/api/v1/ws");
        assert_eq!(PATH_WS_AUDIO, "/api/v1/ws/audio");

        // The siprs-server test files must exist at the expected layout.
        let siprs_server_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../siprs-server");
        for rel in [
            "tests/api/health_test.rs",
            "tests/api/auth_test.rs",
            "tests/api/accounts_test.rs",
            "tests/ws/event_stream_test.rs",
        ] {
            let path = siprs_server_root.join(rel);
            assert!(
                path.exists(),
                "siprs-server test file missing: {}",
                path.display()
            );
        }
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    fn test_event_audio_seq_correlation() {
        // One SequenceGenerator feeds both event and audio frames (C063 invariant).
        let generator = SequenceGenerator::new();
        let seq_event = generator.next();
        let seq_audio = generator.next();
        assert!(seq_audio > seq_event);

        let event_frame = WsTextFrame {
            msg_type: "event".into(),
            seq: seq_event,
            payload: serde_json::json!({"kind": "ClientInitialized"}),
        };
        let audio_header = AudioFrameHeader {
            sequence_number: seq_audio,
            timestamp_ms: 0,
            frame_ms: 20,
            sample_rate: 48000,
            channels: 1,
            bits_per_sample: 16,
            call_id: 0,
            reserved: [0u8; 4],
        };
        // A seq=N event correlates with an audio frame at the same domain offset.
        // Copy out of the packed header to avoid an unaligned field reference.
        let audio_seq = audio_header.sequence_number;
        assert_eq!(audio_seq, event_frame.seq + 1);
    }

    #[test]
    // @verifies C064
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    fn test_auth_mode_default() {
        // C064 invariant: default auth mode is LocalhostOnly with no JWT secret.
        let config = ServerConfig::default();
        assert!(matches!(config.auth.mode, AuthMode::LocalhostOnly));
        assert!(config.auth.jwt_secret.is_none());
    }
}
