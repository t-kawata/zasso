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
//   - NODE_ID=N0066:  §58 Semver Operations & §59 SIP Networking Details
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0066 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§4.1 Versioning Policy [NODE_ID=N0006]
//     (refined_by ← src/config/semver_sip_networking.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0006 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.

//! Semver Operations and SIP Networking Details.
//!
//! This module extends the baseline versioning policy (see [`versioning_policy`](crate::config::versioning_policy))
//! with 0.x-phase operations guidance and defines SIP networking data contracts
//! for TLS certificate management, DNS SRV/NAPTR resolution, and multi-network
//! interface configuration.
//!
//! See also: [`crate::config::versioning_policy`] for the baseline §4.1 policy.

/// Versioning phase of the crate.
///
/// The crate operates in one of two phases, each with distinct versioning rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionPhase {
    /// Pre-release (0.x): flexible versioning, no deprecation period required.
    /// Changes are documented in CHANGELOG.md unreleased section.
    /// Breaking changes are permitted without deprecation notice.
    PreRelease,
    /// Stable (1.0+): strict semver with cargo semver-checks.
    /// Breaking changes require a deprecation period of at least one release.
    Stable,
}

/// Versioning policy configuration.
///
/// Documents the semver operations policy for both 0.x (pre-release) and
/// 1.0+ (stable) phases. This struct extends the baseline policy defined in
/// [`versioning_policy`](crate::config::versioning_policy) with implementation guidance.
#[derive(Debug, Clone)]
pub struct VersioningPolicy {
    /// Current version phase.
    pub phase: VersionPhase,
    /// Policy for documenting changes (e.g., CHANGELOG.md unreleased section).
    pub changelog_policy: &'static str,
    /// Deprecation period requirement (only applicable in Stable phase).
    pub deprecation_period: &'static str,
}

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl VersioningPolicy {
    /// Policy for the current 0.x pre-release phase.
    ///
    /// In this phase, API stability is not guaranteed — breaking changes
    /// are permitted as needed to stabilize the API surface. All changes
    /// must be documented in CHANGELOG.md unreleased section.
    pub const PRE_RELEASE: VersioningPolicy = VersioningPolicy {
        phase: VersionPhase::PreRelease,
        changelog_policy: "Changes logged in CHANGELOG.md unreleased section. \
                            No deprecation period required in 0.x.",
        deprecation_period: "N/A (0.x phase — no deprecation period required)",
    };

    /// Policy for the future 1.0+ stable phase.
    ///
    /// Once the crate reaches 1.0, strict semver compliance applies:
    /// - cargo semver-checks in CI validates API compatibility.
    /// - Breaking changes require a deprecation period of at least one release.
    /// - MINOR releases for backward-compatible additions.
    /// - PATCH releases for bug fixes only.
    pub const STABLE: VersioningPolicy = VersioningPolicy {
        phase: VersionPhase::Stable,
        changelog_policy: "After 1.0: cargo semver-checks in CI. \
                            Breaking changes announced at least 1 release in advance.",
        deprecation_period: "Minimum 1 release deprecation notice before MAJOR breaking changes",
    };
}

/// TLS certificate management configuration.
///
/// TLS certificate information is provided to the Rust runtime via
/// [`NativeEvent::TlsCertificateInfo`].
/// The TLS handshake and certificate validation are handled entirely by
/// PJSIP/OpenSSL — this configuration only controls notification behavior.
///
/// The data contract for TlsCertificateInfo includes:
/// - `transport_id`: PJSIP transport identifier
/// - `server_name`: TLS server name
/// - `peer_cert_fingerprint`: SHA-256 certificate fingerprint
/// - `peer_cert_subject`: Certificate subject
/// - `peer_cert_issuer`: Certificate issuer
/// - `peer_cert_expiry`: Certificate expiry as i64 Unix timestamp (seconds since epoch)
/// - `verified`: TLS verification result
#[derive(Debug, Clone)]
pub struct TlsCertConfig {
    /// Whether TLS certificate monitoring is enabled.
    pub enabled: bool,
    /// Whether TLS certificate info is forwarded via NativeEvent notification.
    pub native_event_notification: bool,
}

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl TlsCertConfig {
    /// Default TLS certificate configuration with NativeEvent notifications enabled.
    pub const DEFAULT: TlsCertConfig = TlsCertConfig {
        enabled: true,
        native_event_notification: true,
    };

    /// Disables TLS certificate NativeEvent notifications.
    pub const SILENT: TlsCertConfig = TlsCertConfig {
        enabled: true,
        native_event_notification: false,
    };
}

/// DNS resolution configuration.
///
/// DNS SRV/NAPTR resolution is delegated entirely to PJSIP's built-in
/// `pjsip_resolver`. Rust code does not perform DNS resolution directly.
///
/// Resolution results are forwarded to the Rust runtime via
/// [`NativeEvent::DnsResolutionResult`] containing:
/// - `hostname`: The resolved hostname
/// - `resolved_addresses`: List of resolved IP addresses
/// - `srv_records`: SRV records (when applicable)
/// - `ttl_secs`: DNS record TTL in seconds
#[derive(Debug, Clone)]
pub struct DnsConfig {
    /// Whether DNS resolution notifications are enabled.
    pub native_event_notification: bool,
}

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl DnsConfig {
    /// Default DNS configuration with NativeEvent notifications enabled.
    pub const DEFAULT: DnsConfig = DnsConfig {
        native_event_notification: true,
    };
}

/// Multi-network interface configuration.
///
/// Transport bind addresses are configured via [`TransportConfig`] (P2-3).
/// Route control and failover are handled by the OS network stack and
/// PJSIP transport management — Rust code does not reimplement routing.
///
/// The Rust runtime monitors transport status via:
/// - [`NativeEvent::TransportDisconnected`]: Triggered when a transport connection drops.
/// - PJSIP's automatic failover between configured transports.
///
/// Example configuration:
/// ```rust,ignore
/// let config = ClientConfig {
///     transports: vec![
///         TransportConfig::udp("0.0.0.0:5060"),         // All interfaces
///         TransportConfig::tcp("192.168.1.10:5060"),     // Specific LAN interface
///         TransportConfig::tcp("10.0.0.10:5060"),        // VPN interface
///     ],
/// };
/// ```
#[derive(Debug, Clone)]
pub struct MultiNetworkConfig {
    /// Whether multi-network monitoring is enabled.
    pub enabled: bool,
    /// Whether transport disconnect events are forwarded via NativeEvent.
    pub monitor_transport_disconnect: bool,
}

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl MultiNetworkConfig {
    /// Default multi-network configuration with transport monitoring enabled.
    pub const DEFAULT: MultiNetworkConfig = MultiNetworkConfig {
        enabled: true,
        monitor_transport_disconnect: true,
    };
}
