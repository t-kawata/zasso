// [::TICKET::] P0-3: TransportConfig type placeholder.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
//
// [::STUB::] P3-1: Full transport management (N0015: §12 TransportConfig & §13 ICE/STUN/TURN).
// Transport creation, lifecycle, and enumeration are deferred to P3-1
// when the FFI layer (P3-2) is available.

/// Transport protocol type for SIP signalling.
///
/// [::STUB::] P3-1: Replace string with proper enum (Udp, Tcp, Tls).
#[derive(Debug, Clone)]
pub enum TransportType {
    Udp,
    Tcp,
    Tls,
}

/// Configuration for a SIP transport.
///
/// Each `SipClient` can bind multiple transports for SIP signalling.
///
/// [::STUB::] P3-1: Add transport lifecycle (create, destroy, enumerate)
/// and ICE/TURN/STUN configuration fields.
#[derive(Debug, Clone)]
pub struct TransportConfig {
    /// Transport protocol type.
    pub transport_type: TransportType,
    /// Port to bind for SIP signalling.
    pub port: u16,
    /// Optional TLS configuration — populated when `transport_type == Tls`.
    pub tls_config: Option<String>,
}
