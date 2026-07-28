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
//   - NODE_ID=N0038:  §27 M20 Dual Client PJSIP Callback Routing
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0038 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// ============================================================================
// M20 Dual Client PJSIP Callback Routing
//
// This module implements the account_id-based EventBus routing for multiple
// SipClient instances sharing a single PjsuaBackend singleton.
//
// Architecture (RFC §27 M20 Dual Client):
//   single Reactor (global_runtime) + EventBus split per SipClient
//   Reactor holds:
//     - default_event_bus: EventBus     — for non-account-specific events
//     - routing_table: HashMap<AccountId, EventBus>  — account_id → client EventBus
//     - call_owner: HashMap<CallId, AccountId>       — call_id → account_id
//
// Reads as: "Route a SipEvent to the correct client EventBus by account_id;
// non-account events go to the default EventBus; unknown account_ids fall
// back to the default EventBus."
// ============================================================================

// [::STUB::] P0-5: RoutingError, SipEvent, SipEventMeta, EventBus, CallEventRouter,
// dispatch_event, register_client_event_bus, unregister_client_event_bus are consumed
// by the P0-5 reactor layer. Dead-code warnings are expected until P0-5 ships and
// instantiates these items. Once P0-5 is implemented, remove this allow.
#![allow(dead_code)]

use crate::concurrency_contexts::command_serialization::{AccountId, CallId};
use crate::state::m20_native_event_conv::SipEventPayload;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::broadcast;

// ============================================================================
// Constants
// ============================================================================

/// Default capacity for the broadcast channel backing each EventBus.
pub(crate) const DEFAULT_BROADCAST_CHANNEL_CAPACITY: usize = 256;

// ============================================================================
// RoutingError — typed errors for the routing layer
// ============================================================================

/// Errors that can occur during event dispatch.
///
/// Reads as: "The dispatcher failed because the account_id is unknown,
/// the bus is closed, or the channel is full."
#[derive(Debug, thiserror::Error)]
pub(crate) enum RoutingError {
    #[error("no EventBus registered for account {0}")]
    UnknownAccount(AccountId),

    #[error("EventBus for account {0} is closed")]
    BusClosed(AccountId),

    #[error("broadcast channel error: {0}")]
    ChannelError(#[from] broadcast::error::SendError<SipEvent>),
}

// ============================================================================
// SipEvent — event envelope with routing metadata
// ============================================================================

/// Metadata attached to every SipEvent, providing routing context.
///
/// The `account_id` field is the primary routing key — if None, the event
/// is a non-account event (client lifecycle, transport state, etc.) and
/// goes to the default EventBus.
///
/// The `call_id` field enables the CallEventRouter to resolve which account
/// owns a call when only call_id is available (CallStateChanged, etc.).
#[derive(Debug, Clone)]
pub(crate) struct SipEventMeta {
    pub account_id: Option<AccountId>,
    pub call_id: Option<CallId>,
}

/// A routed event combining metadata and a typed payload.
///
/// Reads as: "A SipEvent has routing metadata and a payload describing
/// the event that occurred."
#[derive(Debug, Clone)]
pub(crate) struct SipEvent {
    pub meta: SipEventMeta,
    pub payload: SipEventPayload,
}

// ============================================================================
// EventBus — per-client broadcast channel for SipEvents
// ============================================================================

/// Per-client event distribution bus backed by `tokio::sync::broadcast`.
///
/// Each SipClient owns one EventBus. The Reactor holds a routing table
/// mapping AccountIds to the correct EventBus, and calls `publish()` to
/// deliver events.
///
/// Multiple clones of an EventBus share the same broadcast channel
/// (via `Arc::clone` on the sender). This allows the Reactor to hold
/// entries in its routing table while the SipClient holds the subscribe
/// side.
///
/// Identity comparison (for unregister operations) uses `Arc::ptr_eq`
/// on the shared sender — two EventBus instances that are clones of
/// each other share the same Arc and compare as equal.
#[derive(Debug)]
pub(crate) struct EventBus {
    sender: Arc<broadcast::Sender<SipEvent>>,
    /// Anchor receiver kept alive to prevent `send()` from returning
    /// a "no receivers" error.
    // [::STUB::] P1-4: anchor field is intentionally dead_code — kept alive for
    // its side effect (keeping the broadcast channel open). Remove this allow
    // once the P0-5 Reactor consumes EventBus externally.
    #[allow(dead_code)]
    anchor: broadcast::Receiver<SipEvent>,
}

impl EventBus {
    /// Create a new EventBus with the default broadcast channel capacity.
    pub(crate) fn new() -> Self {
        let (sender, receiver) = broadcast::channel(DEFAULT_BROADCAST_CHANNEL_CAPACITY);
        EventBus {
            sender: Arc::new(sender),
            anchor: receiver,
        }
    }

    /// Publish an event to all subscribers of this bus.
    ///
    /// Returns `Ok(())` on success, or `RoutingError::ChannelError` if
    /// the channel is full.
    pub(crate) fn publish(&self, event: SipEvent) -> Result<(), RoutingError> {
        // The anchor receiver ensures send() never returns "no receivers."
        self.sender.send(event)?;
        Ok(())
    }

    /// Subscribe to receive events from this bus.
    ///
    /// Each call to `subscribe()` returns a new independent receiver.
    /// The receiver lags to the oldest unread event; old events are
    /// dropped if the channel capacity is exceeded.
    pub(crate) fn subscribe(&self) -> broadcast::Receiver<SipEvent> {
        self.sender.subscribe()
    }
}

// Manual Clone: Arc is cloned (shared channel), but Receiver is not Clone,
// so we create a fresh anchor from the shared sender.
impl Clone for EventBus {
    fn clone(&self) -> Self {
        EventBus {
            sender: Arc::clone(&self.sender),
            anchor: self.sender.subscribe(),
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// CallEventRouter — call_id to account_id mapping
// ============================================================================

/// Maintains the mapping from CallId to owning AccountId.
///
/// Call events (CallStateChanged, CallMediaStateChanged) from PJSIP carry
/// only `call_id`, not `acc_id`. The Reactor needs this mapping to route
/// call events to the correct client EventBus.
///
/// The mapping is populated when:
///   - An outgoing call is created (MakeCall → account's client records it)
///   - An incoming call arrives (on_incoming_call callback → resolve account)
///
/// Reads as: "A router that resolves which account owns a call."
pub(crate) struct CallEventRouter {
    /// Map from active CallId to the owning AccountId.
    call_owner: Mutex<HashMap<CallId, AccountId>>,
}

impl CallEventRouter {
    /// Create an empty CallEventRouter.
    pub(crate) fn new() -> Self {
        CallEventRouter {
            call_owner: Mutex::new(HashMap::new()),
        }
    }

    /// Record that a call with `call_id` is owned by `account_id`.
    ///
    /// Called when an account creates or receives a call.
    pub(crate) fn register_call(&self, call_id: CallId, account_id: AccountId) {
        let mut map = self.call_owner.lock().expect("CallEventRouter lock");
        map.insert(call_id, account_id);
    }

    /// Look up the account_id that owns the given call_id.
    ///
    /// Returns None if the call_id is not in the mapping (call ended or
    /// never registered).
    pub(crate) fn resolve_account_for_call(&self, call_id: CallId) -> Option<AccountId> {
        let map = self.call_owner.lock().expect("CallEventRouter lock");
        map.get(&call_id).copied()
    }

    /// Remove a completed call from the mapping.
    pub(crate) fn unregister_call(&self, call_id: CallId) {
        let mut map = self.call_owner.lock().expect("CallEventRouter lock");
        map.remove(&call_id);
    }
}

impl Default for CallEventRouter {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Reactor routing methods
// ============================================================================

/// The Reactor's routing table and dispatch logic.
///
/// These methods are intended to be added to the Reactor struct (P0-5).
/// For P1-4 they exist as standalone functions accepting the routing
/// state as explicit parameters, making them testable in isolation
/// without a full Reactor instance.
///
/// The `dispatch_event` function implements the RFC §27 pseudo-code:
///
///   match event.meta.account_id {
///       Some(aid) => lookup aid in routing_table → publish or default fallback
///       None      => default_event_bus.publish(event)
///   }
///
/// Reads as: "Given the routing state, dispatch a SipEvent to the
/// correct EventBus based on account_id."
pub(crate) fn dispatch_event(
    event: SipEvent,
    default_event_bus: &EventBus,
    routing_table: &HashMap<AccountId, EventBus>,
) -> Result<(), RoutingError> {
    match event.meta.account_id {
        Some(account_id) => {
            if let Some(client_bus) = routing_table.get(&account_id) {
                client_bus.publish(event)
            } else {
                // Unknown account_id — fall back to the default EventBus.
                default_event_bus.publish(event)
            }
        }
        None => {
            // Non-account event — publish to the default EventBus only.
            default_event_bus.publish(event)
        }
    }
}

/// Register a client EventBus in the routing table, mapping it to the
/// given account_ids.
///
/// If an AccountId is already mapped, the previous mapping is overwritten
/// (last-writer-wins). This is intentional — re-registration replaces
/// stale entries.
pub(crate) fn register_client_event_bus(
    routing_table: &mut HashMap<AccountId, EventBus>,
    bus: EventBus,
    account_ids: Vec<AccountId>,
) {
    for aid in account_ids {
        routing_table.insert(aid, bus.clone());
    }
}

/// Remove all AccountId entries for the given EventBus from the routing table.
///
/// Returns the list of AccountIds that were removed.
pub(crate) fn unregister_client_event_bus(
    routing_table: &mut HashMap<AccountId, EventBus>,
    bus: &EventBus,
) -> Vec<AccountId> {
    let mut removed = Vec::new();
    routing_table.retain(|aid, existing_bus| {
        // Compare by Arc pointer identity — EventBus clones share the
        // same Arc<broadcast::Sender<SipEvent>>, so Arc::ptr_eq reliably
        // identifies buses from the same clone family.
        let is_same_bus =
            Arc::ptr_eq(&existing_bus.sender, &bus.sender);
        if is_same_bus {
            removed.push(*aid);
        }
        !is_same_bus
    });
    removed
}

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =======================================================================
    // C039-precondition — NativeEvent/AccountId/CallId are constructable
    // =======================================================================

    /// @verifies C039-precondition
    #[test]
    fn c039_precondition_native_event_constructable() {
        // NativeEvent is defined in m20_native_event_conv.rs — verify it
        // can be constructed with AccountId and CallId values.
        use crate::state::m20_native_event_conv::NativeEvent;

        let acc_id = AccountId(42);
        let call_id = CallId(100);

        let reg_event = NativeEvent::RegistrationStateChanged { acc_id };
        let call_event = NativeEvent::CallStateChanged {
            call_id,
            state: 0,
        };

        // Verify the values are carried correctly.
        match reg_event {
            NativeEvent::RegistrationStateChanged { acc_id: a } => assert_eq!(a, AccountId(42)),
            _ => panic!("unexpected variant"),
        }
        match call_event {
            NativeEvent::CallStateChanged { call_id: c, .. } => assert_eq!(c, CallId(100)),
            _ => panic!("unexpected variant"),
        }
    }

    /// @verifies C039-precondition
    #[test]
    fn c039_precondition_account_id_as_hashmap_key() {
        let mut table: HashMap<AccountId, String> = HashMap::new();
        table.insert(AccountId(1), "client_a".to_string());
        table.insert(AccountId(2), "client_b".to_string());

        assert_eq!(table.get(&AccountId(1)).unwrap(), "client_a");
        assert_eq!(table.get(&AccountId(2)).unwrap(), "client_b");
        assert!(table.get(&AccountId(3)).is_none());
    }

    // =======================================================================
    // C039-postcondition — dispatch_event routes correctly
    // =======================================================================

    /// @verifies C039-postcondition
    #[tokio::test]
    async fn c039_postcondition_routes_to_matched_client_bus() {
        let default_bus = EventBus::new();
        let bus_a = EventBus::new();
        let bus_b = EventBus::new();

        // Subscribe BEFORE dispatching — events are received by existing subscribers.
        let mut rx_a = bus_a.subscribe();
        let mut rx_b = bus_b.subscribe();
        let mut rx_default = default_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        routing_table.insert(AccountId(1), bus_a.clone());
        routing_table.insert(AccountId(2), bus_b.clone());

        let event = SipEvent {
            meta: SipEventMeta {
                account_id: Some(AccountId(1)),
                call_id: None,
            },
            payload: SipEventPayload::RegistrationStarted,
        };

        dispatch_event(event, &default_bus, &routing_table).unwrap();

        // bus_a should have received the event; bus_b should not.
        assert!(
            rx_a.try_recv().is_ok(),
            "matched bus must receive the event"
        );
        assert!(
            rx_b.try_recv().is_err(),
            "other client bus must not receive the event"
        );
        assert!(
            rx_default.try_recv().is_err(),
            "default bus must not receive the event when a client bus matches"
        );
    }

    /// @verifies C039-postcondition
    #[tokio::test]
    async fn c039_postcondition_non_account_goes_to_default() {
        let default_bus = EventBus::new();
        let client_bus = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx_default = default_bus.subscribe();
        let mut rx_client = client_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        routing_table.insert(AccountId(1), client_bus.clone());

        let event = SipEvent {
            meta: SipEventMeta {
                account_id: None,
                call_id: None,
            },
            payload: SipEventPayload::DtmfReceived,
        };

        dispatch_event(event, &default_bus, &routing_table).unwrap();

        assert!(
            rx_default.try_recv().is_ok(),
            "default bus must receive non-account events"
        );
        assert!(
            rx_client.try_recv().is_err(),
            "client bus must not receive non-account events"
        );
    }

    /// @verifies C039-postcondition
    #[tokio::test]
    async fn c039_postcondition_unknown_account_falls_to_default() {
        let default_bus = EventBus::new();
        let client_bus = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx_default = default_bus.subscribe();
        let mut rx_client = client_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        routing_table.insert(AccountId(1), client_bus.clone());

        let event = SipEvent {
            meta: SipEventMeta {
                account_id: Some(AccountId(999)),
                call_id: None,
            },
            payload: SipEventPayload::RegistrationStarted,
        };

        dispatch_event(event, &default_bus, &routing_table).unwrap();

        assert!(
            rx_default.try_recv().is_ok(),
            "unknown account_id must fall back to default bus"
        );
        assert!(
            rx_client.try_recv().is_err(),
            "client bus must not receive events for unknown account_ids"
        );
    }

    // =======================================================================
    // C039-invariant — single Reactor + at-most-once delivery
    // =======================================================================

    /// @verifies C039-invariant
    #[tokio::test]
    async fn c039_invariant_at_most_one_bus_receives() {
        let default_bus = EventBus::new();
        let bus_a = EventBus::new();
        let bus_b = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx_a = bus_a.subscribe();
        let mut rx_b = bus_b.subscribe();
        let mut rx_default = default_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        routing_table.insert(AccountId(1), bus_a.clone());
        routing_table.insert(AccountId(2), bus_b.clone());

        // Dispatch an event for account_id=1 — only bus_a should receive it.
        let event = SipEvent {
            meta: SipEventMeta {
                account_id: Some(AccountId(1)),
                call_id: None,
            },
            payload: SipEventPayload::CallConnected,
        };
        dispatch_event(event, &default_bus, &routing_table).unwrap();

        // Exactly one of the client buses should receive it.
        let a_received = rx_a.try_recv().is_ok();
        let b_received = rx_b.try_recv().is_ok();
        assert!(a_received || b_received, "at least one bus must receive");
        assert!(
            !(a_received && b_received),
            "at most one bus must receive"
        );
        assert!(
            rx_default.try_recv().is_err(),
            "default bus must not receive when a client bus matches"
        );
    }

    // =======================================================================
    // Normal — register_client_event_bus
    // =======================================================================

    #[tokio::test]
    async fn register_client_event_bus_adds_mapping() {
        let default_bus = EventBus::new();
        let client_bus = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx = client_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        register_client_event_bus(
            &mut routing_table,
            client_bus.clone(),
            vec![AccountId(1), AccountId(2)],
        );

        // Both AccountIds should now route to client_bus.
        for aid in [AccountId(1), AccountId(2)] {
            let event = SipEvent {
                meta: SipEventMeta {
                    account_id: Some(aid),
                    call_id: None,
                },
                payload: SipEventPayload::RegistrationStarted,
            };
            dispatch_event(event, &default_bus, &routing_table).unwrap();

            assert!(
                rx.try_recv().is_ok(),
                "registered account {:?} must route to client bus",
                aid
            );
        }
    }

    // =======================================================================
    // Error — duplicate account_id
    // =======================================================================

    #[tokio::test]
    async fn duplicate_account_id_overwrites_mapping() {
        let default_bus = EventBus::new();
        let bus_a = EventBus::new();
        let bus_b = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx_b = bus_b.subscribe();
        let mut rx_a = bus_a.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();

        // Register AccountId(1) → bus_a.
        register_client_event_bus(&mut routing_table, bus_a.clone(), vec![AccountId(1)]);
        // Overwrite AccountId(1) → bus_b.
        register_client_event_bus(&mut routing_table, bus_b.clone(), vec![AccountId(1)]);

        let event = SipEvent {
            meta: SipEventMeta {
                account_id: Some(AccountId(1)),
                call_id: None,
            },
            payload: SipEventPayload::RegistrationStarted,
        };
        dispatch_event(event, &default_bus, &routing_table).unwrap();

        assert!(
            rx_b.try_recv().is_ok(),
            "overwriting bus must receive the event"
        );
        assert!(
            rx_a.try_recv().is_err(),
            "overwritten bus must not receive the event"
        );
    }

    // =======================================================================
    // Error — unregister_client_event_bus
    // =======================================================================

    #[tokio::test]
    async fn unregister_client_event_bus_removes_mapping() {
        let default_bus = EventBus::new();
        let client_bus = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx_default = default_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        register_client_event_bus(
            &mut routing_table,
            client_bus.clone(),
            vec![AccountId(1), AccountId(2)],
        );

        let removed =
            unregister_client_event_bus(&mut routing_table, &client_bus);
        assert_eq!(removed.len(), 2, "both account_ids must be removed");
        assert!(removed.contains(&AccountId(1)));
        assert!(removed.contains(&AccountId(2)));
        assert!(
            routing_table.is_empty(),
            "routing table must be empty after unregister"
        );

        // After unregister, events for those account_ids go to default.
        let event = SipEvent {
            meta: SipEventMeta {
                account_id: Some(AccountId(1)),
                call_id: None,
            },
            payload: SipEventPayload::RegistrationStarted,
        };
        dispatch_event(event, &default_bus, &routing_table).unwrap();

        assert!(
            rx_default.try_recv().is_ok(),
            "unregistered account falls back to default bus"
        );
    }

    // =======================================================================
    // Boundary — AccountId MIN/MAX
    // =======================================================================

    #[tokio::test]
    async fn boundary_account_id_min_max() {
        let default_bus = EventBus::new();
        let client_bus = EventBus::new();

        // Subscribe BEFORE dispatching.
        let mut rx = client_bus.subscribe();

        let mut routing_table: HashMap<AccountId, EventBus> = HashMap::new();
        register_client_event_bus(
            &mut routing_table,
            client_bus.clone(),
            vec![AccountId(0), AccountId(u64::MAX)],
        );

        for aid in [AccountId(0), AccountId(u64::MAX)] {
            let event = SipEvent {
                meta: SipEventMeta {
                    account_id: Some(aid),
                    call_id: None,
                },
                payload: SipEventPayload::RegistrationStarted,
            };
            dispatch_event(event, &default_bus, &routing_table).unwrap();

            assert!(
                rx.try_recv().is_ok(),
                "boundary AccountId {:?} must route correctly",
                aid
            );
        }
    }

    // =======================================================================
    // Boundary — empty routing table
    // =======================================================================

    #[tokio::test]
    async fn empty_routing_table_default_only() {
        let default_bus = EventBus::new();
        // Subscribe BEFORE dispatching.
        let mut rx_default = default_bus.subscribe();

        let routing_table: HashMap<AccountId, EventBus> = HashMap::new();

        // Even with account_id set, an empty table routes to default.
        let event = SipEvent {
            meta: SipEventMeta {
                account_id: Some(AccountId(1)),
                call_id: None,
            },
            payload: SipEventPayload::RegistrationStarted,
        };
        dispatch_event(event, &default_bus, &routing_table).unwrap();

        assert!(
            rx_default.try_recv().is_ok(),
            "empty routing table must route to default bus"
        );
    }

    // =======================================================================
    // CallEventRouter tests
    // =======================================================================

    #[test]
    fn call_event_router_register_and_resolve() {
        let router = CallEventRouter::new();

        router.register_call(CallId(10), AccountId(1));
        router.register_call(CallId(20), AccountId(2));

        assert_eq!(
            router.resolve_account_for_call(CallId(10)),
            Some(AccountId(1)),
            "CallId 10 must resolve to AccountId 1"
        );
        assert_eq!(
            router.resolve_account_for_call(CallId(20)),
            Some(AccountId(2)),
            "CallId 20 must resolve to AccountId 2"
        );
        assert_eq!(
            router.resolve_account_for_call(CallId(999)),
            None,
            "unknown CallId must resolve to None"
        );
    }

    #[test]
    fn call_event_router_unregister() {
        let router = CallEventRouter::new();

        router.register_call(CallId(10), AccountId(1));
        assert_eq!(
            router.resolve_account_for_call(CallId(10)),
            Some(AccountId(1))
        );

        router.unregister_call(CallId(10));
        assert_eq!(
            router.resolve_account_for_call(CallId(10)),
            None,
            "unregistered call must resolve to None"
        );
    }

    #[test]
    fn call_event_router_overwrite() {
        let router = CallEventRouter::new();

        router.register_call(CallId(10), AccountId(1));
        router.register_call(CallId(10), AccountId(2));

        assert_eq!(
            router.resolve_account_for_call(CallId(10)),
            Some(AccountId(2)),
            "overwritten call_id must resolve to the new account"
        );
    }

    // =======================================================================
    // Module structure — compile-time verification
    // =======================================================================

    #[test]
    fn c039_precondition_mod_rs_declares_module() {
        let content =
            std::fs::read_to_string("src/state/mod.rs").expect("mod.rs must exist");
        assert!(
            content.contains("pub mod m20_dual_client_routing"),
            "mod.rs must declare m20_dual_client_routing"
        );
    }

    #[test]
    fn routing_error_is_debug_and_error() {
        let err = RoutingError::UnknownAccount(AccountId(42));
        let _debug = format!("{:?}", err);
        let _display = format!("{}", err);
        // Ensure both Debug and Display are implemented.
        assert!(!_debug.is_empty());
        assert!(!_display.is_empty());
    }

    #[test]
    fn event_bus_new_creates_functional_bus() {
        let bus = EventBus::new();
        // Subscribe BEFORE publishing.
        let mut rx = bus.subscribe();

        let event = SipEvent {
            meta: SipEventMeta {
                account_id: None,
                call_id: None,
            },
            payload: SipEventPayload::DtmfReceived,
        };
        bus.publish(event).unwrap();

        let received = rx.try_recv();
        assert!(received.is_ok(), "published event must be receivable");
    }

    #[test]
    fn event_bus_clone_shares_channel() {
        let bus_a = EventBus::new();
        let bus_b = bus_a.clone();

        // Subscribe on the clone BEFORE publishing on the original.
        let mut rx = bus_b.subscribe();

        // Publishing on bus_a should be received on bus_b's subscriber.
        let event = SipEvent {
            meta: SipEventMeta {
                account_id: None,
                call_id: None,
            },
            payload: SipEventPayload::RegistrationStarted,
        };
        bus_a.publish(event).unwrap();

        assert!(
            rx.try_recv().is_ok(),
            "cloned EventBus must share the broadcast channel"
        );
    }
}
