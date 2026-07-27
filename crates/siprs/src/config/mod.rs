

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.

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
//   - NODE_ID=N0005:  §4 Compliance Requirements
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0005 --hops=2)
//
// Cross-referenced design context:
//   - config/§4.1 Versioning Policy [NODE_ID=N0006]
//     (part_of ← src/config/mod.rs)
//   - config/§10 ClientConfig Full Specification [NODE_ID=N0013]
//     (depends_on ← src/config/mod.rs)
//   - config/§11 AccountConfig Full Specification [NODE_ID=N0014]
//     (depends_on ← src/config/mod.rs)
//   - config/§12 TransportConfig & §13 ICE/STUN/TURN Spec [NODE_ID=N0015]
//     (depends_on ← src/config/mod.rs)
//   - config/§28 Build Strategy & OS Dependencies [NODE_ID=N0039]
//     (depends_on ← src/config/mod.rs)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Configuration module — compliance requirements, versioning policy, and
//! client/account/transport configuration types.

// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
pub mod versioning_policy;
// [::TICKET::] P1-2: Observability — tracing spans, metrics counters/gauges, ClientCapabilities.
pub mod observability_metrics;
// [::TICKET::] P2-1: ClientConfig, ClientAudioConfig, TimeoutConfig, RawSipEventConfig, LogLevel.
// Re-exported at crate root for convenience.
pub mod client_config_spec;
// [::TICKET::] P2-2: Semver/SIP networking — versioning extension & SIP network data contracts.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub mod semver_sip_networking;
// [::TICKET::] P3-1: AccountConfig — SIP account settings with validation rules (§11).
pub mod account_config_spec;
// [::TICKET::] P3-1: TransportConfig & ICE/STUN/TURN — transport protocol configs (§12–§13).
pub mod transport_ice_spec;
// [::TICKET::] P4-3: Codec policy & fallback rules (§29) — NegotiatedCodec, CodecSelectionPolicy.
pub mod codec_policy_fallback;
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
// [::TICKET::] P3-1: M20 codec auto-mode — CodecInfoProvider, configure_codecs.
// Keep as pub(crate) to match its items' visibility.
pub(crate) mod m20_codec_auto_mode;
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.

// Re-exports for crate-root convenience
pub use account_config_spec::{
    AccountCodecPolicy, AccountConfig, AccountConfigPatch, AccountMediaConfig,
    AccountTransportPolicy, DtmfMethod, DtmfPolicy, OpusConfig,
};
pub use client_config_spec::ClientConfig;
pub use transport_ice_spec::{
    AuthOverride, IceConfig, SrtpPolicy, StunServerConfig, TcpTransportConfig, TransportConfig,
    TransportKind, TurnServerConfig, UdpTransportConfig,
};
#[cfg(feature = "tls")]
pub use transport_ice_spec::{TlsConfig, TlsTransportConfig};
