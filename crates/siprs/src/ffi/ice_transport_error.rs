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
//   - NODE_ID=N0108:  ICE transport error
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0108 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::ffi::bindings;
use crate::ffi::callback::enqueue_native_event;
use crate::state::m20_native_event_conv::NativeEvent;

/// ICE-operation argument type for `on_ice_transport_error`.
///
/// Under `pjsua-native`, bindgen generates `pj_ice_strans_op` as a Rust enum
/// (`BINDGEN_ENUM_TYPES`, §62.33); in the stub build the same name is a module
/// of `u32` constants, so the callback parameter is the scalar `u32` there. The
/// alias keeps the extern "C" signature ABI-compatible in both modes (P19-2 /
/// N0108).
#[cfg(feature = "pjsua-native")]
// [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
type IceStransOpParam = bindings::pj_ice_strans_op;
#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
type IceStransOpParam = u32;

/// Callback for ICE media transport errors (P19-2 §62.39 / N0108).
///
/// PJSIP reports errors in the ICE media transport — currently TURN Refresh
/// failures. The callback runs on a real-time thread: it copies the error
/// parameters into a scalar-only `NativeEvent::IceTransportError` and enqueues
/// it without locking, allocating, or awaiting.
///
/// # Safety
/// Must only be invoked from a PJSIP callback context. `param` is never
/// dereferenced (PJSIP documents it as always NULL).
#[no_mangle]
pub unsafe extern "C" fn on_ice_transport_error(
    index: std::os::raw::c_int,
    op: IceStransOpParam,
    status: bindings::pj_status_t,
    _param: *mut std::ffi::c_void,
) {
    enqueue_native_event(NativeEvent::IceTransportError {
        index,
        operation: op as u32,
        status,
    });
}
