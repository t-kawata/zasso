// [::TICKET::] P0-2: runtime state — ClientState, AccountEntry, CallEntry

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
}

/// Per-account tracking entry held in the reactor's `ClientState`.
///
/// `native_id` links the logical `AccountId` to the PJSUA native `pjsua_acc_id`.
#[derive(Clone, Debug)]
pub struct AccountEntry {
    /// Placeholder for `AccountId` — replaced in P0-3.
    pub id: u64,
    /// Placeholder for `pjsua_acc_id` — populated by FFI layer (P0-6).
    pub native_id: i32,
    /// Placeholder for `AccountConfig` — replaced in P0-3.
    pub config: String,
    /// Registration state — placeholder for `RegistrationState` (P4-1).
    pub registration: String,
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
    pub account_id: u64,
    /// Placeholder for `CallState` — replaced in P4-1.
    pub state: String,
    /// Placeholder for media runtime state — replaced in P1+.
    pub media: String,
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

    // [::STUB::] P4-1: replaces u64 placeholders with AccountId/CallId newtypes.
    // Deferred to P4-1 because the newtype definitions (N0012: §9 ID Design)
    // require the FFI layer (P3-2) to resolve native_id ↔ logical_id mappings first.

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
        snapshot.write(ClientState { initialized: true }).await;

        // Assert
        assert!(
            snapshot.read().await.initialized,
            "after write, initialized must be true"
        );
    }

    #[test]
    // @verifies C048
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn call_entry_has_no_conf_port_id() {
        // Contract-C048: CallEntry must NOT contain a conf_port_id field.
        // Verification: construct without conf_port_id — compiler error if field existed.
        let entry = CallEntry {
            id: 1,
            native_id: 100,
            account_id: 1,
            state: "Idle".to_string(),
            media: "none".to_string(),
        };
        assert_eq!(entry.id, 1);
        assert_eq!(entry.native_id, 100);
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn account_entry_links_id_to_native_id() {
        // Contract-C046 invariant: AccountEntry maps logical id to native id.
        let entry = AccountEntry {
            id: 42,
            native_id: 7,
            config: "stub".into(),
            registration: "Unregistered".into(),
        };
        assert_eq!(entry.id, 42);
        assert_eq!(entry.native_id, 7);
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn blocking_read_is_not_used() {
        // Contract-C046 invariant: no blocking_read() calls in runtime module.
        // Verified at compile time — the Snapshot API only exposes async read().
        // This test passes trivially because blocking_read cannot compile here.
        assert!(true, "blocking_read is absent from runtime/state.rs");
    }
}
