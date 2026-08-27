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
//   - NODE_ID=N0091:  62.22 raw SIP 生産経路: pjsip_module フックによる配線（Q1 / Q1a）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0091 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.

use crate::ffi::bindings;
use crate::ffi::callback::enqueue_raw_sip_bytes;
use crate::runtime::backend::map_pjsua_status;
use crate::runtime::command::ReactorError;
use std::ffi::c_char;

/// Module name literal (NUL-terminated; `slen = 17`).
const RAW_SIP_MODULE_NAME: &[u8] = b"mod_siprs_raw_sip\0";

/// Application-layer module priority minus one (sip_module.h:210 defines
/// `PJSIP_MOD_PRIORITY_APPLICATION = 64`) — the raw SIP module observes one
/// priority step before the UA layer. A literal keeps the static initializer
/// portable: bindgen may not emit the enum value under `pjsua-native`.
const RAW_SIP_MODULE_PRIORITY: i32 = 63;

/// `PJ_FALSE` as `pj_bool_t` — the PJLIB macro is not emitted by bindgen under
/// `pjsua-native`, so handlers return this portable literal.
const PJ_FALSE_BOOL: bindings::pj_bool_t = 0;

/// Observation-only `pjsip_module` feeding raw SIP bytes into the queue.
///
/// Registered once on the PJSIP endpoint after `pjsua_init`. The handlers copy
/// `pkt_info.packet[0..len]` into [`enqueue_raw_sip_bytes`] and return
/// `PJ_FALSE` so PJSIP keeps dispatching the message to later modules.
///
/// # Safety
///
/// `RAW_SIP_MODULE` is written exactly once from [`register`]; the PJSIP
/// endpoint mutates only `id` on registration. Handlers read it immutably on
/// the transport thread. The `name` string is a `'static` literal that outlives
/// the endpoint.
static mut RAW_SIP_MODULE: bindings::pjsip_module = bindings::pjsip_module {
    name: bindings::pj_str_t {
        ptr: RAW_SIP_MODULE_NAME.as_ptr() as *mut c_char,
        slen: (RAW_SIP_MODULE_NAME.len() - 1) as _,
    },
    id: -1,
    priority: RAW_SIP_MODULE_PRIORITY,
    load: None,
    start: None,
    stop: None,
    unload: None,
    on_rx_request: Some(raw_sip_on_rx_request),
    on_rx_response: Some(raw_sip_on_rx_response),
    on_tx_request: None,
    on_tx_response: None,
    on_tsx_state: None,
    // Module list linkage — PJSIP appends the module on registration.
    next: std::ptr::null_mut(),
    prev: std::ptr::null_mut(),
};

/// Observation-only request handler: capture the raw bytes, then defer.
unsafe extern "C" fn raw_sip_on_rx_request(
    rdata: *mut bindings::pjsip_rx_data,
) -> bindings::pj_bool_t {
    capture_raw_sip_message(rdata);
    PJ_FALSE_BOOL
}

/// Observation-only response handler: capture the raw bytes, then defer.
unsafe extern "C" fn raw_sip_on_rx_response(
    rdata: *mut bindings::pjsip_rx_data,
) -> bindings::pj_bool_t {
    capture_raw_sip_message(rdata);
    PJ_FALSE_BOOL
}

/// Copy `pkt_info.packet[0..len]` into the raw SIP queue.
///
/// Non-positive lengths are skipped (the queue never carries empty packets);
/// the queue itself is loss-tolerant (full queue drops + increments the
/// counter), so the transport thread never blocks or panics.
///
/// # Safety
///
/// `rdata` must be a valid, initialized `pjsip_rx_data` for the call duration.
unsafe fn capture_raw_sip_message(rdata: *mut bindings::pjsip_rx_data) {
    if rdata.is_null() {
        return;
    }
    let pkt = &(*rdata).pkt_info;
    if pkt.len <= 0 {
        return;
    }
    let raw = std::slice::from_raw_parts(pkt.packet.as_ptr() as *const u8, pkt.len as usize);
    enqueue_raw_sip_bytes(raw.to_vec());
}

/// Register the raw SIP module on the endpoint.
///
/// `endpt` comes from `pjsua_get_pjsip_endpt()` (valid only after `pjsua_init`).
/// Returns `Ok(())` on `PJ_SUCCESS`, otherwise `ReactorError::NativeError`.
///
/// # Safety
///
/// `endpt` must be a live `pjsip_endpoint` pointer obtained from
/// `pjsua_get_pjsip_endpt()` after `pjsua_init`; passing an invalid or dangling
/// pointer is undefined behavior inside PJSIP. The registration must happen
/// exactly once per `initialize` — the module's `id` field is written by PJSIP.
pub unsafe fn register(endpt: *mut bindings::pjsip_endpoint) -> Result<(), ReactorError> {
    // SAFETY: endpt is a live endpoint returned by pjsua_get_pjsip_endpt after
    // pjsua_init (caller contract); addr_of_mut! hands PJSIP a raw pointer to the
    // static module so no reference to the mutable static is formed (single
    // registration per initialize, so no aliasing write exists).
    let module = std::ptr::addr_of_mut!(RAW_SIP_MODULE);
    let status = bindings::pjsip_endpt_register_module(endpt, module);
    map_pjsua_status(status, "raw_sip_module_register")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::callback::{install_raw_sip_queue, try_pop_raw_sip_bytes};

    /// Serializes tests that swap the shared raw-SIP queue. Rust runs tests in
    /// parallel by default, so two tests calling `install_test_raw_sip_queue`
    /// race and leak queue state into a sibling test (flaky). Acquiring this
    /// guard makes them mutually exclusive (P17-4, boy-scout: test-isolation fix
    /// for a pre-existing race).
    static RAW_SIP_QUEUE_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Swap in a fresh raw-SIP queue with the given capacity (P16-4 §62.13).
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    fn install_test_raw_sip_queue(capacity: usize) {
        install_raw_sip_queue(crossbeam_queue::ArrayQueue::new(capacity));
    }

    /// @verifies C122
    #[test]
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    fn raw_sip_module_static_init_sets_name_id_priority_handlers() {
        // Precondition: RAW_SIP_MODULE is statically initialized for registration.
        // `addr_of!` + deref avoids the `static_mut_refs` lint (no reference to
        // the mutable static is ever formed).
        let module = unsafe { &*std::ptr::addr_of!(RAW_SIP_MODULE) };
        assert_eq!(module.id, -1);
        assert_eq!(
            module.priority,
            bindings::PJSIP_MOD_PRIORITY_APPLICATION - 1
        );
        assert!(module.on_rx_request.is_some());
        assert!(module.on_rx_response.is_some());
        assert_eq!(
            module.name.slen,
            (RAW_SIP_MODULE_NAME.len() - 1) as i32,
            "module name must be \"mod_siprs_raw_sip\""
        );
    }

    /// @verifies C122
    #[test]
// [::TICKET::] P17-2, P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-2|P17-4) --for-spec --no-implementation-order`.
    fn capture_raw_sip_message_roundtrips_packet_bytes() {
        // P17-4 (boy-scout): guard the shared queue so a parallel sibling test
        // swapping it cannot leak state into this roundtrip.
        let _queue_guard = RAW_SIP_QUEUE_GUARD
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        // Postcondition: pkt_info.packet[0..len] flows into the raw SIP queue.
        install_test_raw_sip_queue(4);
        let mut rdata: bindings::pjsip_rx_data = unsafe { std::mem::zeroed() };
        let bytes: &[u8] = b"INVITE sip:x SIP/2.0\r\n\r\n";
        for (i, &b) in bytes.iter().enumerate() {
            rdata.pkt_info.packet[i] = b as _;
        }
        rdata.pkt_info.len = bytes.len() as _;
        unsafe { capture_raw_sip_message(&mut rdata) };
        assert_eq!(try_pop_raw_sip_bytes().as_deref(), Some(bytes));
        assert_eq!(try_pop_raw_sip_bytes(), None);
    }

    /// @verifies C122
    #[test]
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    fn handlers_return_false_and_do_not_mutate_rdata() {
        // Invariant: observation-only — PJ_FALSE and no pkt_info mutation.
        let mut rdata: bindings::pjsip_rx_data = unsafe { std::mem::zeroed() };
        let before_len = rdata.pkt_info.len;
        let before_packet = rdata.pkt_info.packet;
        let handled =
            unsafe { (*std::ptr::addr_of!(RAW_SIP_MODULE)).on_rx_request.unwrap()(&mut rdata) };
        assert_eq!(handled, bindings::PJ_FALSE);
        assert_eq!(rdata.pkt_info.len, before_len);
        assert_eq!(rdata.pkt_info.packet, before_packet);
    }

    /// @verifies C122
    #[test]
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    fn register_success_records_module_pointer() {
        // Precondition: pjsip_module registration is available on the endpoint.
        bindings::stub_test_hooks::set_register_module_status(bindings::PJ_SUCCESS);
        let result = unsafe { register(std::ptr::null_mut()) };
        assert!(result.is_ok());
        assert_eq!(
            bindings::stub_test_hooks::last_registered_module(),
            std::ptr::addr_of!(RAW_SIP_MODULE) as usize
        );
    }

    /// @verifies C123
    #[test]
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    fn register_maps_non_success_to_native_error() {
        // Postcondition (failure): non-success status maps to ReactorError::NativeError.
        bindings::stub_test_hooks::set_register_module_status(bindings::PJ_EINVALIDOP);
        let result = unsafe { register(std::ptr::null_mut()) };
        assert!(matches!(
            result,
            Err(ReactorError::NativeError {
                native_status,
                ..
            }) if native_status == bindings::PJ_EINVALIDOP
        ));
        bindings::stub_test_hooks::set_register_module_status(bindings::PJ_SUCCESS);
    }

    /// @verifies C122
    #[test]
// [::TICKET::] P17-2, P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P17-2|P17-4) --for-spec --no-implementation-order`.
    fn capture_skips_non_positive_length_without_panic() {
        // P17-4 (boy-scout): guard the shared queue so a parallel sibling test
        // swapping it cannot leak state into this boundary check.
        let _queue_guard = RAW_SIP_QUEUE_GUARD
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        // Boundary: len <= 0 must not panic and must not enqueue.
        install_test_raw_sip_queue(2);
        let mut rdata: bindings::pjsip_rx_data = unsafe { std::mem::zeroed() };
        rdata.pkt_info.len = -1;
        unsafe { capture_raw_sip_message(&mut rdata) };
        rdata.pkt_info.len = 0;
        unsafe { capture_raw_sip_message(&mut rdata) };
        assert_eq!(try_pop_raw_sip_bytes(), None);
    }
}
