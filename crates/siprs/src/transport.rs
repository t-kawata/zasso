// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

// [::TICKET::] P3-1: TransportConfig re-export.
// TransportConfig types are defined in config::transport_ice_spec.
// This module provides a re-export for backward compatibility.

pub use crate::config::transport_ice_spec::{
    IceConfig, StunServerConfig, TransportConfig, TurnServerConfig, TurnTransport,
    UdpTransportConfig,
};

/// Transport protocol type for SIP signalling (simple enum for common use).
///
// [::STUB::] P3-1: TransportType is re-exported from transport_ice_spec; may be removed -- Remove the TransportType re-export once all callers migrate to TransportConfig directly
#[derive(Debug, Clone)]
pub enum TransportType {
    Udp,
    Tcp,
    Tls,
}
