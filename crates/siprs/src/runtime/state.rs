// [::TICKET::] P3-2: runtime state — ClientState, AccountEntry, CallEntry (typed BTreeMap fields)
// [::TICKET::] P0-2: runtime state — ClientState, AccountEntry, CallEntry

use std::collections::BTreeMap;

use crate::model::id_design_newtype::{AccountId, CallId};
use crate::state::call_state_model::CallState;
use crate::state::m20_callstate_mapping::CallDirection;
use crate::state::registr_state_machine::RegistrationState;

// [::TICKET::] P3-2: TransportRuntimeState — tracks active transport configuration.
#[derive(Clone, Debug, Default)]
pub struct TransportRuntimeState {
    /// PJSIP transport_id (populated by create_transport).
    pub transport_id: i32,
    /// Transport type identifier (e.g., "udp", "tcp", "tls").
    pub transport_type: String,
    /// Port the transport is bound to.
    pub port: u16,
}

// [::TICKET::] P3-2: ClientCapabilities — describes the capabilities of the SIP stack.
#[derive(Clone, Debug, Default)]
pub struct ClientCapabilities {
    /// List of supported audio codec names.
    pub audio_codecs: Vec<String>,
    /// Maximum number of concurrent calls supported.
    pub max_calls: u32,
    /// Supported transport protocols.
    pub transport_protocols: Vec<String>,
}

/// Source-of-truth state owned exclusively by the reactor thread.
///
/// The reactor holds a local `ClientState` variable and updates it directly.
/// A `tokio::sync::RwLock<ClientStateSnapshot>` is provided on `RuntimeHandle`
/// so that user-async queries can obtain a read-only snapshot without blocking
/// the reactor.
///
/// # Lock rules
/// - Queries: `snapshot().await` → `state.inner.read().await` (non-blocking)
/// - Updates: reactor → `*state.inner.write().await = new_state`
/// - **`blocking_read()` is prohibited** — it panics inside a tokio runtime.
#[derive(Clone, Default)]
pub struct ClientState {
    pub initialized: bool,
    /// Active accounts keyed by logical account ID.
    pub accounts: BTreeMap<AccountId, AccountEntry>,
    /// Active calls keyed by logical call ID.
    pub calls: BTreeMap<CallId, CallEntry>,
    /// Runtime state for each created transport.
    pub transports: Vec<TransportRuntimeState>,
    /// Capabilities reported by the SIP backend.
    pub capabilities: ClientCapabilities,
}

/// Per-account tracking entry held in the reactor's `ClientState`.
///
/// `native_id` links the logical `AccountId` to the PJSUA native `pjsua_acc_id`.
// [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
#[derive(Clone, Debug)]
pub struct AccountEntry {
    /// Placeholder for `AccountId` — replaced in P0-3.
    pub id: u64,
    /// Placeholder for `pjsua_acc_id` — populated by FFI layer (P0-6).
    pub native_id: i32,
    /// The full account configuration — the reactor's `ClientState` is the
    /// source of truth for account config (P10-3 lifecycle).
    pub config: crate::config::account_config_spec::AccountConfig,
    /// Registration state — typed §17/§33 enum (P15-5 §62.4).
    pub registration: RegistrationState,
}

/// Per-call tracking entry held in the reactor's `ClientState`.
///
/// Does **not** contain `conf_port_id` — that is managed by `Backend`.
#[derive(Clone, Debug)]
pub struct CallEntry {
    /// Placeholder for `CallId` — replaced in P0-3.
    pub id: u64,
    /// Placeholder for `pjsua_call_id` — populated by FFI layer (P0-6).
    pub native_id: i32,
    /// The account this call belongs to.
    pub account_id: AccountId,
    /// The typed 13-state signalling state (RFC §18, P16-5 §62.14).
    pub state: CallState,
    /// Placeholder for media runtime state — replaced in P1+.
    pub media: String,
    /// Call origin — `Incoming` for `on_incoming_call`, `Outgoing` for `make_call`
    /// (P16-5 §62.14, C039 provenance — never read from the event payload).
    pub direction: CallDirection,
    /// Remote party URI — empty until the FFI layer resolves it (P16-5 §62.14).
    pub remote_uri: String,
}

/// Snapshot of the client state, guarded by `tokio::sync::RwLock`.
///
/// The reactor writes the snapshot after each state mutation so that
/// user-async query APIs can read it without blocking the reactor thread.
pub struct ClientStateSnapshot {
    inner: tokio::sync::RwLock<ClientState>,
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl ClientStateSnapshot {
    /// Creates a new snapshot initialized from `state`.
    pub fn new(state: ClientState) -> Self {
        Self {
            inner: tokio::sync::RwLock::new(state),
        }
    }

    /// Returns a read-only clone of the current state.
    ///
    /// Uses `read().await` — non-blocking inside a tokio runtime.
    /// **Never calls `blocking_read()`** — doing so would panic.
    pub async fn read(&self) -> ClientState {
        self.inner.read().await.clone()
    }

    /// Replaces the inner state with `new_state` (reactor only).
    pub async fn write(&self, new_state: ClientState) {
        *self.inner.write().await = new_state;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // AccountId/CallId newtypes are now used in ClientState BTreeMap keys.
    // FFI-level native_id↔logical_id resolution is tracked in P3-2.

    // [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn create_account_id(v: u64) -> AccountId {
        AccountId::from_u64(v).expect("test AccountId")
    }

    // [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn create_call_id(v: u64) -> CallId {
        CallId::from_u64(v).expect("test CallId")
    }

    #[tokio::test]
    // @verifies C046
    async fn client_snapshot_read_returns_consistent_clone() {
        // Arrange
        let state = ClientState::default();
        let snapshot = ClientStateSnapshot::new(state);

        // Act
        let cloned = snapshot.read().await;

        // Assert
        assert!(
            !cloned.initialized,
            "fresh ClientState must not be initialized"
        );
    }

    #[tokio::test]
    // @verifies C046
    async fn client_snapshot_write_updates_state() {
        // Arrange
        let snapshot = ClientStateSnapshot::new(ClientState::default());
        assert!(!snapshot.read().await.initialized);

        // Act
        let new_state = ClientState {
            initialized: true,
            ..Default::default()
        };
        snapshot.write(new_state).await;

        // Assert
        assert!(
            snapshot.read().await.initialized,
            "after write, initialized must be true"
        );
    }

    #[test]
    // @verifies C048
    // [::TICKET::] P0-2, P4-1, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P4-1|P16-5) --for-spec --no-implementation-order`.
    fn call_entry_has_no_conf_port_id() {
        // Contract-C048: CallEntry must NOT contain a conf_port_id field.
        // Verification: construct without conf_port_id — compiler error if field existed.
        let entry = CallEntry {
            id: 1,
            native_id: 100,
            account_id: create_account_id(1),
            state: CallState::New,
            media: "none".to_string(),
            direction: CallDirection::Outgoing,
            remote_uri: String::new(),
        };
        assert_eq!(entry.id, 1);
        assert_eq!(entry.native_id, 100);
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P0-2, P10-1, P10-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P10-1|P10-3|P15-5) --for-spec --no-implementation-order`.
    fn account_entry_links_id_to_native_id() {
        // Contract-C046 invariant: AccountEntry maps logical id to native id.
        let entry = AccountEntry {
            id: 42,
            native_id: 7,
            config: crate::config::account_config_spec::AccountConfig::default(),
            registration: RegistrationState::Idle,
        };
        assert_eq!(entry.id, 42);
        assert_eq!(entry.native_id, 7);
    }

    // Contract-C046 invariant: no blocking_read() calls in runtime module.
    // Verified at compile time — the Snapshot API only exposes async read().
    // Compile-time verification: blocking_read does not exist in this module.

    // ── P3-2: ClientState typed fields ────────────────────────────────

    #[test]
    // @verifies C046
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn client_state_default_has_empty_collections() {
        let state = ClientState::default();
        assert!(!state.initialized, "fresh ClientState: initialized=false");
        assert!(
            state.accounts.is_empty(),
            "fresh ClientState: accounts empty"
        );
        assert!(state.calls.is_empty(), "fresh ClientState: calls empty");
        assert!(
            state.transports.is_empty(),
            "fresh ClientState: transports empty"
        );
    }

    #[test]
    // @verifies C073
    // P15-5: AccountEntry.registration is a typed RegistrationState enum, not a String.
    // Compile-time proof: constructing with a RegistrationState value must compile.
    // [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn account_entry_registration_is_typed_enum() {
        let entry = AccountEntry {
            id: 1,
            native_id: 1,
            config: crate::config::account_config_spec::AccountConfig::default(),
            registration: RegistrationState::Disabled,
        };
        assert_eq!(entry.registration, RegistrationState::Disabled);
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P3-2, P4-1, P10-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P4-1|P10-3|P15-5) --for-spec --no-implementation-order`.
    fn client_state_after_account_add_accounts_populated() {
        let mut state = ClientState::default();
        let acc1 = create_account_id(1);
        let acc2 = create_account_id(2);
        state.accounts.insert(
            acc1,
            AccountEntry {
                id: 1,
                native_id: 100,
                config: crate::config::account_config_spec::AccountConfig::default(),
                registration: RegistrationState::Registered,
            },
        );
        state.accounts.insert(
            acc2,
            AccountEntry {
                id: 2,
                native_id: 101,
                config: crate::config::account_config_spec::AccountConfig::default(),
                registration: RegistrationState::Registered,
            },
        );
        assert_eq!(state.accounts.len(), 2, "two accounts must be stored");
        assert_eq!(
            state.accounts[&create_account_id(1)].native_id,
            100,
            "first account native_id correct"
        );
        assert_eq!(
            state.accounts[&create_account_id(2)].native_id,
            101,
            "second account native_id correct"
        );
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P3-2, P4-1, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P4-1|P16-5) --for-spec --no-implementation-order`.
    fn client_state_after_call_add_calls_populated() {
        let mut state = ClientState::default();
        let cid = create_call_id(1);
        state.calls.insert(
            cid,
            CallEntry {
                id: 1,
                native_id: 200,
                account_id: create_account_id(1),
                state: CallState::Calling,
                media: "none".into(),
                direction: CallDirection::Outgoing,
                remote_uri: String::new(),
            },
        );
        assert_eq!(state.calls.len(), 1, "one call must be stored");
        assert_eq!(state.calls[&create_call_id(1)].native_id, 200);
        assert_eq!(
            state.calls[&create_call_id(1)].account_id,
            create_account_id(1)
        );
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn client_state_capabilities_default() {
        let state = ClientState::default();
        assert!(state.capabilities.audio_codecs.is_empty());
        assert_eq!(state.capabilities.max_calls, 0);
        assert!(state.capabilities.transport_protocols.is_empty());
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P3-2, P11-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-7) --for-spec --no-implementation-order`.
    fn transport_runtime_state_default() {
        let transport_state = TransportRuntimeState::default();
        assert_eq!(transport_state.transport_id, 0);
        assert!(transport_state.transport_type.is_empty());
        assert_eq!(transport_state.port, 0);
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn client_state_is_cloneable() {
        let state = ClientState::default();
        let cloned = state.clone();
        assert_eq!(cloned.initialized, state.initialized);
        assert_eq!(cloned.accounts.len(), state.accounts.len());
    }
}
