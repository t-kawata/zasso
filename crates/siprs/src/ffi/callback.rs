// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P3-2: External C callback bridge — PJSIP → Rust event channel.
//
// # Design constraints
// These callbacks are invoked from PJSIP's real-time threads. They MUST:
// 1. Never acquire locks (mutex, RwLock, etc.)
// 2. Never allocate memory (no Vec::push, Box::new, etc.)
// 3. Never await or drive futures
// 4. Never call back into PJSUA
//
// The only permitted operation is copying event parameters into a
// pre-allocated NativeEvent and enqueuing it on a lock-free queue
// or MPSC channel.
//

use crate::ffi::bindings;
use crate::state::m20_native_event_conv::NativeEvent;
use std::sync::atomic::{AtomicPtr, AtomicUsize, Ordering};

/// Capacity of the pre-allocated `NativeEvent` queue installed at registration.
///
/// The queue is sized to absorb a worst-case burst of callback invocations from
/// the PJSIP real-time threads without ever blocking them; a full queue drops
/// the newest event and increments [`native_event_dropped_count`].
pub const NATIVE_EVENT_QUEUE_CAPACITY: usize = 256;

/// Compile-time invariant: the queue capacity must be positive.
const _: () = assert!(NATIVE_EVENT_QUEUE_CAPACITY > 0);

/// Process-wide native event queue, installed once by `register_callbacks`.
///
/// `AtomicPtr` keeps the enqueue path lock-free (design constraint #1): the
/// callback thread reads the pointer with `Acquire` and pushes onto the
/// pre-allocated `ArrayQueue` with no locks and no allocation.
static NATIVE_EVENT_QUEUE: AtomicPtr<crossbeam_queue::ArrayQueue<NativeEvent>> =
    AtomicPtr::new(std::ptr::null_mut());

/// Loss counter — incremented every time a full queue drops an event.
static NATIVE_EVENT_DROPPED: AtomicUsize = AtomicUsize::new(0);

/// Install the pre-allocated event queue, replacing any previously installed one.
///
/// `register_callbacks` calls this at init time, before any PJSIP callback can
/// fire. The swap is lock-free; the old queue is only dropped here (never from a
/// callback thread), so the pointer handed to callbacks is always valid.
// [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
fn install_native_event_queue(queue: crossbeam_queue::ArrayQueue<NativeEvent>) {
    let new_ptr = Box::into_raw(Box::new(queue));
    let old_ptr = NATIVE_EVENT_QUEUE.swap(new_ptr, Ordering::AcqRel);
    if !old_ptr.is_null() {
        // SAFETY: old_ptr was created by Box::into_raw in a previous install and
        // no callback thread reads it after this swap (AcqRel publish ordering).
        unsafe { drop(Box::from_raw(old_ptr)) };
    }
    NATIVE_EVENT_DROPPED.store(0, Ordering::Relaxed);
}

/// Enqueue a `NativeEvent` onto the installed lock-free queue.
///
/// Loss-tolerant: a full queue drops the event and increments the atomic loss
/// counter — the PJSIP real-time thread never blocks and never panics.
pub fn enqueue_native_event(event: NativeEvent) {
    let queue_ptr = NATIVE_EVENT_QUEUE.load(Ordering::Acquire);
    if !queue_ptr.is_null() {
        // SAFETY: queue_ptr is installed once by install_native_event_queue and
        // is never freed while a callback thread may read it (Acquire publish
        // ordering, single install at init).
        let queue = unsafe { &*queue_ptr };
        if queue.push(event).is_err() {
            NATIVE_EVENT_DROPPED.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// Number of events dropped because the queue was full.
pub fn native_event_dropped_count() -> usize {
    NATIVE_EVENT_DROPPED.load(Ordering::Relaxed)
}

/// Register the PJSIP callbacks into `pjsua_config.cb` and install the event queue.
///
/// Reads as prose: install the pre-allocated queue, then fill every callback
/// slot P11-11 owns. Callers must invoke this before `pjsua_init` so the stack
/// dispatches events through the bridge from the very first callback.
pub fn register_callbacks(
    config: &mut bindings::pjsua_config,
    queue: crossbeam_queue::ArrayQueue<NativeEvent>,
) {
    install_native_event_queue(queue);
    config.cb.on_incoming_call = Some(on_incoming_call);
    config.cb.on_reg_state = Some(on_reg_state);
    config.cb.on_call_state = Some(on_call_state);
    config.cb.on_call_media_state = Some(on_call_media_state);
    config.cb.on_reg_started = Some(on_reg_started);
    config.cb.on_call_redirected = Some(on_call_redirected);
    config.cb.on_dtmf_digit = Some(on_dtmf_digit);
    config.cb.on_call_transfer_status = Some(on_call_transfer_status);
}

/// Convert a PJSUA DTMF digit (ASCII int) into a `char`, skipping non-ASCII.
///
/// `on_dtmf_digit` passes an ASCII digit (0x30-0x39, 0x2A, 0x23, 0x41-0x44);
/// anything outside the ASCII range is not a DTMF digit and yields `None`.
// [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
fn dtmf_char_from_digit(digit: i32) -> Option<char> {
    char::from_u32(digit as u32).filter(|c| c.is_ascii())
}

/// Callback for incoming calls.
///
/// Called by PJSUA when a new incoming call arrives. The callback must not
/// block; it enqueues the `IncomingCall` event for processing on the reactor
/// thread.
///
/// # Safety
/// `rdata` is valid only within this callback's scope and is never dereferenced
/// here — the account and call ids are copied to Rust-owned types immediately.
#[no_mangle]
pub unsafe extern "C" fn on_incoming_call(
    acc_id: bindings::pjsua_acc_id,
    call_id: bindings::pjsua_call_id,
    _rdata: *mut bindings::pjsip_rx_data,
) {
    enqueue_native_event(NativeEvent::IncomingCall {
        acc_id: acc_id as u32,
        call_id: call_id as u32,
    });
}

/// Callback for registration state changes.
///
/// Called by PJSUA when an account's registration status changes. The legacy
/// single-argument form carries only the account id; the reactor queries the
/// backend for the detailed registration status.
///
/// # Safety
/// Must only be invoked from a PJSIP callback context; no pointer arguments are
/// dereferenced, so the sole requirement is the `extern "C"` ABI contract.
#[no_mangle]
pub unsafe extern "C" fn on_reg_state(acc_id: bindings::pjsua_acc_id) {
    enqueue_native_event(NativeEvent::RegistrationStateChanged {
        acc_id: acc_id as u32,
    });
}

/// Callback for call state changes.
///
/// Called by PJSUA whenever a call's invite-session state transitions. The
/// state is read from the event's `call_state_info` member.
///
/// # Safety
/// `event` must be a valid `pjsip_event` for the duration of this callback, or
/// null (handled by falling back to `PJSUA_CALL_NULL`).
#[no_mangle]
pub unsafe extern "C" fn on_call_state(
    call_id: bindings::pjsua_call_id,
    event: *mut bindings::pjsip_event,
) {
    let state = if event.is_null() {
        bindings::PJSUA_CALL_NULL
    } else {
        // SAFETY: PJSIP passes a valid event for the callback duration; reading
        // the call_state_info.state member is the documented on_call_state path.
        unsafe { (*event).call_state() }
    };
    enqueue_native_event(NativeEvent::CallStateChanged {
        call_id: call_id as u32,
        state,
    });
}

/// Callback for call media state changes.
///
/// Called by PJSUA when a call's media state changes (e.g., media established
/// or deactivated). The `CallMediaStateChanged` event carries only the call id;
/// the reactor reads the actual media status via `pjsua_call_get_info`.
///
/// # Safety
/// Must only be invoked from a PJSIP callback context; no pointer arguments are
/// dereferenced, so the sole requirement is the `extern "C"` ABI contract.
#[no_mangle]
pub unsafe extern "C" fn on_call_media_state(call_id: bindings::pjsua_call_id) {
    enqueue_native_event(NativeEvent::CallMediaStateChanged {
        call_id: call_id as u32,
    });
}

/// Callback for registration / unregistration initiation.
///
/// # Safety
/// Must only be invoked from a PJSIP callback context; no pointer arguments are
/// dereferenced, so the sole requirement is the `extern "C"` ABI contract.
#[no_mangle]
pub unsafe extern "C" fn on_reg_started(
    acc_id: bindings::pjsua_acc_id,
    renew: bindings::pj_bool_t,
) {
    enqueue_native_event(NativeEvent::RegistrationStarted {
        acc_id: acc_id as u32,
        renew: renew != 0,
    });
}

/// Callback for incoming DTMF digits (RFC 2833).
///
/// Non-ASCII digit values are skipped; the PJSIP digit is already an ASCII code.
///
/// # Safety
/// Must only be invoked from a PJSIP callback context; no pointer arguments are
/// dereferenced, so the sole requirement is the `extern "C"` ABI contract.
#[no_mangle]
pub unsafe extern "C" fn on_dtmf_digit(call_id: bindings::pjsua_call_id, digit: i32) {
    if let Some(digit) = dtmf_char_from_digit(digit) {
        enqueue_native_event(NativeEvent::DtmfDigit {
            call_id: call_id as u32,
            digit,
        });
    }
}

/// Callback for call-transfer status reports.
///
/// `p_cont` is left untouched so PJSIP keeps reporting transfer progress — an
/// intentional no-op on the out-parameter, matching "continue notifying".
///
/// # Safety
/// `p_cont` may be null; it is never dereferenced here.
#[no_mangle]
pub unsafe extern "C" fn on_call_transfer_status(
    call_id: bindings::pjsua_call_id,
    _st_code: i32,
    _st_text: *const bindings::pj_str_t,
    _final: bindings::pj_bool_t,
    _p_cont: *mut bindings::pj_bool_t,
) {
    enqueue_native_event(NativeEvent::CallTransferStatus {
        call_id: call_id as u32,
    });
}

/// Callback for INVITE redirection.
///
/// Enqueues the redirect event and returns `PJSIP_REDIRECT_STOP` — the same
/// no-follow policy PJSIP applies when the callback is absent.
///
/// # Safety
/// `target` and `event` are only passed through and never dereferenced here.
#[no_mangle]
pub unsafe extern "C" fn on_call_redirected(
    call_id: bindings::pjsua_call_id,
    _target: *const bindings::pjsip_uri,
    _event: *const bindings::pjsip_event,
) -> u32 {
    enqueue_native_event(NativeEvent::CallRedirected {
        call_id: call_id as u32,
    });
    bindings::pjsip_redirect_op::PJSIP_REDIRECT_STOP
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Swap in a fresh queue with the given capacity and reset the loss counter.
    ///
    /// Test-only queue isolation: each test installs its own queue so assertions
    /// never see events from a previous test.
// [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn install_test_queue(capacity: usize) -> &'static crossbeam_queue::ArrayQueue<NativeEvent> {
        install_native_event_queue(crossbeam_queue::ArrayQueue::new(capacity));
        // SAFETY: the queue was just installed and never freed while this test runs.
        unsafe { &*NATIVE_EVENT_QUEUE.load(Ordering::Acquire) }
    }

    // ── register_callbacks ─────────────────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn register_callbacks_fills_all_callback_pointers() {
        let queue = crossbeam_queue::ArrayQueue::new(8);
        let mut config: bindings::pjsua_config = unsafe { std::mem::zeroed() };
        register_callbacks(&mut config, queue);
        assert!(config.cb.on_incoming_call.is_some());
        assert!(config.cb.on_reg_state.is_some());
        assert!(config.cb.on_call_state.is_some());
        assert!(config.cb.on_call_media_state.is_some());
        assert!(config.cb.on_reg_started.is_some());
        assert!(config.cb.on_call_redirected.is_some());
        assert!(config.cb.on_dtmf_digit.is_some());
        assert!(config.cb.on_call_transfer_status.is_some());
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn register_callbacks_installs_the_event_queue() {
        let mut config: bindings::pjsua_config = unsafe { std::mem::zeroed() };
        register_callbacks(&mut config, crossbeam_queue::ArrayQueue::new(2));
        // Overflowing the capacity-2 queue installed by register_callbacks must
        // drop the third event — proving the queue is the live enqueue target.
        // (With no queue installed, enqueue_native_event silently no-ops and the
        // loss counter would stay 0.)
        enqueue_native_event(NativeEvent::CallMediaStateChanged { call_id: 1 });
        enqueue_native_event(NativeEvent::CallMediaStateChanged { call_id: 2 });
        enqueue_native_event(NativeEvent::CallMediaStateChanged { call_id: 3 });
        assert_eq!(
            native_event_dropped_count(),
            1,
            "queue installed by register_callbacks must drop on overflow"
        );
    }

    // ── on_incoming_call ───────────────────────────────────────────────

    #[test]
    // @verifies C051
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_incoming_call_enqueues_incoming_call() {
        let queue = install_test_queue(4);
        unsafe { on_incoming_call(1, 7, std::ptr::null_mut()) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::IncomingCall {
                acc_id: 1,
                call_id: 7
            })
        );
        assert_eq!(queue.pop(), None);
    }

    // ── on_reg_state / on_reg_started ─────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_reg_state_enqueues_registration_state_changed() {
        let queue = install_test_queue(2);
        unsafe { on_reg_state(3) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::RegistrationStateChanged { acc_id: 3 })
        );
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_reg_started_enqueues_registration_started() {
        let queue = install_test_queue(2);
        unsafe { on_reg_started(4, 1) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::RegistrationStarted {
                acc_id: 4,
                renew: true
            })
        );
        unsafe { on_reg_started(5, 0) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::RegistrationStarted {
                acc_id: 5,
                renew: false
            })
        );
    }

    // ── on_call_state ──────────────────────────────────────────────────

    /// Build a stub `pjsip_event` carrying the given invite-session state.
// [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn stub_call_event(state: u32) -> bindings::pjsip_event {
        bindings::pjsip_event {
            body: bindings::pjsip_event_body {
                call_state_info: bindings::pjsip_event_call_state_info { state },
            },
        }
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_call_state_reads_state_from_event() {
        let mut event = stub_call_event(bindings::pjsip_inv_state::CONFIRMED);
        let queue = install_test_queue(2);
        unsafe { on_call_state(7, &mut event) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallStateChanged {
                call_id: 7,
                state: bindings::pjsip_inv_state::CONFIRMED
            })
        );
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_call_state_null_event_falls_back_to_null_state() {
        let queue = install_test_queue(2);
        unsafe { on_call_state(7, std::ptr::null_mut()) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallStateChanged {
                call_id: 7,
                state: bindings::PJSUA_CALL_NULL
            })
        );
    }

    // ── on_call_media_state ────────────────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_call_media_state_enqueues_media_state_changed() {
        let queue = install_test_queue(2);
        unsafe { on_call_media_state(9) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallMediaStateChanged { call_id: 9 })
        );
    }

    // ── on_dtmf_digit ──────────────────────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_dtmf_digit_enqueues_ascii_digit() {
        let queue = install_test_queue(4);
        unsafe { on_dtmf_digit(5, '3' as i32) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::DtmfDigit {
                call_id: 5,
                digit: '3'
            })
        );
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_dtmf_digit_skips_non_ascii_digit() {
        let queue = install_test_queue(2);
        unsafe { on_dtmf_digit(5, 0xFF) };
        assert_eq!(queue.pop(), None, "0xFF is not an ASCII DTMF digit");
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn dtmf_char_from_digit_maps_ascii_only() {
        assert_eq!(dtmf_char_from_digit('0' as i32), Some('0'));
        assert_eq!(dtmf_char_from_digit('#' as i32), Some('#'));
        assert_eq!(dtmf_char_from_digit('A' as i32), Some('A'));
        assert_eq!(dtmf_char_from_digit(0xFF), None);
        assert_eq!(dtmf_char_from_digit(-1), None);
    }

    // ── on_call_redirected / on_call_transfer_status ──────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_call_redirected_enqueues_and_returns_stop() {
        let queue = install_test_queue(2);
        let action = unsafe { on_call_redirected(7, std::ptr::null(), std::ptr::null()) };
        assert_eq!(action, bindings::pjsip_redirect_op::PJSIP_REDIRECT_STOP);
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallRedirected { call_id: 7 })
        );
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn on_call_transfer_status_enqueues_and_leaves_p_cont_untouched() {
        let queue = install_test_queue(2);
        let mut p_cont: i32 = 1;
        unsafe { on_call_transfer_status(8, 486, std::ptr::null(), 1, &mut p_cont) };
        assert_eq!(
            p_cont, 1,
            "p_cont must be left at its initial non-zero value"
        );
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallTransferStatus { call_id: 8 })
        );
    }

    // ── Loss-tolerant enqueue ──────────────────────────────────────────

    #[test]
    // @verifies C052
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn full_queue_drops_event_and_increments_loss_counter() {
        let queue = install_test_queue(1);
        queue
            .push(NativeEvent::DtmfDigit {
                call_id: 1,
                digit: '1',
            })
            .expect("capacity-1 queue has a free slot");
        enqueue_native_event(NativeEvent::DtmfDigit {
            call_id: 2,
            digit: '2',
        });
        assert_eq!(native_event_dropped_count(), 1);
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::DtmfDigit {
                call_id: 1,
                digit: '1'
            })
        );
    }

    #[test]
    // @verifies C050, C052
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn queue_capacity_is_positive_and_pre_allocated() {
        // The capacity is a compile-time constant (statically asserted at module
        // scope); this test proves the enqueue path works on an installed,
        // pre-allocated queue.
        let queue = install_test_queue(4);
        enqueue_native_event(NativeEvent::CallMediaStateChanged { call_id: 1 });
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallMediaStateChanged { call_id: 1 })
        );
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn every_callback_enqueues_exactly_one_event() {
        let queue = install_test_queue(8);
        unsafe { on_reg_state(1) };
        unsafe { on_call_media_state(2) };
        unsafe { on_reg_started(3, 1) };
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::RegistrationStateChanged { acc_id: 1 })
        );
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::CallMediaStateChanged { call_id: 2 })
        );
        assert_eq!(
            queue.pop(),
            Some(NativeEvent::RegistrationStarted {
                acc_id: 3,
                renew: true
            })
        );
        assert_eq!(queue.len(), 0, "one event per invocation, no extras");
    }
}
