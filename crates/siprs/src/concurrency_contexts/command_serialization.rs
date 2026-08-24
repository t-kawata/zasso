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
//   - NODE_ID=N0010:  §7.2 RuntimeCommand & Command Serialization
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0010 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0010 --hops=2)
// ============================================================================

/// Single serialization point for every reactor command.
///
/// All PJSUA calls must go through the MPSC channel — no direct FFI call
/// outside the reactor thread (§7.2). Each command variant carries a typed
/// `oneshot::Sender` so the dispatcher can reply once.
#[derive(Debug)]
pub enum RuntimeCommand {
    Shutdown,
    AddAccount(crate::config::account_config_spec::AccountConfig),
    RemoveAccount(crate::runtime::state::AccountId),
    Register(crate::runtime::state::AccountId),
    Unregister(crate::runtime::state::AccountId),
    SetRegistration(crate::runtime::state::AccountId, bool),
    UpdateAccount(crate::runtime::state::AccountId, crate::config::account_config_spec::AccountConfigPatch),
    MakeCall(crate::runtime::state::AccountId, crate::api::call_types::OutgoingCallRequest),
    Answer(crate::runtime::state::AccountId, u16),
    Hangup(crate::runtime::state::AccountId, crate::call::HangupReason),
    SendDtmf(crate::runtime::state::AccountId, crate::api::call_api_semantics::DtmfMethod, String),
    ConfConnect(crate::runtime::state::AccountId),
    ConfDisconnect(crate::runtime::state::AccountId),
    AddAudioSource(crate::runtime::state::AccountId, crate::audio::AsyncAudioSourceHandle),
    RemoveAudioSource(crate::runtime::state::AccountId, u64),
    SetAudioSourceGain(crate::runtime::state::AccountId, u64, f32),
    MuteAudioSource(crate::runtime::state::AccountId, u64, bool),
    CreateTransport(crate::config::transport_ice_spec::TransportConfig),
}
