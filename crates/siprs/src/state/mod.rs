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
//   - NODE_ID=N0021:  §15 M20 NativeEvent to SipEventPayload Conversion
//   - NODE_ID=N0022:  §15 M20 CallState & CallMediaState Mapping
//   - NODE_ID=N0023:  §15 M20 RegistrationStateChanged RuntimeCommand Pattern
//   - NODE_ID=N0025:  §17 Registration State Machine
//   - NODE_ID=N0026:  §18 Call State Model
//   - NODE_ID=N0043:  §32 Shutdown Specification
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
// ============================================================================

//! State module — event conversion mappings and state machine definitions.
//!
//! This module contains the NativeEvent to SipEventPayload conversion logic
//! (N0021, N0022, N0023) and future state machine definitions (N0025, N0026).

pub mod m20_callstate_mapping;
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
pub mod m20_native_event_conv;
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
pub mod m20_registr_cmd_pat;
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
