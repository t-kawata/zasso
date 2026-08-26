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
//   - NODE_ID=N0072:  62.3 イベントバス一元化トポロジ
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0072 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::architecture::impl_integration_design::DesignDecisionId;
use crate::config::ClientConfig;

/// The unified event bus topology decision (§62.3 / N0072).
///
/// Replaces the pre-P15-4 split topology (per-account client buses plus a
/// reactor-owned default bus) with exactly ONE `EventBus` owned by `SipClient`.
/// The reactor holds a clone and publishes directly to it; subscribers filter
/// by `meta.account_id` / `meta.call_id` on the receiving side.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnifiedEventBusTopology {
    /// Single EventBus owned by SipClient; reactor `dispatch_event` publishes directly.
    SingleBus,
}

// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
impl UnifiedEventBusTopology {
    /// The §62.3 design decision this topology implements.
    pub fn design_decision(self) -> DesignDecisionId {
        DesignDecisionId::EventBusUnification
    }
}

/// Compute the raw_sip channel capacity for the client's single EventBus.
///
/// Returns `Some(config.raw_sip_event_capacity)` when raw SIP events are
/// enabled (`RawSipEventConfig::enabled`, default true), or `None` when they
/// are disabled — `None` creates no raw_sip channel (zero overhead, §15.6).
///
/// # Contract (C072 invariant)
/// The single bus keeps the §15.6 control/raw_sip split: `EventBus::new(_, Some(_))`
/// creates the raw_sip channel, `EventBus::new(_, None)` does not.
pub fn raw_sip_capacity_for(config: &ClientConfig) -> Option<usize> {
    config
        .raw_sip_events
        .enabled
        .then_some(config.raw_sip_event_capacity)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{EventMeta, SipEvent, SipEventPayload};
    use crate::api::eventbus_receiver::{AccountEventReceiver, EventBus};
    use crate::model::AccountId;

// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn test_account(value: u64) -> AccountId {
        AccountId::from_u64(value).unwrap_or_else(|error| {
            panic!("test AccountId requires a non-zero value, got {value}: {error}")
        })
    }

// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn make_event(account_id: Option<AccountId>) -> SipEvent {
        SipEvent {
            meta: EventMeta::new(1, account_id, None),
            payload: SipEventPayload::CallDisconnected,
        }
    }

    // ── C072 Precondition ───────────────────────────────────────────────

    /// @verifies C072
    #[test]
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn event_bus_unification_design_id_exists() {
        // Precondition: the §62.3 design decision is defined in impl_integration_design.rs
        // and this module references it via UnifiedEventBusTopology::design_decision().
        assert_eq!(
            DesignDecisionId::EventBusUnification.section(),
            "62.3"
        );
        assert_eq!(
            DesignDecisionId::EventBusUnification.label(),
            "62.3 イベントバス一元化トポロジ"
        );
        assert_eq!(
            UnifiedEventBusTopology::SingleBus.design_decision(),
            DesignDecisionId::EventBusUnification
        );
    }

    // ── C072 Postcondition ──────────────────────────────────────────────

    /// @verifies C072
    #[test]
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn raw_sip_capacity_for_enabled_returns_some() {
        // Postcondition: enabled=true → Some(raw_sip_event_capacity).
        let config = ClientConfig {
            raw_sip_events: crate::config::RawSipEventConfig {
                enabled: true,
                ..Default::default()
            },
            raw_sip_event_capacity: 4096,
            ..Default::default()
        };
        assert_eq!(raw_sip_capacity_for(&config), Some(4096));
    }

    /// @verifies C072
    #[test]
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn raw_sip_capacity_for_disabled_returns_none() {
        // Postcondition: enabled=false → None (no raw_sip channel is created).
        let config = ClientConfig {
            raw_sip_events: crate::config::RawSipEventConfig {
                enabled: false,
                ..Default::default()
            },
            raw_sip_event_capacity: 4096,
            ..Default::default()
        };
        assert_eq!(raw_sip_capacity_for(&config), None);
    }

    // ── C072 Invariant ──────────────────────────────────────────────────

    /// @verifies C072
    #[test]
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn eventbus_raw_sip_follows_enabled() {
        // Invariant: §15.6 — the single bus keeps the control/raw_sip split;
        // the raw_sip channel exists exactly when the capacity is Some.
        let enabled = EventBus::new(16, Some(32));
        assert!(enabled.subscribe_raw_sip().is_some());
        let disabled = EventBus::new(16, None);
        assert!(disabled.subscribe_raw_sip().is_none());
    }

    // ── C084 Precondition ───────────────────────────────────────────────

    /// @verifies C084
    #[test]
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn event_bus_types_compile() {
        // Precondition: §15 (N0018) types exist. EventBus/SipEvent/RawSipMessage are
        // Clone + Debug; AccountEventReceiver is Debug only (wraps a broadcast receiver).
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone_debug::<EventBus>();
        assert_clone_debug::<SipEvent>();
        assert_clone_debug::<crate::api::event_model_payload_bus::RawSipMessage>();
        assert_debug::<AccountEventReceiver>();
    }

    // ── C084 Invariant ──────────────────────────────────────────────────

    /// @verifies C084
    #[test]
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
    fn account_receiver_filters_matching_account() {
        // Invariant: subscribe_account filter death is resolved — on the single
        // bus, AccountEventReceiver yields only events whose meta.account_id
        // matches, skipping non-matching events.
        let bus = EventBus::new(16, None);
        let mut rx = AccountEventReceiver::new(test_account(1), bus.subscribe_control());
        bus.publish(make_event(Some(test_account(2))));
        bus.publish(make_event(Some(test_account(1))));
        let ev = rx.try_recv().unwrap_or_else(|error| {
            panic!("matching event must be delivered, got {error:?}")
        });
        assert_eq!(ev.meta.account_id, Some(test_account(1)));
    }
}
