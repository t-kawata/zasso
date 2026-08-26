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
//   - NODE_ID=N0080:  62.11 トランスポート生成配線と bindgen 整合方針
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0080 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P16-2: Transport creation wiring & bindgen alignment (§62.11 / N0080).
//
// This module holds the transport wiring for `PjsuaBackend::initialize`: it maps
// the domain `TransportConfig` (§12) onto the PJSIP transport kind + bind address,
// builds the `pjsua_transport_config`, and orchestrates create/destroy of native
// transport ids. The pure mapping and orchestration are testable in the default
// (stub) build; the FFI invocation is delegated to `backend_calls` under
// `pjsua-native` (C038 — no unsafe outside src/ffi/).

use std::net::SocketAddr;

use crate::config::transport_ice_spec::TransportConfig;
use crate::ffi::bindings;

/// Transport protocol kind, resolved from the §12 `TransportConfig` enum.
///
/// The variant set mirrors `TransportConfig` (Udp / Tcp / feature-gated Tls);
/// converting back to a PJSIP transport type is `to_pjsua_transport_type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportKind {
    /// UDP transport.
    Udp,
    /// TCP transport.
    Tcp,
    /// TLS transport (only when the `tls` feature is enabled).
    #[cfg(feature = "tls")]
    Tls,
}

/// Resolve the §12 transport kind and its bind address from a `TransportConfig`.
///
/// Reads as prose: for each transport variant, yield its kind and the unchanged
/// bind address. The match is exhaustive over `TransportConfig` — no catch-all.
pub fn resolve_transport_kind_and_bind_addr(
    transport: &TransportConfig,
) -> (TransportKind, SocketAddr) {
    match transport {
        TransportConfig::Udp(cfg) => (TransportKind::Udp, cfg.bind_addr),
        TransportConfig::Tcp(cfg) => (TransportKind::Tcp, cfg.bind_addr),
        #[cfg(feature = "tls")]
        TransportConfig::Tls(cfg) => (TransportKind::Tls, cfg.bind_addr),
    }
}

/// Human-readable label for a transport kind ("udp" / "tcp" / "tls").
///
/// Centralizes the §12 kind → string mapping that the reactor's transport
/// runtime state (`TransportRuntimeState.transport_type`) consumes.
pub fn transport_kind_label(kind: TransportKind) -> &'static str {
    match kind {
        TransportKind::Udp => "udp",
        TransportKind::Tcp => "tcp",
        #[cfg(feature = "tls")]
        TransportKind::Tls => "tls",
    }
}

/// Resolve the PJSIP `bound_addr` string for a bind address.
///
/// An unspecified address (`0.0.0.0` / `::`) yields the empty string, which
/// PJSIP interprets as "bind to all interfaces"; any concrete address yields
/// its IP string.
pub fn resolve_bound_addr_string(bind_addr: SocketAddr) -> String {
    if bind_addr.ip().is_unspecified() {
        String::new()
    } else {
        bind_addr.ip().to_string()
    }
}

/// Reflect a UDP/TCP port into a `pjsua_transport_config`.
///
/// Separated from the FFI call so the port reflection is testable in the
/// default (stub) build.
pub fn apply_transport_port(cfg: &mut bindings::pjsua_transport_config, port: u16) {
    cfg.port = port as u32;
}

/// Map a `TransportKind` to the PJSIP transport type value.
///
/// The constants mirror `enum pjsip_transport_type_e` in `pjsip/sip_transport.h`
/// (UDP=1, TCP=2, TLS=3). The symbol name differs per build — the stub declares
/// bare `PJSIP_TRANSPORT_*` constants while bindgen emits type-prefixed
/// `pjsip_transport_type_e_PJSIP_TRANSPORT_*` — so the value is resolved by a
/// cfg-paired helper; the numeric result is identical in both builds.
pub fn to_pjsua_transport_type(kind: TransportKind) -> i32 {
    match kind {
        TransportKind::Udp => transport_udp_value(),
        TransportKind::Tcp => transport_tcp_value(),
        #[cfg(feature = "tls")]
        TransportKind::Tls => transport_tls_value(),
    }
}

#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
fn transport_udp_value() -> i32 {
    bindings::pjsip_transport_type_e_PJSIP_TRANSPORT_UDP as i32
}
#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
fn transport_udp_value() -> i32 {
    bindings::PJSIP_TRANSPORT_UDP as i32
}

#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
fn transport_tcp_value() -> i32 {
    bindings::pjsip_transport_type_e_PJSIP_TRANSPORT_TCP as i32
}
#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
fn transport_tcp_value() -> i32 {
    bindings::PJSIP_TRANSPORT_TCP as i32
}

#[cfg(feature = "tls")]
#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
fn transport_tls_value() -> i32 {
    bindings::pjsip_transport_type_e_PJSIP_TRANSPORT_TLS as i32
}
#[cfg(feature = "tls")]
#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
fn transport_tls_value() -> i32 {
    bindings::PJSIP_TRANSPORT_TLS as i32
}

/// Create every transport in `transports`, collecting the native ids in order.
///
/// Fails fast: the first `create` error is returned and later transports are
/// not created, so the caller never receives a partial id list.
pub fn wire_transports<F, E>(transports: &[TransportConfig], mut create: F) -> Result<Vec<i32>, E>
where
    F: FnMut(&TransportConfig) -> Result<i32, E>,
{
    let mut ids = Vec::with_capacity(transports.len());
    for transport in transports {
        ids.push(create(transport)?);
    }
    Ok(ids)
}

/// Destroy every transport id, propagating the first failure.
///
/// Reads as prose: for each id, destroy it; if any destroy fails, the error
/// surfaces to the caller (shutdown must not swallow close failures).
pub fn destroy_transports<F, E>(ids: &[i32], mut destroy: F) -> Result<(), E>
where
    F: FnMut(i32) -> Result<(), E>,
{
    for id in ids {
        destroy(*id)?;
    }
    Ok(())
}

/// Create a native transport from a `TransportConfig`, returning `(status, id)`.
///
/// Resolves the §12 kind + bind address and delegates the FFI invocation to
/// `backend_calls::transport_create`. Only compiled under `pjsua-native`; the
/// default build exercises the pure mapping and orchestration instead.
#[cfg(feature = "pjsua-native")]
pub fn native_transport_create(transport: &TransportConfig) -> (i32, i32) {
    let (kind, bind_addr) = resolve_transport_kind_and_bind_addr(transport);
    let native_kind = to_pjsua_transport_type(kind);
    crate::ffi::backend_calls::transport_create(native_kind, bind_addr)
}

/// Destroy a native transport, returning `(status, id)`.
///
/// Delegates the FFI invocation to `backend_calls::close_transport`. Only
/// compiled under `pjsua-native`.
#[cfg(feature = "pjsua-native")]
pub fn destroy_native_transport(transport_id: i32) -> (i32, i32) {
    let status = crate::ffi::backend_calls::close_transport(transport_id);
    (status, transport_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::round2_scope_rootcause::Round2Section;
    use crate::runtime::backend::map_pjsua_status;
    use crate::runtime::command::ReactorError;

// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn udp(port: u16) -> TransportConfig {
        TransportConfig::udp(port)
    }

// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn tcp(port: u16) -> TransportConfig {
        TransportConfig::tcp(port)
    }

    #[test]
    // @verifies C092  -- precondition: §62 parent exists; 62.11 resolves to N0080
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn round2_section_resolves_62_11_to_n0080() {
        assert_eq!(Round2Section::TransportWiring.section(), "62.11");
        assert_eq!(Round2Section::TransportWiring.node_id(), "N0080");
    }

    #[test]
    // @verifies C094  -- invariant: UDP kind selection follows §12 enum
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn resolve_transport_kind_and_bind_addr_maps_udp_to_udp_kind() {
        let (kind, bind_addr) = resolve_transport_kind_and_bind_addr(&udp(5060));
        assert_eq!(kind, TransportKind::Udp);
        assert_eq!(bind_addr.port(), 5060);
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn resolve_transport_kind_and_bind_addr_maps_tcp_to_tcp_kind() {
        let (kind, bind_addr) = resolve_transport_kind_and_bind_addr(&tcp(5061));
        assert_eq!(kind, TransportKind::Tcp);
        assert_eq!(bind_addr.port(), 5061);
    }

    #[cfg(feature = "tls")]
    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn resolve_transport_kind_and_bind_addr_maps_tls_to_tls_kind() {
        let tls = TransportConfig::Tls(crate::config::transport_ice_spec::TlsTransportConfig {
            bind_addr: "0.0.0.0:5062".parse().unwrap(),
            tls: crate::config::transport_ice_spec::TlsConfig::default(),
        });
        let (kind, bind_addr) = resolve_transport_kind_and_bind_addr(&tls);
        assert_eq!(kind, TransportKind::Tls);
        assert_eq!(bind_addr.port(), 5062);
    }

    #[test]
    // @verifies C093  -- postcondition: real config reflects port (no null config)
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn apply_transport_port_reflects_port_into_config() {
        let mut cfg: bindings::pjsua_transport_config = unsafe { std::mem::zeroed() };
        apply_transport_port(&mut cfg, 5060);
        assert_eq!(cfg.port, 5060);
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn resolve_bound_addr_string_unspecified_ipv4_is_empty() {
        assert_eq!(resolve_bound_addr_string("0.0.0.0:5060".parse().unwrap()), "");
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn resolve_bound_addr_string_specific_ip_returns_ip_string() {
        assert_eq!(
            resolve_bound_addr_string("192.168.0.5:5060".parse().unwrap()),
            "192.168.0.5"
        );
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn resolve_bound_addr_string_unspecified_ipv6_is_empty() {
        assert_eq!(resolve_bound_addr_string("[::]:5060".parse().unwrap()), "");
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn transport_kind_label_returns_kind_strings() {
        assert_eq!(transport_kind_label(TransportKind::Udp), "udp");
        assert_eq!(transport_kind_label(TransportKind::Tcp), "tcp");
        #[cfg(feature = "tls")]
        assert_eq!(transport_kind_label(TransportKind::Tls), "tls");
    }

    #[test]
    // @verifies C094  -- invariant: UDP/TCP/TLS kind mapping follows §12 enum
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn to_pjsua_transport_type_maps_kinds_to_constants() {
        assert_eq!(to_pjsua_transport_type(TransportKind::Udp), 1);
        assert_eq!(to_pjsua_transport_type(TransportKind::Tcp), 2);
        #[cfg(feature = "tls")]
        assert_eq!(to_pjsua_transport_type(TransportKind::Tls), 3);
    }

    #[test]
    // @verifies C092  -- postcondition: 62.11 defines transport wiring (enumerate + collect)
    // @verifies C094  -- postcondition: config.transports enumeration collects native ids
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn wire_transports_collects_ids_for_each_transport() {
        let transports = vec![udp(5060), tcp(5061)];
        let ids = wire_transports(&transports, |_| Ok::<i32, &str>(42)).unwrap();
        assert_eq!(ids, vec![42, 42]);
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn wire_transports_stops_at_first_error() {
        let transports = vec![udp(5060), tcp(5061), tcp(5062)];
        let mut calls = 0;
        let result = wire_transports(&transports, |_| {
            calls += 1;
            if calls == 2 {
                Err("boom")
            } else {
                Ok(calls)
            }
        });
        assert!(result.is_err());
        assert_eq!(calls, 2, "must stop after the first failing transport");
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn destroy_transports_destroys_each_id() {
        let mut destroyed = Vec::new();
        destroy_transports(&[1, 2], |id| {
            destroyed.push(id);
            Ok::<(), &str>(())
        })
        .unwrap();
        assert_eq!(destroyed, vec![1, 2]);
    }

    #[test]
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn destroy_transports_propagates_error() {
        let result = destroy_transports(&[1, 2], |id| {
            if id == 2 {
                Err("close failed")
            } else {
                Ok::<(), &str>(())
            }
        });
        assert!(result.is_err());
    }

    #[test]
    // @verifies C093  -- invariant: FFI calls preserve native_status (§62.8)
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    fn map_pjsua_status_preserves_native_status() {
        let err = map_pjsua_status(70013, "transport_create").unwrap_err();
        assert!(matches!(
            err,
            ReactorError::NativeError { native_status: 70013, .. }
        ));
        assert!(map_pjsua_status(0, "transport_create").is_ok());
    }
}
