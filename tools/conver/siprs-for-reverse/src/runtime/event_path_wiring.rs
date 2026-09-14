
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::mpsc::UnboundedSender;

use crate::api::event_model_payload_bus::RawSipMessage;
use crate::api::eventbus_receiver::EventBus;
use crate::config::RawSipEventConfig;
use crate::runtime::command::DispatchCommand;

/// Poll interval for the FFI native-event drain task (P16-4 §62.13).
pub(crate) const NATIVE_EVENT_DRAIN_POLL_MS: u64 = 5;

/// Poll interval for the raw SIP publisher task (P16-4 §62.13).
pub(crate) const RAW_SIP_DRAIN_POLL_MS: u64 = 5;

/// Drain every queued `NativeEvent` into the reactor's command channel.
///
/// Returns the number of events forwarded. The async drain task calls this on
/// each tick; the loop stops when the channel is closed (reactor shutdown).
pub(crate) fn drain_pending_native_events(sender: &UnboundedSender<DispatchCommand>) -> usize {
    let mut drained = 0;
    while let Some(event) = crate::ffi::callback::try_pop_native_event() {
        if sender.send(DispatchCommand::NativeEvent { event }).is_err() {
            // Reactor channel closed — stop draining; the task observes
            // `is_closed()` and exits on the next tick.
            break;
        }
        drained += 1;
    }
    drained
}

/// Spawn the FFI native-event drain task on the reactor's timer runtime.
///
/// The task polls `NATIVE_EVENT_QUEUE` and forwards each `NativeEvent` as a
/// `DispatchCommand::NativeEvent`, which the reactor thread processes serially
/// via `process_native_event` — preserving the single-writer state access rule
/// (§62.13). The task holds an internal command sender, so the reactor's
/// channel-close termination path is superseded by the explicit Shutdown path;
/// the task exits when the reactor's `terminated` flag is set or the channel
/// receiver is gone.
pub(crate) fn spawn_native_event_drain(
    sender: UnboundedSender<DispatchCommand>,
    runtime: &tokio::runtime::Runtime,
    terminated: Arc<AtomicBool>,
) {
    runtime.spawn(async move {
        let mut ticker =
            tokio::time::interval(std::time::Duration::from_millis(NATIVE_EVENT_DRAIN_POLL_MS));
        loop {
            ticker.tick().await;
            if sender.is_closed() || terminated.load(Ordering::Acquire) {
                // Reactor exited (Shutdown/panic) — the channel receiver is gone
                // or the terminated flag is set. Stop draining.
                break;
            }
            drain_pending_native_events(&sender);
        }
    });
}

/// Drain every queued raw SIP packet, parse it, and publish to the raw_sip bus.
///
/// Returns the number of messages published. Malformed packets are logged and
/// skipped — the bus never carries invalid data (§16 redact rules apply via
/// `RawSipMessage::parse_with_config`).
pub(crate) fn drain_and_publish_raw_sip(event_bus: &EventBus, config: &RawSipEventConfig) -> usize {
    let mut published = 0;
    while let Some(bytes) = crate::ffi::callback::try_pop_raw_sip_bytes() {
        match RawSipMessage::parse_with_config(&bytes, config) {
            Ok(message) => {
                event_bus.publish_raw_sip(message);
                published += 1;
            }
            Err(error) => {
                tracing::warn!("raw SIP parse failed, message dropped: {error}");
            }
        }
    }
    published
}

/// Spawn the raw SIP publisher task, gated on `RawSipEventConfig.enabled`.
///
/// When disabled, no task is spawned and the raw_sip bus stays silent. The task
/// exits when the reactor's `terminated` flag is set (shutdown or panic).
pub(crate) fn spawn_raw_sip_publisher(
    event_bus: EventBus,
    config: RawSipEventConfig,
    runtime: &tokio::runtime::Runtime,
    terminated: Arc<AtomicBool>,
) {
    if !config.enabled {
        return;
    }
    runtime.spawn(async move {
        let mut ticker =
            tokio::time::interval(std::time::Duration::from_millis(RAW_SIP_DRAIN_POLL_MS));
        loop {
            ticker.tick().await;
            if terminated.load(Ordering::Acquire) {
                // Reactor terminated — stop publishing.
                break;
            }
            drain_and_publish_raw_sip(&event_bus, &config);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::bindings::pjsua_call_media_status;
    use crate::ffi::callback::{enqueue_native_event, enqueue_raw_sip_bytes, register_callbacks};
    use crate::runtime::handle::create_channel;
    use crate::state::m20_native_event_conv::NativeEvent;

    /// Install both lock-free queues via `register_callbacks` (the same init
    /// path production uses), so the drain primitives have live targets.
    fn install_queues() {
        let mut config: crate::ffi::bindings::pjsua_config = unsafe { std::mem::zeroed() };
        register_callbacks(&mut config, crossbeam_queue::ArrayQueue::new(4));
    }

    #[test]
    fn drain_pending_native_events_forwards_fifo() {
        install_queues();
        enqueue_native_event(NativeEvent::CallMediaStateChanged {
            call_id: 1,
            status: pjsua_call_media_status::NONE,
        });
        enqueue_native_event(NativeEvent::CallMediaStateChanged {
            call_id: 2,
            status: pjsua_call_media_status::ACTIVE,
        });

        let (tx, mut rx) = create_channel();
        let drained = drain_pending_native_events(&tx);
        assert_eq!(drained, 2, "both queued events are forwarded");

        match rx.try_recv().expect("first event") {
            DispatchCommand::NativeEvent { event } => {
                assert_eq!(
                    event,
                    NativeEvent::CallMediaStateChanged {
                        call_id: 1,
                        status: pjsua_call_media_status::NONE,
                    }
                );
            }
            other => panic!("expected NativeEvent, got {other:?}"),
        }
        match rx.try_recv().expect("second event") {
            DispatchCommand::NativeEvent { event } => {
                assert_eq!(
                    event,
                    NativeEvent::CallMediaStateChanged {
                        call_id: 2,
                        status: pjsua_call_media_status::ACTIVE,
                    }
                );
            }
            other => panic!("expected NativeEvent, got {other:?}"),
        }
        assert!(rx.try_recv().is_err(), "no further events queued");
    }

    #[test]
    fn drain_pending_native_events_empty_queue_drains_zero() {
        install_queues();
        let (tx, _rx) = create_channel();
        assert_eq!(drain_pending_native_events(&tx), 0);
    }

    #[tokio::test]
    async fn drain_and_publish_raw_sip_parses_and_publishes() {
        install_queues();
        let bus = EventBus::new(16, Some(16));
        let mut rx = bus.subscribe_raw_sip().expect("raw_sip enabled");
        let config = RawSipEventConfig {
            redact_authorization: true,
            ..RawSipEventConfig::default()
        };
        enqueue_raw_sip_bytes(
            b"INVITE sip:alice@example.com SIP/2.0\r\nAuthorization: Digest password=\"s3cret!\"\r\n\r\n"
                .to_vec(),
        );

        let published = drain_and_publish_raw_sip(&bus, &config);
        assert_eq!(published, 1, "one raw SIP message published");

        let msg = rx.recv().await.expect("raw sip delivered");
        assert!(msg.text().contains("[REDACTED]"), "redacted value travels");
        assert!(
            !msg.text().contains("s3cret!"),
            "password never leaks through the bus"
        );
    }

    #[test]
    fn drain_and_publish_raw_sip_skips_malformed() {
        install_queues();
        let bus = EventBus::new(16, Some(16));
        let config = RawSipEventConfig::default();
        enqueue_raw_sip_bytes(b"not a sip message".to_vec());

        let published = drain_and_publish_raw_sip(&bus, &config);
        assert_eq!(published, 0, "malformed bytes must not reach the bus");
    }
}
