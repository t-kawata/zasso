// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P3-2: FFI module — PJSIP unsafe binding isolation.
// All unsafe code in this crate lives exclusively in this module
// and its submodules. The rest of the crate (runtime/, client.rs, etc.)
// must use only safe abstractions from ffi::pj_str, ffi::bindings.

/// Bindgen-generated re-exports: pjsua_*, pj_*, PJSUA_*, PJ_*.
///
/// When the `pjsua-native` feature is not enabled, this module provides
/// stub type aliases (e.g. `pjsua_acc_id = i32`) that allow the rest
/// of the crate to compile without a system PJSIP installation.
pub mod bindings;

/// Crate-internal PJSIP sentinel constants independent of bindgen output.
///
/// PJSIP 2.17.0 omits symbols such as `PJSUA_CALL_NULL`; they live here so
/// both the stub build and the native build compile (P18-1 / N0101).
pub mod constants;
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.

/// Safe wrapper for `pj_str_t` with Rust-owned `Vec<u8>` backing.
///
/// Ensures that C strings passed to PJSUA are valid for the duration
/// of the FFI call and freed when the `PjOwnedStr` is dropped.
pub mod pj_str;

/// Extern "C" callback bridge — PJSIP events → NativeEvent enqueue.
///
/// Each extern C callback is minimal (no locks, no allocation, no .await):
/// it copies the event parameters into a `NativeEvent` and pushes it
/// onto the reactor's event queue.
///
pub mod callback;

/// ICE transport error callback (P19-2 §62.39 / N0108).
///
/// `on_ice_transport_error` reports errors in the ICE media transport —
/// currently TURN Refresh failures — and enqueues a scalar-only
/// `NativeEvent::IceTransportError`. Kept as a dedicated module so the
/// callback's ABI (cfg-paired `IceStransOpParam`) and the `enqueue_native_event`
/// call stay isolated from the rest of the callback bridge.
// [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
pub mod ice_transport_error;
// [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.

// Re-export the callback-bridge surface so the runtime layer and tests never
// depend on the raw module path (P11-11).
pub use callback::{
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    enqueue_native_event,
    native_event_dropped_count,
    register_callbacks,
    NATIVE_EVENT_QUEUE_CAPACITY,
};

/// Codec-enumeration surface — safe wrapper over the `pjsua_enum_codecs` path.
///
/// Exposed here so the domain layer can enumerate native codecs without
/// depending on the raw bindings module shape. Backed by the bindgen output
/// under `pjsua-native` and by the stub (zero codecs) otherwise.
pub use bindings::{enumerate_codecs, pjsua_codec_info};
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.

/// Safe PJSUA backend-call wrappers used by `PjsuaBackend` (P11-10).
///
/// Each wrapper encapsulates one `unsafe` FFI invocation and returns the raw
/// `pj_status_t` plus any out-values, so the runtime layer never touches
/// `unsafe` (C038). Feature-gated wrappers compile only under `pjsua-native`;
/// `resolve_conf_port` works in both modes via the stub alias.
// [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
pub mod backend_calls;

/// Raw SIP capture module — observation-only `pjsip_module` hook (P17-2 / N0091).
///
/// Registered on the PJSIP endpoint after `pjsua_init`; its handlers feed
/// `pjsip_rx_data.pkt_info.packet` bytes into the raw SIP queue via
/// [`callback::enqueue_raw_sip_bytes`] and return `PJ_FALSE` (observation-only).
// [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
pub mod raw_sip_module;

/// pjmedia_port adapter — wraps a `RustMediaPort` into a `pjmedia_port` for
/// `pjsua_conf_add_port` (PX-3 / N0049 §39, N0085 §62.16).
///
/// Compiled under test (default build) so the RT callbacks and the adapter
/// construction are unit-testable against the deterministic stubs; the native
/// build compiles it for the real conf-bridge registration.
#[cfg(any(test, feature = "pjsua-native"))]
// [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
pub mod media_port_adapter;

/// Transport creation wiring — `TransportConfig` (§12) → PJSIP transport.
///
/// Maps the domain transport kind + bind address, builds the
/// `pjsua_transport_config`, and orchestrates native transport create/destroy
/// for `PjsuaBackend::initialize` / `shutdown` (P16-2 / N0080). The pure mapping
/// and orchestration compile in the default (stub) build; the FFI delegation
/// lives behind `pjsua-native`.
pub mod transport_wiring;
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.

pub use transport_wiring::{
    resolve_bound_addr_string, resolve_transport_kind_and_bind_addr, transport_kind_label,
    TransportKind,
};
