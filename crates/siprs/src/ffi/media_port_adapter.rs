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
//   - NODE_ID=N0049:  §39 Media Bridge & PJSUA Conference Port
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0049 --hops=2)
//   - NODE_ID=N0085:  62.16 メディア経路の完成（conf port / キュー消費 / WAV）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0085 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] PX-3: pjmedia_port adapter — wraps RustMediaPort into a
// pjmedia_port that PJSIP's pjsua_conf_add_port can register (§39 / §62.16).

//! Adapter that exposes a [`RustMediaPort`] as a PJSIP `pjmedia_port`.
//!
//! The conf bridge (`pjsua_conf_add_port`) accepts a `pjmedia_port` and drives
//! it from the realtime thread via the `get_frame` / `put_frame` function
//! pointers. This adapter builds that `pjmedia_port`, pointing
//! `port_data.pdata` at a boxed [`RustMediaPort`], and provides the RT
//! callbacks. The callbacks perform only lock-free `ArrayQueue` pop/push plus
//! memcpy/zero-fill (§24.0) — no allocation, no mutex, no await.
//!
//! # Ownership
//!
//! The boxed [`RustMediaPort`] is leaked (via `Box::into_raw`) when the adapter
//! is built and freed by the `on_destroy` callback when the conf bridge removes
//! the port. The [`AudioMixer`] it wraps is additionally kept alive by the
//! reactor's `audio_mixers` map, so a port that is never removed leaks only the
//! small [`RustMediaPort`] struct itself (PX-3 open item: shutdown cleanup).

use crate::ffi::bindings;
use crate::runtime::audio_worker::RustMediaPort;

/// Sample rate of the siprs audio pipeline (matches `MIXER_FRAME_SAMPLES` @ 8 kHz).
pub(crate) const CLOCK_RATE_HZ: u32 = 8000;
/// Channel count of the conf bridge (mono — `pjsua_media_config_default`).
pub(crate) const CHANNEL_COUNT: u32 = 1;
/// Frame interval in microseconds (20 ms — `MIXER_FRAME_SAMPLES` @ 8 kHz).
pub(crate) const FRAME_TIME_USEC: u32 = 20_000;
/// Bits per sample (16-bit signed PCM).
pub(crate) const BITS_PER_SAMPLE: u32 = 16;
/// Port name reported to the conference bridge.
const PORT_NAME: &[u8] = b"siprs-rust-media-port\0";

/// Initialize a `pjmedia_format` as 16-bit PCM audio (8000 Hz, mono, 20 ms).
///
/// # Safety
/// `fmt` must be non-null and point to valid initialized memory (the format
/// member of a `pjmedia_port`). Writing the audio union member is the documented
/// audio-format init path (`pjmedia_format_init_audio`).
unsafe fn init_audio_format(fmt: *mut bindings::pjmedia_format) {
    (*fmt).id = bindings::PJMEDIA_FORMAT_PCM;
    (*fmt).type_ = bindings::PJMEDIA_TYPE_AUDIO;
    (*fmt).detail_type = bindings::PJMEDIA_FORMAT_DETAIL_AUDIO;
    (*fmt).det.aud.clock_rate = CLOCK_RATE_HZ;
    (*fmt).det.aud.channel_count = CHANNEL_COUNT;
    (*fmt).det.aud.frame_time_usec = FRAME_TIME_USEC;
    (*fmt).det.aud.bits_per_sample = BITS_PER_SAMPLE;
    (*fmt).det.aud.avg_bps = 0;
    (*fmt).det.aud.max_bps = 0;
}

/// A transient `pjmedia_port` that routes the conf-bridge RT callbacks into a
/// [`RustMediaPort`].
pub(crate) struct MediaPortAdapter {
    /// The C-visible port structure passed to `pjsua_conf_add_port`.
    base: bindings::pjmedia_port,
    /// Backing memory for `base.info.name.ptr` (NUL-terminated).
    _name: Vec<u8>,
    /// The leaked `RustMediaPort` box exposed via `base.port_data.pdata`.
    _pdata: *mut RustMediaPort,
}

// [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
impl MediaPortAdapter {
    /// Build an adapter over `media_port`, boxing it for the RT callbacks.
    pub(crate) fn new(media_port: RustMediaPort) -> Self {
        let name = PORT_NAME.to_vec();
        let pdata = Box::into_raw(Box::new(media_port));
        // SAFETY: an all-zero `pjmedia_port` is a valid C struct — every pointer
        // member is NULL, every enum/counter is 0, and every field is assigned
        // below before the port is handed to the conf bridge.
        let mut base: bindings::pjmedia_port = unsafe { std::mem::zeroed() };
        base.info.name = bindings::pj_str_t {
            ptr: name.as_ptr() as *mut i8,
            slen: (name.len() - 1) as _,
        };
        base.info.signature = 0;
        base.info.dir = 0;
        // SAFETY: base.info.fmt is valid initialized memory owned by `base`;
        // writing the audio union member is the documented audio-format init
        // path (`pjmedia_format_init_audio`).
        unsafe { init_audio_format(&mut base.info.fmt) };
        base.port_data.pdata = pdata as *mut std::ffi::c_void;
        base.port_data.ldata = 0;
        base.grp_lock = std::ptr::null_mut();
        base.get_clock_src = None;
        base.put_frame = Some(media_port_put_frame);
        base.get_frame = Some(media_port_get_frame);
        base.on_destroy = Some(media_port_on_destroy);
        Self {
            base,
            _name: name,
            _pdata: pdata,
        }
    }

    /// The `pjmedia_port` pointer to pass to `pjsua_conf_add_port`.
    pub(crate) fn port_mut(&mut self) -> *mut bindings::pjmedia_port {
        &mut self.base
    }
}

// [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
impl Drop for MediaPortAdapter {
    /// Default build: the stub conf bridge never retains `port_data.pdata`, so
    /// the adapter is the sole owner of the boxed [`RustMediaPort`] and frees it
    /// here (avoids leaking one box per test / per failed registration).
    #[cfg(not(feature = "pjsua-native"))]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn drop(&mut self) {
        if !self._pdata.is_null() {
            // SAFETY: `_pdata` was created by `Box::into_raw` in `new` and the
            // default-build stub bridge does not retain it.
            drop(unsafe { Box::from_raw(self._pdata) });
        }
    }

    /// Native build: the conf bridge retains `port_data.pdata` for the lifetime
    /// of the registered port, so `on_destroy` frees the box when the port is
    /// removed; dropping the adapter must not free it early.
    #[cfg(feature = "pjsua-native")]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn drop(&mut self) {}
}

/// Recover the [`RustMediaPort`] a `pjmedia_port`'s `port_data.pdata` points at.
///
/// # Safety
/// `port` must be a valid `pjmedia_port` whose `port_data.pdata` was created by
/// [`MediaPortAdapter::new`] and has not been destroyed yet.
unsafe fn media_port_from(port: *mut bindings::pjmedia_port) -> &'static RustMediaPort {
    &*((*port).port_data.pdata as *const RustMediaPort)
}

/// RT source callback — pop the mixed send-mix from `out_queue` into `frame`.
///
/// Underruns are zero-filled (silence); the operation never blocks.
unsafe extern "C" fn media_port_get_frame(
    port: *mut bindings::pjmedia_port,
    frame: *mut bindings::pjmedia_frame,
) -> bindings::pj_status_t {
    // SAFETY: the bridge guarantees port/frame validity and that pdata points
    // to a live RustMediaPort (see MediaPortAdapter).
    let media_port = media_port_from(port);
    let size = (*frame).size;
    let buffer = unsafe { std::slice::from_raw_parts_mut((*frame).buf as *mut u8, size) };
    let written = media_port.get_frame(buffer, size);
    (*frame).size = written;
    bindings::PJ_SUCCESS
}

/// RT sink callback — push received audio into `in_queue`.
///
/// A full queue drops the frame (latest-priority) and never blocks.
unsafe extern "C" fn media_port_put_frame(
    port: *mut bindings::pjmedia_port,
    frame: *mut bindings::pjmedia_frame,
) -> bindings::pj_status_t {
    // SAFETY: the bridge guarantees port/frame validity (see MediaPortAdapter).
    let media_port = media_port_from(port);
    let data = unsafe { std::slice::from_raw_parts((*frame).buf as *const u8, (*frame).size) };
    let _ = media_port.put_frame(data, (*frame).size);
    bindings::PJ_SUCCESS
}

/// RT destructor — free the leaked [`RustMediaPort`] box when the bridge
/// removes the port.
unsafe extern "C" fn media_port_on_destroy(
    port: *mut bindings::pjmedia_port,
) -> bindings::pj_status_t {
    let pdata = (*port).port_data.pdata;
    if !pdata.is_null() {
        // SAFETY: pdata was created by Box::into_raw in MediaPortAdapter::new and
        // the bridge destroys the port exactly once.
        drop(Box::from_raw(pdata as *mut RustMediaPort));
    }
    bindings::PJ_SUCCESS
}

#[cfg(all(test, not(feature = "pjsua-native")))]
mod tests {
    use super::*;
    use crate::audio::media_path_wiring::BYTES_PER_I16;
    use crate::runtime::audio_worker::{AudioMixer, DEFAULT_QUEUE_CAPACITY, MIXER_FRAME_SAMPLES};
    use std::sync::Arc;

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn media_port_adapter_builds_pjmedia_port_with_rt_callbacks() {
        let mixer = Arc::new(AudioMixer::default());
        let port = RustMediaPort::new(mixer, 1);
        let mut adapter = MediaPortAdapter::new(port);
        let raw = adapter.port_mut();
        assert!(!raw.is_null());
        let pj = unsafe { &*raw };
        assert!(pj.get_frame.is_some(), "adapter must wire get_frame");
        assert!(pj.put_frame.is_some(), "adapter must wire put_frame");
        assert_eq!(pj.info.fmt.det.aud.clock_rate, CLOCK_RATE_HZ);
        assert_eq!(pj.info.fmt.det.aud.channel_count, CHANNEL_COUNT);
        assert_eq!(pj.info.fmt.det.aud.bits_per_sample, BITS_PER_SAMPLE);
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn media_port_get_frame_pops_out_queue_as_le_i16() {
        let mixer = Arc::new(AudioMixer::default());
        let port = RustMediaPort::new(mixer.clone(), 7);
        let mut adapter = MediaPortAdapter::new(port);
        let raw = adapter.port_mut();
        assert!(
            mixer
                .out_queue
                .push(vec![1000i16; MIXER_FRAME_SAMPLES])
                .is_ok(),
            "queue has capacity"
        );
        let mut buffer = vec![0u8; MIXER_FRAME_SAMPLES * BYTES_PER_I16];
        let mut frame = bindings::pjmedia_frame {
            type_: bindings::PJMEDIA_TYPE_AUDIO,
            buf: buffer.as_mut_ptr() as *mut std::ffi::c_void,
            size: buffer.len(),
            timestamp: 0,
            bit_info: 0,
        };
        let status = unsafe { media_port_get_frame(raw, &mut frame) };
        assert_eq!(status, bindings::PJ_SUCCESS);
        assert_eq!(frame.size, buffer.len());
        assert_eq!(i16::from_le_bytes([buffer[0], buffer[1]]), 1000);
        // underrun -> zero-fill
        let status = unsafe { media_port_get_frame(raw, &mut frame) };
        assert_eq!(status, bindings::PJ_SUCCESS);
        assert_eq!(frame.size, buffer.len());
        assert!(buffer.iter().all(|&b| b == 0), "underrun must zero-fill");
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn media_port_put_frame_pushes_in_queue_as_le_i16() {
        let mixer = Arc::new(AudioMixer::default());
        let port = RustMediaPort::new(mixer.clone(), 7);
        let mut adapter = MediaPortAdapter::new(port);
        let raw = adapter.port_mut();
        let data = vec![0u8, 0x00, 0x00, 0x80]; // LE i16: 0, -32768
        let mut frame = bindings::pjmedia_frame {
            type_: bindings::PJMEDIA_TYPE_AUDIO,
            buf: data.as_ptr() as *mut std::ffi::c_void,
            size: data.len(),
            timestamp: 0,
            bit_info: 0,
        };
        let status = unsafe { media_port_put_frame(raw, &mut frame) };
        assert_eq!(status, bindings::PJ_SUCCESS);
        assert_eq!(
            mixer.in_queue.pop(),
            Some(vec![0i16, -32768i16]),
            "received frame queued as little-endian i16"
        );
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn media_port_rt_callbacks_do_not_block_on_full_or_empty_queues() {
        let mixer = Arc::new(AudioMixer::default());
        let port = RustMediaPort::new(mixer.clone(), 1);
        let mut adapter = MediaPortAdapter::new(port);
        let raw = adapter.port_mut();
        // Fill in_queue to capacity; put_frame must drop (return success), never block.
        for _ in 0..DEFAULT_QUEUE_CAPACITY {
            let _ = mixer.in_queue.push(vec![0i16; MIXER_FRAME_SAMPLES]);
        }
        let data = vec![0u8; MIXER_FRAME_SAMPLES * BYTES_PER_I16];
        let mut frame = bindings::pjmedia_frame {
            type_: bindings::PJMEDIA_TYPE_AUDIO,
            buf: data.as_ptr() as *mut std::ffi::c_void,
            size: data.len(),
            timestamp: 0,
            bit_info: 0,
        };
        let status = unsafe { media_port_put_frame(raw, &mut frame) };
        assert_eq!(
            status,
            bindings::PJ_SUCCESS,
            "full queue drops without blocking"
        );
        // Empty out_queue; get_frame must zero-fill, never block.
        let mut buffer = vec![0xffu8; MIXER_FRAME_SAMPLES * BYTES_PER_I16];
        let mut get_frame = bindings::pjmedia_frame {
            type_: bindings::PJMEDIA_TYPE_AUDIO,
            buf: buffer.as_mut_ptr() as *mut std::ffi::c_void,
            size: buffer.len(),
            timestamp: 0,
            bit_info: 0,
        };
        let status = unsafe { media_port_get_frame(raw, &mut get_frame) };
        assert_eq!(status, bindings::PJ_SUCCESS);
        assert!(buffer.iter().all(|&b| b == 0), "underrun zero-fills");
    }
}
