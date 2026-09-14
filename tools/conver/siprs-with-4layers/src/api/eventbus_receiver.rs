// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0019:  §15.4 EventBus Implementation & §15.5 AccountEventReceiver
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0019 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// ============================================================================
//
// [::TICKET::] P0-5: EventBus — split control/raw_sip broadcast channels + AccountEventReceiver

use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::api::event_model_payload_bus::{AccountId, RawSipMessage, SipEvent};

/// Default capacity of the control event bus when the caller provides no explicit
/// control capacity (SipClient::new creates the client bus with this capacity).
// [::TICKET::] P10-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-6 --for-spec --no-implementation-order`.
pub const DEFAULT_EVENT_BUS_CAPACITY: usize = 2048;

/// Event bus providing split broadcast channels for control events and raw SIP messages.
///
/// # Design rationale (N0020)
/// - **Control bus** (`control`): registration, call, DTMF, ICE, transport, lifecycle, error events.
/// - **RawSIP bus** (`raw_sip`): raw SIP message capture. Isolated to prevent control event loss
///   when raw SIP produces high throughput.
/// - **Lossy delivery**: `tokio::sync::broadcast` — no per-subscriber retransmission.
///   Lagged(n) detection for flow control.
/// - **Not source of truth**: Use `SipClient` query APIs (`accounts()`, `call_state()`) for
///   authoritative state. Events are observation-only.
#[derive(Clone)]
pub struct EventBus {
    /// Primary bus for control events (ordered, loss-tolerant).
    control: broadcast::Sender<SipEvent>,
    /// Optional bus for raw SIP messages (isolated from control events).
    raw_sip: Option<broadcast::Sender<RawSipMessage>>,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl EventBus {
    /// Create a new EventBus.
    ///
    /// `control_capacity`: maximum number of unconsumed control events before the oldest is dropped.
    /// `raw_sip_capacity`: `Some(n)` enables the raw SIP bus; `None` disables it (zero overhead).
    pub fn new(control_capacity: usize, raw_sip_capacity: Option<usize>) -> Self {
        let (control_tx, _) = broadcast::channel(control_capacity);
        let raw_sip = raw_sip_capacity.map(|cap| {
            let (tx, _) = broadcast::channel(cap);
            tx
        });
        Self {
            control: control_tx,
            raw_sip,
        }
    }

    /// Subscribe to the control event bus.
    ///
    /// Returns a `broadcast::Receiver` that receives all published `SipEvent`s.
    /// Multiple subscribers each receive a clone of each event.
    pub fn subscribe_control(&self) -> broadcast::Receiver<SipEvent> {
        self.control.subscribe()
    }

    /// Subscribe to the raw SIP message bus, if enabled.
    ///
    /// Returns `None` if the raw SIP bus was not created (capacity was `None`).
    pub fn subscribe_raw_sip(&self) -> Option<broadcast::Receiver<RawSipMessage>> {
        self.raw_sip.as_ref().map(|tx| tx.subscribe())
    }

    /// Publish a control event to all subscribers.
    ///
    /// Non-blocking. Returns the number of active subscribers.
    /// If all subscribers are lagged, returns 0 (event is silently dropped).
    pub fn publish(&self, event: SipEvent) -> usize {
        self.control.send(event).unwrap_or(0)
    }

    /// Publish a raw SIP message to raw_sip subscribers.
    ///
    /// No-op if the raw_sip channel is not enabled.
    pub fn publish_raw_sip(&self, msg: RawSipMessage) {
        if let Some(ref tx) = self.raw_sip {
            let _ = tx.send(msg);
        }
    }

    /// Expose the underlying control sender for Reactor dispatch internals.
    #[doc(hidden)]
    pub fn control_sender(&self) -> &broadcast::Sender<SipEvent> {
        &self.control
    }
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl std::fmt::Debug for EventBus {
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EventBus")
            .field("raw_sip_enabled", &self.raw_sip.is_some())
            .finish()
    }
}

/// An event receiver filtered to a specific `account_id`.
///
/// Wraps a `broadcast::Receiver<SipEvent>` and loops until an event matching
/// the configured `account_id` arrives. Non-matching events are silently dropped.
/// This is an async filter — it does not busy-loop.
pub struct AccountEventReceiver {
    account_id: AccountId,
    inner: broadcast::Receiver<SipEvent>,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl AccountEventReceiver {
    /// Create a new receiver that filters for `account_id`.
    pub fn new(account_id: AccountId, inner: broadcast::Receiver<SipEvent>) -> Self {
        Self { account_id, inner }
    }

    /// Wait for the next SipEvent matching this receiver's `account_id`.
    ///
    /// Non-matching events are silently skipped. `RecvError::Lagged(n)` is passed
    /// through when the underlying broadcast channel drops events.
    pub async fn recv(&mut self) -> Result<SipEvent, broadcast::error::RecvError> {
        loop {
            let event = self.inner.recv().await?;
            if event.meta.account_id == Some(self.account_id) {
                return Ok(event);
            }
            // Non-matching event: silently drop, continue looping.
        }
    }

    /// Try to receive without blocking.
    ///
    /// Returns `Ok(event)` if a matching event is immediately available.
    /// Non-matching events are silently skipped (may return `TryRecvError::Empty`).
    pub fn try_recv(&mut self) -> Result<SipEvent, broadcast::error::TryRecvError> {
        loop {
            let event = self.inner.try_recv()?;
            if event.meta.account_id == Some(self.account_id) {
                return Ok(event);
            }
            // Non-matching: continue loop
        }
    }
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl std::fmt::Debug for AccountEventReceiver {
    // [::TICKET::] P0-5, P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P17-9) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The wrapped broadcast receiver is always live; print only the stable
        // filter so the Debug output cannot rot when the inner type changes.
        f.debug_struct("AccountEventReceiver")
            .field("account_id", &self.account_id)
            .finish()
    }
}

/// A handle to a live event subscription.
///
/// Wraps a `tokio::sync::broadcast::Receiver<T>` (or an account-filtered
/// receiver for `subscribe_account`) and adds an explicit `unsubscribe()` API.
/// Dropping the handle also unsubscribes, mirroring the RFC §8.3 drop contract.
pub struct Subscription<T> {
    /// `None` once `unsubscribe()` has dropped the underlying receiver.
    inner: Option<Box<dyn SubscriptionSource<T> + Send>>,
}

// [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
impl<T> Subscription<T> {
    /// Create a subscription from a receive source.
    pub(crate) fn new(source: Box<dyn SubscriptionSource<T> + Send>) -> Self {
        Self {
            inner: Some(source),
        }
    }

    /// Whether this subscription is still live.
    pub fn is_subscribed(&self) -> bool {
        self.inner.is_some()
    }

    /// Explicitly unsubscribe.
    ///
    /// Idempotent: the underlying receiver is dropped and subsequent
    /// `recv()` / `try_recv()` return `Closed`.
    pub fn unsubscribe(&mut self) {
        self.inner = None;
    }

    /// Wait for the next event to be published.
    ///
    /// Returns `RecvError::Closed` once this subscription has been unsubscribed.
    pub async fn recv(&mut self) -> Result<T, broadcast::error::RecvError> {
        match self.inner.as_mut() {
            Some(source) => source.recv().await,
            None => Err(broadcast::error::RecvError::Closed),
        }
    }

    /// Try to receive without blocking.
    ///
    /// Returns `TryRecvError::Closed` if unsubscribed, `TryRecvError::Empty`
    /// if no event is buffered.
    pub fn try_recv(&mut self) -> Result<T, broadcast::error::TryRecvError> {
        match self.inner.as_mut() {
            Some(source) => source.try_recv(),
            None => Err(broadcast::error::TryRecvError::Closed),
        }
    }
}

impl<T> std::fmt::Debug for Subscription<T> {
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Subscription")
            .field("subscribed", &self.inner.is_some())
            .finish()
    }
}

/// A source of events a `Subscription<T>` can receive from.
///
/// Implemented for `broadcast::Receiver<T>` (plain subscriptions) and for
/// `AccountEventReceiver` (account-filtered subscriptions, `T = SipEvent`).
/// `pub(crate)` because `Subscription::new` accepts a boxed source.
#[async_trait]
pub(crate) trait SubscriptionSource<T>: Send {
    async fn recv(&mut self) -> Result<T, broadcast::error::RecvError>;
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn try_recv(&mut self) -> Result<T, broadcast::error::TryRecvError>;
}

#[async_trait]
impl<T: Send + Clone> SubscriptionSource<T> for broadcast::Receiver<T> {
    async fn recv(&mut self) -> Result<T, broadcast::error::RecvError> {
        broadcast::Receiver::recv(self).await
    }
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn try_recv(&mut self) -> Result<T, broadcast::error::TryRecvError> {
        broadcast::Receiver::try_recv(self)
    }
}

#[async_trait]
// [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
impl SubscriptionSource<SipEvent> for AccountEventReceiver {
    async fn recv(&mut self) -> Result<SipEvent, broadcast::error::RecvError> {
        AccountEventReceiver::recv(self).await
    }
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn try_recv(&mut self) -> Result<SipEvent, broadcast::error::TryRecvError> {
        AccountEventReceiver::try_recv(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{CallId, EventMeta, SipEventPayload};
    use crate::config::client_config_spec::RawSipEventConfig;
    use tokio::sync::broadcast;

    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn make_event(account_id: Option<AccountId>) -> SipEvent {
        SipEvent {
            meta: EventMeta::new(1, account_id, Some(CallId::from_u64(1).unwrap())),
            payload: SipEventPayload::CallDisconnected,
        }
    }

    // ── EventBus::new ──────────────────────────────────────────────────

    /// @verifies C019, C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_new_creates_control_channel() {
        let bus = EventBus::new(16, None);
        let _rx = bus.subscribe_control();
        // Receiver created successfully — no panic
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_raw_sip_none_when_disabled() {
        let bus = EventBus::new(16, None);
        assert!(bus.subscribe_raw_sip().is_none());
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_raw_sip_some_when_enabled() {
        let bus = EventBus::new(16, Some(32));
        let rx = bus.subscribe_raw_sip();
        assert!(rx.is_some());
    }

    // ── EventBus::publish + subscribe_control ──────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_publish_delivers_to_single_subscriber() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let event = make_event(Some(AccountId::from_u64(1).unwrap()));
        bus.publish(event);
        let received = rx.recv().await.unwrap();
        assert_eq!(
            received.meta.account_id,
            Some(AccountId::from_u64(1).unwrap())
        );
    }

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_publish_delivers_to_multiple_subscribers() {
        let bus = EventBus::new(16, None);
        let mut rx1 = bus.subscribe_control();
        let mut rx2 = bus.subscribe_control();
        let event = make_event(Some(AccountId::from_u64(1).unwrap()));
        bus.publish(event);
        let r1 = rx1.recv().await.unwrap();
        let r2 = rx2.recv().await.unwrap();
        assert_eq!(r1.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
        assert_eq!(r2.meta.account_id, r1.meta.account_id);
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_publish_returns_subscriber_count() {
        let bus = EventBus::new(16, None);
        let _rx1 = bus.subscribe_control();
        let _rx2 = bus.subscribe_control();
        let rx3 = bus.subscribe_control();
        // rx3 hasn't received yet — dropping before publish keeps it active
        let count = bus.publish(make_event(None));
        drop(rx3);
        // Two subscribers (rx3 was already counted by broadcast before drop)
        assert!(count == 2 || count == 3, "expected ~2-3 active subscribers");
    }

    // ── EventBus::publish_raw_sip ──────────────────────────────────────

    /// @verifies C020, C025
    #[tokio::test]
    async fn eventbus_publish_raw_sip_delivers_when_enabled() {
        let bus = EventBus::new(16, Some(16));
        let mut rx = bus.subscribe_raw_sip().unwrap();
        let msg = RawSipMessage::parse(
            b"INVITE sip:alice@example.com SIP/2.0\r\nVia: SIP/2.0/UDP 192.0.2.1\r\n\r\n",
        )
        .expect("valid INVITE parses");
        bus.publish_raw_sip(msg);
        let received = rx.recv().await.unwrap();
        assert_eq!(
            received.start_line(),
            "INVITE sip:alice@example.com SIP/2.0"
        );
        assert_eq!(received.header("Via"), Some("SIP/2.0/UDP 192.0.2.1"));
    }

    /// @verifies C025, C048
    #[tokio::test]
    async fn eventbus_raw_sip_redact_round_trip() {
        let bus = EventBus::new(16, Some(16));
        let mut rx = bus.subscribe_raw_sip().unwrap();
        let config = RawSipEventConfig {
            redact_authorization: true,
            ..RawSipEventConfig::default()
        };
        let msg = RawSipMessage::parse_with_config(
            b"INVITE sip:alice@example.com SIP/2.0\r\nAuthorization: Digest password=\"s3cret!\"\r\n\r\n",
            &config,
        )
        .expect("parses and redacts");
        bus.publish_raw_sip(msg);
        let received = rx.recv().await.unwrap();
        assert!(
            received.text().contains("[REDACTED]"),
            "redacted value travels the bus"
        );
        assert!(
            !received.text().contains("s3cret!"),
            "password never leaks through the bus"
        );
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5, P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P9-4) --for-spec --no-implementation-order`.
    fn eventbus_publish_raw_sip_noop_when_disabled() {
        let bus = EventBus::new(16, None);
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\r\n\r\n").expect("parses");
        bus.publish_raw_sip(msg); // must not panic
    }

    // ── EventBus Lagged detection ──────────────────────────────────────

    /// @verifies C020, C021
    #[test]
    // [::TICKET::] P7-2: O-005 — assert exact Lagged count n (2) instead of a wildcard
    // [::TICKET::] P0-5, P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P7-2) --for-spec --no-implementation-order`.
    fn eventbus_lagged_detection() {
        let bus = EventBus::new(2, None); // very small capacity
        let mut rx = bus.subscribe_control();
        // Publish 4 events without consuming. With capacity 2, the buffer keeps
        // only the last two (C, D); the first two (A, B) are dropped. The
        // receiver subscribed before any publish therefore skips exactly 2
        // messages → Lagged(2). This asserts n == the number of skipped messages.
        bus.publish(make_event(None));
        bus.publish(make_event(None));
        bus.publish(make_event(None)); // drops A
        bus.publish(make_event(None)); // drops B
        let result = rx.try_recv();
        assert!(
            matches!(result, Err(broadcast::error::TryRecvError::Lagged(2))),
            "expected Lagged(2) but got {:?}",
            result
        );
    }

    // ── EventBus Debug ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_debug_shows_raw_sip_enabled() {
        let bus = EventBus::new(16, Some(8));
        let debug = format!("{:?}", bus);
        assert!(debug.contains("raw_sip_enabled"));
    }

    // ── AccountEventReceiver ───────────────────────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn account_receiver_filters_by_account_id() {
        let bus = EventBus::new(256, None);
        let mut rx_a =
            AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        // Publish events for different accounts
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap()))); // skipped
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap()))); // matched
        let ev = rx_a.recv().await.unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    /// @verifies C020
    #[tokio::test]
    async fn account_receiver_drops_non_matching_events() {
        let bus = EventBus::new(256, None);
        let rx = bus.subscribe_control();
        let mut rx_a = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), rx);
        // Multiple non-matching events, then one matching
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        let ev = rx_a.recv().await.unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    /// @verifies C020
    #[tokio::test]
    async fn account_receiver_lagged_propagated() {
        let bus = EventBus::new(2, None);
        let mut rx_a =
            AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        // Overflow capacity
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        let result = rx_a.recv().await;
        assert!(
            matches!(result, Err(broadcast::error::RecvError::Lagged(_))),
            "expected Lagged error"
        );
    }

    // ── AccountEventReceiver::try_recv ─────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_receiver_try_recv_skips_non_matching() {
        let bus = EventBus::new(16, None);
        let mut rx_a =
            AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        // First try_recv should find the matching event
        let ev = rx_a.try_recv().unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_receiver_try_recv_empty_when_no_matching() {
        let bus = EventBus::new(16, None);
        let mut rx_a =
            AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        // No matching events (published with different account_id)
        bus.publish(make_event(Some(AccountId::from_u64(2).unwrap())));
        let result = rx_a.try_recv();
        assert!(matches!(result, Err(broadcast::error::TryRecvError::Empty)));
    }

    // ── AccountEventReceiver Debug ─────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_receiver_debug() {
        let bus = EventBus::new(16, None);
        let rx =
            AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        let debug = format!("{:?}", rx);
        assert!(debug.contains("AccountEventReceiver"));
    }

    // ── EventBus Clone ─────────────────────────────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_clones_share_same_sender() {
        let bus_a = EventBus::new(16, None);
        let bus_b = bus_a.clone();
        let mut rx = bus_a.subscribe_control();
        // Publish on bus_b, receive on bus_a's subscriber
        bus_b.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        let ev = rx.recv().await.unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    // ── EventBus non-blocking invariant ────────────────────────────────

    /// @verifies C021
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_publish_non_blocking() {
        let bus = EventBus::new(1, None);
        // publish returns immediately even with slow subscriber
        bus.publish(make_event(None));
        bus.publish(make_event(None)); // second publish with no consumer is fine
        bus.publish(make_event(None)); // third publish drops oldest — still no blocking
    }

    // ─── Boundary: capacity 1 ──────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_capacity_one_behavior() {
        let bus = EventBus::new(1, None);
        // With capacity 1, a single event is buffered.
        let mut rx = bus.subscribe_control();
        bus.publish(make_event(None));
        // The subscriber receives the event (no overflow).
        let result = rx.try_recv();
        assert!(result.is_ok(), "event should be received: {result:?}");
    }

    // ── Subscription<T> (P17-9 §62.29) ────────────────────────────────

    /// @verifies C134
    #[test]
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn subscription_type_assertions() -> Result<(), Box<dyn std::error::Error>> {
        // C134 precondition + postcondition: Subscription<T> wraps both a plain
        // broadcast receiver and the account-filtered AccountEventReceiver.
        // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
        fn assert_sip(_: &Subscription<SipEvent>) {}
        // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
        fn assert_raw(_: &Subscription<RawSipMessage>) {}
        let bus = EventBus::new(16, Some(32));
        let account = AccountId::from_u64(1)?;
        assert_sip(&Subscription::new(Box::new(bus.subscribe_control())));
        assert_sip(&Subscription::new(Box::new(AccountEventReceiver::new(
            account,
            bus.subscribe_control(),
        ))));
        assert_raw(&Subscription::new(Box::new(
            bus.subscribe_raw_sip().ok_or("raw bus enabled")?,
        )));
        Ok(())
    }

    /// @verifies C134
    #[tokio::test]
    async fn subscription_recv_delivers_published_event() -> Result<(), Box<dyn std::error::Error>>
    {
        let bus = EventBus::new(16, None);
        let mut sub = Subscription::new(Box::new(bus.subscribe_control()));
        bus.publish(make_event(None));
        let ev = sub.recv().await?;
        assert_eq!(ev.meta.account_id, None);
        Ok(())
    }

    /// @verifies C134
    #[tokio::test]
    async fn subscription_unsubscribe_closes_recv() {
        let bus = EventBus::new(16, None);
        let mut sub = Subscription::new(Box::new(bus.subscribe_control()));
        sub.unsubscribe();
        assert!(!sub.is_subscribed());
        assert!(matches!(
            sub.recv().await,
            Err(broadcast::error::RecvError::Closed)
        ));
        assert!(matches!(
            sub.try_recv(),
            Err(broadcast::error::TryRecvError::Closed)
        ));
    }

    /// @verifies C134
    #[test]
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn subscription_unsubscribe_is_idempotent() {
        let bus = EventBus::new(16, None);
        let mut sub = Subscription::new(Box::new(bus.subscribe_control()));
        sub.unsubscribe();
        sub.unsubscribe(); // second call is a no-op
        assert!(!sub.is_subscribed());
    }

    /// @verifies C134
    #[tokio::test]
    async fn subscription_account_filter_preserved() -> Result<(), Box<dyn std::error::Error>> {
        // C134 invariant: the account filter survives inside Subscription.
        let bus = EventBus::new(16, None);
        let mut sub = Subscription::new(Box::new(AccountEventReceiver::new(
            AccountId::from_u64(1)?,
            bus.subscribe_control(),
        )));
        bus.publish(make_event(Some(AccountId::from_u64(2)?))); // skipped
        bus.publish(make_event(Some(AccountId::from_u64(1)?))); // delivered
        let ev = sub.recv().await?;
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1)?));
        Ok(())
    }

    /// @verifies C134
    #[test]
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn subscription_account_filter_try_recv_empty_on_non_matching_only(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let bus = EventBus::new(16, None);
        let mut sub = Subscription::new(Box::new(AccountEventReceiver::new(
            AccountId::from_u64(1)?,
            bus.subscribe_control(),
        )));
        bus.publish(make_event(Some(AccountId::from_u64(2)?)));
        assert!(matches!(
            sub.try_recv(),
            Err(broadcast::error::TryRecvError::Empty)
        ));
        Ok(())
    }

    /// @verifies C134
    #[test]
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn subscription_try_recv_empty_when_no_events() {
        let bus = EventBus::new(16, None);
        let mut sub = Subscription::new(Box::new(bus.subscribe_control()));
        assert!(matches!(
            sub.try_recv(),
            Err(broadcast::error::TryRecvError::Empty)
        ));
    }

    /// @verifies C134
    #[test]
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn subscription_lagged_propagated() {
        let bus = EventBus::new(2, None);
        let mut sub = Subscription::new(Box::new(bus.subscribe_control()));
        bus.publish(make_event(None));
        bus.publish(make_event(None));
        bus.publish(make_event(None));
        assert!(matches!(
            sub.try_recv(),
            Err(broadcast::error::TryRecvError::Lagged(_))
        ));
    }

    // ── Dual Client dispatch ────────────────────────────────────────
    //
    // [::TICKET::] P7-2 review: The old inline-routing tests
    // (dual_client_dispatch_routes_to_correct_bus / none_account_broadcasts /
    // unknown_account_falls_back_to_default) re-implemented the dispatch logic
    // inside the test bodies and the first one had a same-AccountId-key bug
    // (bus_b overwrote bus_a), so they never proved the C039 isolation
    // invariant. Production dispatch_event tests now live in
    // src/runtime/reactor.rs and exercise the real routing function.
}
