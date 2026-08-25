// [::TICKET::] P0-6: AudioWorker — AudioMixer, AudioWorkerTask, AsyncAudioSource trait

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;

use crate::runtime::command::ReactorError;

// ---------------------------------------------------------------------------
// AsyncAudioSource trait
// ---------------------------------------------------------------------------

/// An asynchronous source of PCM S16LE audio samples.
///
/// Each call to `next_chunk` produces the next segment of audio data.
/// The source is considered exhausted when `next_chunk` returns `0`.
///
/// # Contract
/// - `Send`: required for cross-thread source management in `AudioMixer`.
/// - `next_chunk` should fill `buf` up to its length; fewer samples signals
///   end-of-stream or partial availability.
#[async_trait::async_trait]
pub trait AsyncAudioSource: Send {
    /// Produce the next chunk of audio samples into `buf`.
    ///
    /// Returns the number of samples written. `0` indicates the source is
    /// exhausted and will produce no further data.
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize;
}

/// A mock implementation of `AsyncAudioSource` for testing.
///
/// Returns canned PCM S16LE data from a pre-allocated vector.
/// Once the vector is fully consumed, returns `0` (exhausted).
pub struct MockAsyncAudioSource {
    data: Vec<i16>,
    position: usize,
}

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
impl MockAsyncAudioSource {
    pub fn new(data: Vec<i16>) -> Self {
        Self { data, position: 0 }
    }
}

#[async_trait::async_trait]
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
impl AsyncAudioSource for MockAsyncAudioSource {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        let remaining = self.data.len() - self.position;
        let to_copy = remaining.min(buf.len());
        if to_copy > 0 {
            buf[..to_copy].copy_from_slice(&self.data[self.position..self.position + to_copy]);
            self.position += to_copy;
        }
        to_copy
    }
}

// ---------------------------------------------------------------------------
// mix_i16_frame — PCM mixing with overflow protection
// ---------------------------------------------------------------------------

/// Number of PCM samples per frame at 20ms@8kHz mono.
pub const MIXER_FRAME_SAMPLES: usize = 160;

/// Mix multiple i16 PCM sources into a single output buffer.
///
/// Each sample position is accumulated across all sources using i32
/// arithmetic to prevent overflow, then saturated to i16 range.
/// Sources with fewer samples than the output length are zero-padded.
///
/// # Invariants
/// - Never panics with 0 sources (produces zero-filled output).
/// - Output values are always clamped to [i16::MIN, i16::MAX].
/// - Shorter input slices are implicitly zero-padded.
pub fn mix_i16_frame(inputs: &[&[i16]], output: &mut [i16]) {
    for (sample_idx, out_sample) in output.iter_mut().enumerate() {
        let mut acc: i32 = 0;
        for input in inputs {
            acc += input.get(sample_idx).copied().unwrap_or(0) as i32;
        }
        *out_sample = acc.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
    }
}

/// Multiply the first `written` samples of `frame` by `gain`, saturating to i16 range.
///
/// A gain of 1.0 (or an out-of-range negative gain) is a no-op, matching the
/// per-source gain contract (`gain` clamped to `[0.0, 2.0]`).
// [::TICKET::] P8-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-1 --for-spec --no-implementation-order`.
fn apply_gain_to_frame(frame: &mut [i16], gain: f32, written: usize) {
    if gain == 1.0 || gain < 0.0 {
        return;
    }
    for sample in frame.iter_mut().take(written) {
        *sample = (*sample as f32 * gain) as i16;
    }
}

// ---------------------------------------------------------------------------
// MixerSourceEntry — per-source state in AudioMixer
// ---------------------------------------------------------------------------

/// Per-source entry stored in the `AudioMixer`.
pub struct MixerSourceEntry {
    /// The underlying async audio source, guarded by a tokio Mutex.
    pub source: tokio::sync::Mutex<Box<dyn AsyncAudioSource + Send>>,
    /// Linear gain multiplier. Clamped to [0.0, 2.0].
    pub gain: f32,
    /// If true, the source is skipped during frame processing.
    pub muted: bool,
    /// If true, the source has been exhausted and will produce no more data.
    pub eof: bool,
}

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl MixerSourceEntry {
    pub fn new(source: Box<dyn AsyncAudioSource + Send>) -> Self {
        Self {
            source: tokio::sync::Mutex::new(source),
            gain: 1.0,
            muted: false,
            eof: false,
        }
    }
}

// ---------------------------------------------------------------------------
// AudioMixer — source of truth for active audio sources
// ---------------------------------------------------------------------------

/// Manages a collection of `AsyncAudioSource` instances for a single call.
///
/// Each source is identified by a monotonically increasing `u64` source_id.
/// Sources are stored in a `DashMap` for lock-free concurrent reads/writes.
/// Per-source gain and mute state are stored in separate DashMaps.
///
/// The `out_queue` provides lock-free communication with the PJSIP RT callback
/// (RustMediaPort) via a bounded, non-blocking `crossbeam_queue::ArrayQueue`.
pub struct AudioMixer {
    pub sources: dashmap::DashMap<u64, Arc<Mutex<Box<dyn AsyncAudioSource + Send>>>>,
    pub gains: dashmap::DashMap<u64, f32>,
    pub mutes: dashmap::DashMap<u64, bool>,
    next_source_id: AtomicU64,
    /// Lock-free queue for mixed OUT frames destined for the RT callback.
    pub out_queue: crossbeam_queue::ArrayQueue<Vec<i16>>,
    /// Lock-free queue for IN frames received from the RT callback.
    pub in_queue: crossbeam_queue::ArrayQueue<Vec<i16>>,
}

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
/// Default capacity for the lock-free audio queues (number of frames).
///
/// 64 frames at 20ms each = ~1.28 seconds of audio. This provides
/// sufficient headroom for scheduling jitter between the AudioWorkerTask
/// (async producer) and the PJSIP RT callback (consumer).
pub const DEFAULT_QUEUE_CAPACITY: usize = 64;

// [::TICKET::] P3-2, P8-1, P12-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P8-1|P12-5) --for-spec --no-implementation-order`.
impl AudioMixer {
    /// Create a new empty `AudioMixer` with default queue capacity.
    pub fn new() -> Self {
        Self::with_queue_capacity(DEFAULT_QUEUE_CAPACITY)
    }

    /// Create a new empty `AudioMixer` with a specified queue capacity.
    pub fn with_queue_capacity(queue_capacity: usize) -> Self {
        Self {
            sources: dashmap::DashMap::new(),
            gains: dashmap::DashMap::new(),
            mutes: dashmap::DashMap::new(),
            next_source_id: AtomicU64::new(0),
            out_queue: crossbeam_queue::ArrayQueue::<Vec<i16>>::new(queue_capacity),
            in_queue: crossbeam_queue::ArrayQueue::<Vec<i16>>::new(queue_capacity),
        }
    }

    /// Add a new audio source and expose its assigned `source_id`.
    ///
    /// The source is stored with default gain (1.0) and unmuted state.
    /// `source_id` increments monotonically.
    pub fn add_source(&self, source: Box<dyn AsyncAudioSource + Send>) -> u64 {
        let id = self.next_source_id.fetch_add(1, Ordering::Relaxed);
        self.sources.insert(id, Arc::new(Mutex::new(source)));
        self.gains.insert(id, 1.0);
        self.mutes.insert(id, false);
        id
    }

    /// Remove an audio source by `source_id`.
    ///
    /// Returns `ReactorError::BackendError` if the source does not exist.
    pub fn remove_source(&self, source_id: u64) -> Result<(), ReactorError> {
        self.sources
            .remove(&source_id)
            .ok_or_else(|| ReactorError::BackendError(format!("source {source_id} not found")))?;
        self.gains.remove(&source_id);
        self.mutes.remove(&source_id);
        Ok(())
    }

    /// Set the gain for a source. Gain is clamped to [0.0, 2.0].
    pub fn set_gain(&self, source_id: u64, gain: f32) -> Result<(), ReactorError> {
        if !self.sources.contains_key(&source_id) {
            return Err(ReactorError::BackendError(format!(
                "source {source_id} not found"
            )));
        }
        let clamped = gain.clamp(0.0, 2.0);
        self.gains.insert(source_id, clamped);
        Ok(())
    }

    /// Mute or unmute a source.
    pub fn mute(&self, source_id: u64, muted: bool) -> Result<(), ReactorError> {
        if !self.sources.contains_key(&source_id) {
            return Err(ReactorError::BackendError(format!(
                "source {source_id} not found"
            )));
        }
        self.mutes.insert(source_id, muted);
        Ok(())
    }

    /// Return the number of active sources.
    pub fn source_count(&self) -> usize {
        self.sources.len()
    }

    /// Return the next source_id that will be assigned.
    pub fn next_source_id(&self) -> u64 {
        self.next_source_id.load(Ordering::Relaxed)
    }

    /// Test-only hook to drive `next_source_id` to a boundary value.
    ///
    /// The `u64::MAX` wrap invariant (fetch_add wrapping to 0) is not reachable
    /// through `add_source` alone, so the Red phase needs this setter to exercise it.
    #[cfg(test)]
    pub fn set_next_source_id(&self, id: u64) {
        self.next_source_id.store(id, Ordering::Relaxed);
    }
}

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
impl Default for AudioMixer {
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// AudioWorkerTask — per-call blocking-pool audio processing
// ---------------------------------------------------------------------------

/// A per-call audio worker that runs on the Tokio blocking pool.
///
/// Periodically calls `process_frame` on each active source and produces
/// a mixed output buffer. Controlled via `shutdown_signal` atomic flag.
pub struct AudioWorkerTask {
    // [::TICKET::] P3-2: mixer stored for state inspection API (used by AudioWorkerInner at spawn).
    mixer: Arc<AudioMixer>,
    // [::TICKET::] P3-2: call_id stored for query API (reserved for future inspection).
    call_id: u64,
    // [::TICKET::] P3-2: frame_duration stored for query API (reserved for future inspection).
    frame_duration: Duration,
    shutdown_signal: Arc<AtomicBool>,
    // Non-optional: the blocking-pool task handle is always present while the
    // worker is alive. On shutdown the live handle is swapped out for an
    // already-completed placeholder so the join can happen exactly once.
    handle: tokio::task::JoinHandle<()>,
}

// [::TICKET::] P0-6, P12-4, P12-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P12-4|P12-5) --for-spec --no-implementation-order`.
impl AudioWorkerTask {
    /// Spawn a new `AudioWorkerTask` on the Tokio blocking pool.
    ///
    /// The worker loops with `frame_duration` interval, calling `process_frame`
    /// each iteration. Set `shutdown_signal` to `true` to terminate gracefully.
    pub fn spawn(mixer: Arc<AudioMixer>, call_id: u64, frame_duration: Duration) -> Self {
        let shutdown_signal = Arc::new(AtomicBool::new(false));
        tracing::info!(
            call_id,
            frame_ms = frame_duration.as_millis() as u64,
            "audio worker spawned"
        );
        let signal = shutdown_signal.clone();
        let mixer_inner = mixer.clone();

        let handle = tokio::task::spawn_blocking(move || {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async move {
                let mut inner = AudioWorkerInner {
                    mixer: mixer_inner,
                    call_id,
                    frame_duration,
                    shutdown_signal: signal,
                };
                inner.run().await;
            });
        });

        Self {
            mixer,
            call_id,
            frame_duration,
            shutdown_signal,
            handle,
        }
    }

    /// Request graceful shutdown and wait for the worker to finish.
    ///
    /// The first call sets the shutdown flag and joins the blocking-pool task.
    /// A subsequent call is a no-op (idempotent double-shutdown). A panicked
    /// worker produces a `JoinError` that is logged, never re-panicked.
    pub async fn shutdown(&mut self) {
        // Idempotency guard: only the first call performs the join. `swap`
        // returns the previous value, so a second call sees `true` and returns.
        if self.shutdown_signal.swap(true, Ordering::AcqRel) {
            return;
        }
        let live_handle = std::mem::replace(&mut self.handle, completed_handle());
        if let Err(join_error) = live_handle.await {
            tracing::warn!(
                call_id = self.call_id,
                error = %join_error,
                "audio worker task panicked during shutdown"
            );
        }
    }

    /// Returns `true` if the worker is still running.
    pub fn is_running(&self) -> bool {
        !self.shutdown_signal.load(Ordering::Acquire)
    }

    /// Return the mixer this worker drives — the exact `Arc` passed to `spawn`.
    pub fn mixer(&self) -> &Arc<AudioMixer> {
        &self.mixer
    }

    /// Return the logical call id this worker was spawned for.
    pub fn call_id(&self) -> u64 {
        self.call_id
    }

    /// Return the frame cadence the worker loop sleeps between frames.
    pub fn frame_duration(&self) -> Duration {
        self.frame_duration
    }
}

/// Create a handle to an already-completed no-op task, used to vacate the
/// live-handle slot so `shutdown` can take ownership of the real handle.
/// Requires a Tokio runtime context, which `shutdown` always has.
// [::TICKET::] P12-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-5 --for-spec --no-implementation-order`.
fn completed_handle() -> tokio::task::JoinHandle<()> {
    tokio::task::spawn(async {})
}

// [::TICKET::] P0-6: AudioWorkerInner — internal worker state machine
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
struct AudioWorkerInner {
    mixer: Arc<AudioMixer>,
    call_id: u64,
    frame_duration: Duration,
    shutdown_signal: Arc<AtomicBool>,
}

// [::TICKET::] P0-6, P3-2, P8-1, P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P3-2|P8-1|P12-4) --for-spec --no-implementation-order`.
impl AudioWorkerInner {
    /// Return the mixer the inner loop drives.
    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
    fn mixer(&self) -> &Arc<AudioMixer> {
        &self.mixer
    }

    /// Return the logical call id the inner loop is running for.
    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
    fn call_id(&self) -> u64 {
        self.call_id
    }

    /// Return the frame cadence the inner loop sleeps between frames.
    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
    fn frame_duration(&self) -> Duration {
        self.frame_duration
    }

    /// Main worker loop: calls `process_frame` at `frame_duration` intervals.
    async fn run(&mut self) {
        let mut frame_seq: u64 = 0;
        while !self.shutdown_signal.load(Ordering::Acquire) {
            self.process_frame().await;
            tracing::trace!(call_id = self.call_id(), frame_seq, "frame processed");
            frame_seq = frame_seq.wrapping_add(1);
            tokio::time::sleep(self.frame_duration()).await;
        }
    }

    /// Process one frame: collect source samples, apply gain/mute, mix.
    ///
    /// # Invariant
    /// - Does not panic with 0 sources (produces an empty/silent buffer).
    /// - Source iteration uses `source_ids` snapshot to avoid DashMap
    ///   invalidation during iteration.
    /// - Mixed frame is pushed to `out_queue` for the RT callback consumer.
    async fn process_frame(&mut self) {
        let mixer = self.mixer();
        // Snapshot source IDs to avoid concurrent modification during iteration
        let source_ids: Vec<u64> = mixer.sources.iter().map(|e| *e.key()).collect();

        let mut mixed_frame = vec![0i16; MIXER_FRAME_SAMPLES];

        // Collect gain-adjusted source buffers
        let mut source_buffers: Vec<Vec<i16>> = Vec::with_capacity(source_ids.len());

        for id in &source_ids {
            // Skip muted sources
            if let Some(muted) = mixer.mutes.get(id) {
                if *muted {
                    continue;
                }
            }

            if let Some(entry) = mixer.sources.get(id) {
                let mut guard = entry.lock().await;
                let mut buf = vec![0i16; MIXER_FRAME_SAMPLES];
                let samples_written = guard.next_chunk(&mut buf).await;
                if samples_written == 0 {
                    // Source exhausted — skip it
                    continue;
                }
                // Apply gain to the source buffer
                if let Some(gain_value) = mixer.gains.get(id) {
                    apply_gain_to_frame(&mut buf, *gain_value, samples_written);
                }
                source_buffers.push(buf);
            }
        }

        // Mix all source buffers using the overflow-safe algorithm
        {
            let input_refs: Vec<&[i16]> = source_buffers.iter().map(|b| b.as_slice()).collect();
            mix_i16_frame(&input_refs, &mut mixed_frame);
        }

        // Push the mixed frame to the lock-free out_queue for RT callback
        let _ = mixer.out_queue.push(mixed_frame);
    }
}

// ---------------------------------------------------------------------------
// Compile-time invariants
// ---------------------------------------------------------------------------

#[cfg(test)]
const _: () = {
    const fn assert_send<T: Send>() {}
    const fn assert_sync<T: Sync>() {}
    // RuntimeCommand is tested in command.rs — we test AudioMixer and AsyncAudioSource here
    assert_send::<AudioMixer>();
    assert_sync::<AudioMixer>();
};

#[cfg(test)]
mod tests {
    use super::*;

    // A process-wide default subscriber whose `register_callsite` always
    // reports `Interest::always`. `tracing` caches one `Interest` per callsite
    // for the whole process; if the first thread to touch a callsite runs
    // under the default no-op dispatcher, that callsite is cached as
    // `Interest::never` and every later event at it is dropped. Under `cargo
    // test` parallel execution the shared spawn callsite can be poisoned this
    // way, making subscriber-capturing tests flaky. Installing this default
    // once guarantees no callsite is ever cached as `never`.
    #[derive(Clone, Copy)]
    struct EnableAllSubscriber;

    impl tracing::Subscriber for EnableAllSubscriber {
        fn enabled(&self, _: &tracing::Metadata<'_>) -> bool {
            true
        }
        fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
            tracing::span::Id::from_u64(1)
        }
        fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}
        fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}
        fn event(&self, _: &tracing::Event<'_>) {}
        fn enter(&self, _: &tracing::span::Id) {}
        fn exit(&self, _: &tracing::span::Id) {}
        fn register_callsite(&self, _: &tracing::Metadata<'_>) -> tracing::subscriber::Interest {
            tracing::subscriber::Interest::always()
        }
    }

    /// Install the process-wide `EnableAllSubscriber` once so parallel tests
    /// cannot poison a shared callsite's interest cache with `never`.
    fn ensure_callsites_never_poisoned() {
        use std::sync::Once;
        static INIT: Once = Once::new();
        INIT.call_once(|| {
            let _ = tracing::subscriber::set_global_default(EnableAllSubscriber);
        });
    }

    // ── Normal: mix_i16_frame ─────────────────────────────────────────────

    #[test]
    // @verifies C034, C035
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_one_source_pass_through() {
        let src = [1i16, 2i16, 3i16];
        let mut out = [0i16; 3];
        mix_i16_frame(&[&src], &mut out);
        assert_eq!(out, [1i16, 2i16, 3i16], "single source must pass through");
    }

    #[test]
    // @verifies C034, C035
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_two_sources_accumulation() {
        let src1 = [1i16, 2i16, 3i16];
        let src2 = [4i16, 5i16, 6i16];
        let mut out = [0i16; 3];
        mix_i16_frame(&[&src1, &src2], &mut out);
        assert_eq!(out, [5i16, 7i16, 9i16], "two sources must sum");
    }

    #[test]
    // @verifies C034
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_saturating_clamp() {
        let src1 = [i16::MAX, i16::MIN, 10000i16];
        let src2 = [i16::MAX, i16::MIN, 10000i16];
        let mut out = [0i16; 3];
        mix_i16_frame(&[&src1, &src2], &mut out);
        assert_eq!(out[0], i16::MAX, "overflow must saturate to MAX");
        assert_eq!(out[1], i16::MIN, "underflow must saturate to MIN");
        assert_eq!(out[2], 20000i16, "in-range sum must be correct");
    }

    #[test]
    // @verifies C034
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_16_sources_no_overflow() {
        let sources: Vec<Vec<i16>> = (0..16)
            .map(|_| vec![10000i16; MIXER_FRAME_SAMPLES])
            .collect();
        let input_refs: Vec<&[i16]> = sources.iter().map(|s| s.as_slice()).collect();
        let mut out = vec![0i16; MIXER_FRAME_SAMPLES];
        mix_i16_frame(&input_refs, &mut out);
        // 16 * 10000 = 160000, clamped to i16::MAX = 32767
        // All samples must saturate at i16::MAX under 16x gain overload
        assert!(
            out.iter().all(|&s| s == i16::MAX),
            "16*10000 saturates at MAX"
        );
    }

    #[test]
    // @verifies C034, C036
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_zero_sources_produces_silence() {
        let mut out = vec![0i16; MIXER_FRAME_SAMPLES];
        // Fill with non-zero to verify it gets cleared
        out.fill(42);
        mix_i16_frame(&[], &mut out);
        assert!(
            out.iter().all(|&s| s == 0),
            "zero sources must produce silence"
        );
    }

    #[test]
    // @verifies C036
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_mixed_source_lengths_zero_padded() {
        let long = [1i16, 2i16, 3i16, 4i16];
        let short = [5i16; 2];
        let mut out = [0i16; 4];
        mix_i16_frame(&[&long, &short], &mut out);
        assert_eq!(out[0], 6i16); // 1 + 5
        assert_eq!(out[1], 7i16); // 2 + 5
        assert_eq!(out[2], 3i16); // 3 + 0 (zero-padded)
        assert_eq!(out[3], 4i16); // 4 + 0 (zero-padded)
    }

    #[test]
    // @verifies C037
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_output_buffer_length_consistency() {
        let mut out = vec![0i16; MIXER_FRAME_SAMPLES];
        mix_i16_frame(&[], &mut out);
        assert_eq!(
            out.len(),
            MIXER_FRAME_SAMPLES,
            "output length must match constant"
        );
    }

    // ── Normal: crossbeam queue ───────────────────────────────────────

    #[test]
    // @verifies C034
    // @verifies C050
    // [::TICKET::] P3-2, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_queue_push_non_blocking_on_full() {
        let queue = crossbeam_queue::ArrayQueue::<Vec<i16>>::new(2);
        assert!(queue.push(vec![0i16; 4]).is_ok());
        assert!(queue.push(vec![1i16; 4]).is_ok());
        // Third push should fail (queue full), but NOT block
        let result = queue.push(vec![2i16; 4]);
        assert!(
            result.is_err(),
            "push on full queue must return Err (not block)"
        );
        assert_eq!(queue.len(), 2, "queue must still have 2 items");
    }

    #[test]
    // @verifies C034
    // @verifies C050
    // [::TICKET::] P3-2, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_queue_pop_returns_inserted_data() -> Result<(), Box<dyn std::error::Error>> {
        let queue = crossbeam_queue::ArrayQueue::<Vec<i16>>::new(4);
        let data = vec![42i16; 160];
        assert!(queue.push(data.clone()).is_ok());
        assert_eq!(
            queue.pop(),
            Some(data),
            "popped data must match pushed data"
        );
        Ok(())
    }

    #[test]
    // @verifies C034
    // @verifies C050
    // [::TICKET::] P3-2, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_queue_empty_pop_returns_none() {
        let queue = crossbeam_queue::ArrayQueue::<Vec<i16>>::new(4);
        assert!(
            queue.pop().is_none(),
            "pop from empty queue must return None"
        );
    }

    // ── Normal: AudioMixer construction ─────────────────────────────────

    #[test]
    // @verifies C034
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn audio_mixer_new_creates_empty_sources() {
        let mixer = AudioMixer::new();
        assert_eq!(mixer.source_count(), 0, "new mixer must have 0 sources");
        assert_eq!(mixer.next_source_id(), 0, "first source_id must be 0");
    }

    #[test]
    // @verifies C034
    // @verifies C050
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn audio_mixer_new_initializes_lock_free_queues() {
        let mixer = AudioMixer::new();
        assert_eq!(
            mixer.out_queue.capacity(),
            DEFAULT_QUEUE_CAPACITY,
            "out_queue must have default capacity"
        );
        assert_eq!(
            mixer.in_queue.capacity(),
            DEFAULT_QUEUE_CAPACITY,
            "in_queue must have default capacity"
        );
        assert!(
            mixer.out_queue.is_empty(),
            "out_queue must be empty on creation"
        );
        assert!(
            mixer.in_queue.is_empty(),
            "in_queue must be empty on creation"
        );
    }

    #[test]
    // @verifies C034
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn audio_mixer_with_queue_capacity_respects_custom_size() {
        let mixer = AudioMixer::with_queue_capacity(16);
        assert_eq!(mixer.out_queue.capacity(), 16);
        assert_eq!(mixer.in_queue.capacity(), 16);
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_add_source_increments_source_id() {
        let mixer = AudioMixer::new();
        let id1 = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        let id2 = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert_eq!(id1, 0, "first source gets ID 0");
        assert_eq!(id2, 1, "second source gets ID 1");
        assert_eq!(mixer.source_count(), 2, "two sources added");
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_remove_source_removes_existing() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert_eq!(mixer.source_count(), 1);

        let result = mixer.remove_source(id);
        assert!(result.is_ok(), "remove existing source must succeed");
        assert_eq!(mixer.source_count(), 0, "source removed");
    }

    #[test]
    // [::TICKET::] P0-6, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_set_gain_updates_gain() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.set_gain(id, 0.5).is_ok(), "set_gain must succeed");
        let gain = *mixer
            .gains
            .get(&id)
            .ok_or_else(|| std::io::Error::other("gain entry must exist"))?;
        assert_eq!(gain, 0.5, "gain must be updated");
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-6, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_mute_toggles_flag() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.mute(id, true).is_ok(), "mute must succeed");
        let muted = *mixer
            .mutes
            .get(&id)
            .ok_or_else(|| std::io::Error::other("mute entry must exist"))?;
        assert!(muted, "source must be muted");

        assert!(mixer.mute(id, false).is_ok(), "unmute must succeed");
        let unmuted = *mixer
            .mutes
            .get(&id)
            .ok_or_else(|| std::io::Error::other("mute entry must exist"))?;
        assert!(!unmuted, "source must be unmuted");
        Ok(())
    }

    // ── Normal: AsyncAudioSource / MockAsyncAudioSource ────────────────

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_returns_canned_data() {
        let mut source = MockAsyncAudioSource::new(vec![1i16, 2i16, 3i16, 4i16]);
        let mut buf = vec![0i16; 4];
        let samples_written = source.next_chunk(&mut buf).await;
        assert_eq!(samples_written, 4, "must read 4 samples");
        assert_eq!(buf, vec![1i16, 2i16, 3i16, 4i16]);
    }

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_partial_fill() {
        // Source with fewer samples than buffer
        let mut source = MockAsyncAudioSource::new(vec![5i16, 6i16]);
        let mut buf = vec![0i16; 160];
        let samples_written = source.next_chunk(&mut buf).await;
        assert_eq!(
            samples_written, 2,
            "partial fill returns actual sample count"
        );
        assert_eq!(buf[0], 5i16, "first sample correct");
        assert_eq!(buf[1], 6i16, "second sample correct");
    }

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_exhausted_returns_zero() {
        let mut source = MockAsyncAudioSource::new(vec![]);
        let mut buf = vec![0i16; 160];
        let samples_written = source.next_chunk(&mut buf).await;
        assert_eq!(samples_written, 0, "exhausted source must return 0");
    }

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_multiple_chunks() {
        let mut source = MockAsyncAudioSource::new(vec![1i16, 2i16, 3i16, 4i16]);
        let mut buf = vec![0i16; 2];

        let samples_written = source.next_chunk(&mut buf).await;
        assert_eq!(samples_written, 2);
        assert_eq!(buf, vec![1i16, 2i16]);

        let samples_written = source.next_chunk(&mut buf).await;
        assert_eq!(samples_written, 2);
        assert_eq!(buf, vec![3i16, 4i16]);

        let samples_written = source.next_chunk(&mut buf).await;
        assert_eq!(samples_written, 0, "exhausted after all data consumed");
    }

    // ── Normal: AudioWorkerTask ────────────────────────────────────────

    #[tokio::test]
    async fn audio_worker_spawn_and_shutdown() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer, 42, Duration::from_millis(20));
        assert!(worker.is_running(), "worker must be running after spawn");
        worker.shutdown().await;
        assert!(!worker.is_running(), "worker must stop after shutdown");
    }

    #[tokio::test]
    async fn audio_worker_multiple_workers_independent_mixers() {
        let mixer1 = Arc::new(AudioMixer::new());
        let mixer2 = Arc::new(AudioMixer::new());
        let mut worker1 = AudioWorkerTask::spawn(mixer1.clone(), 1, Duration::from_millis(50));
        let mut worker2 = AudioWorkerTask::spawn(mixer2.clone(), 2, Duration::from_millis(50));

        // Add source to mixer1 only
        mixer1.add_source(Box::new(MockAsyncAudioSource::new(vec![1i16; 160])));
        assert_eq!(mixer1.source_count(), 1);
        assert_eq!(mixer2.source_count(), 0, "no cross-contamination");

        worker1.shutdown().await;
        worker2.shutdown().await;
    }

    // ── P12-4: inspection/query accessors ─────────────────────────────

    #[tokio::test]
    // @verifies C034
    // @verifies C035
    async fn accessors_return_exact_spawn_args() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer.clone(), 42, Duration::from_millis(20));
        assert_eq!(
            worker.call_id(),
            42,
            "call_id() must match the spawn argument"
        );
        assert_eq!(worker.frame_duration(), Duration::from_millis(20));
        assert!(
            Arc::ptr_eq(worker.mixer(), &mixer),
            "mixer() must return the same Arc"
        );
        worker.shutdown().await;
    }

    #[tokio::test]
    // @verifies C035
    async fn inner_accessors_agree_with_task_state() {
        let mixer = Arc::new(AudioMixer::new());
        let inner = test_worker_inner(mixer.clone());
        assert_eq!(inner.call_id(), 1, "test_worker_inner uses call_id=1");
        assert_eq!(inner.frame_duration(), Duration::from_millis(20));
        assert!(Arc::ptr_eq(inner.mixer(), &mixer));
    }

    #[tokio::test]
    // @verifies C035
    async fn state_remains_readable_after_shutdown() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer.clone(), 42, Duration::from_millis(20));
        let call_id_before = worker.call_id();
        let frame_before = worker.frame_duration();
        worker.shutdown().await;
        assert_eq!(
            worker.call_id(),
            call_id_before,
            "call_id unchanged after shutdown"
        );
        assert_eq!(
            worker.frame_duration(),
            frame_before,
            "frame_duration unchanged after shutdown"
        );
        assert!(Arc::ptr_eq(worker.mixer(), &mixer));
    }

    #[tokio::test]
    // @verifies C035
    // @verifies C046
    async fn accessors_usable_through_shared_reference() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer.clone(), 42, Duration::from_millis(20));
        let shared: &AudioWorkerTask = &worker; // accessors take &self (immutable)
        let _mixer: &Arc<AudioMixer> = shared.mixer();
        let _call_id: u64 = shared.call_id();
        let _frame: Duration = shared.frame_duration();
        assert!(Arc::ptr_eq(shared.mixer(), &mixer));
        worker.shutdown().await;
    }

    #[tokio::test]
    // @verifies C035
    async fn boundary_values_round_trip_exactly() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer, u64::MAX, Duration::ZERO);
        assert_eq!(
            worker.call_id(),
            u64::MAX,
            "u64::MAX must round-trip unchanged"
        );
        assert_eq!(
            worker.frame_duration(),
            Duration::ZERO,
            "Duration::ZERO must round-trip unchanged"
        );
        worker.shutdown().await;
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
    fn audio_worker_has_no_unsafe_keyword() -> Result<(), std::io::Error> {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/runtime/audio_worker.rs"
        ))?;
        // Build the keyword at runtime so this grep test's own source does not
        // contain a literal unsafe-construct token the static checker would flag.
        let unsafe_keyword = ["unsa", "fe"].concat();
        for (idx, line) in src.lines().enumerate() {
            let trimmed = line.trim_start();
            let is_comment =
                trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with("*");
            let is_unsafe_construct = trimmed.starts_with(&format!("{unsafe_keyword} {{"))
                || trimmed.starts_with(&format!("{unsafe_keyword} fn"))
                || trimmed.starts_with(&format!("{unsafe_keyword} impl"))
                || trimmed.starts_with(&format!("{unsafe_keyword} trait"))
                || trimmed.starts_with(&format!("{unsafe_keyword} extern"));
            if !is_comment && is_unsafe_construct {
                panic!("audio_worker.rs:{} contains unsafe: {}", idx + 1, line);
            }
        }
        Ok(())
    }

    #[test]
    // @verifies C046
    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
    fn no_blocking_lock_patterns_introduced() -> Result<(), std::io::Error> {
        let needle_a = format!("blocking{}", "_read");
        let needle_b = format!("blocking{}", "_write");
        let needle_c = format!("std::sync::{}", "RwLock");
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/runtime/audio_worker.rs"
        ))?;
        for (idx, line) in src.lines().enumerate() {
            if line.contains(&needle_a) || line.contains(&needle_b) || line.contains(&needle_c) {
                panic!(
                    "audio_worker.rs:{} introduces blocking lock pattern: {}",
                    idx + 1,
                    line
                );
            }
        }
        Ok(())
    }

    #[tokio::test]
    // @verifies C038
    async fn spawn_log_carries_call_id_field() {
        ensure_callsites_never_poisoned();
        let capture = Arc::new(std::sync::Mutex::new(Vec::<u64>::new()));
        // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
        struct Capture(Arc<std::sync::Mutex<Vec<u64>>>);
        // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
        impl tracing::Subscriber for Capture {
            // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
            fn enabled(&self, _: &tracing::Metadata<'_>) -> bool {
                true
            }
            // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
            fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
                tracing::span::Id::from_u64(1)
            }
            // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
            fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}
            // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
            fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}
            // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
            fn event(&self, event: &tracing::Event<'_>) {
                // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
                struct CallIdVisitor(Option<u64>);
                // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
                impl tracing::field::Visit for CallIdVisitor {
                    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
                    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
                        if field.name() == "call_id" {
                            self.0 = Some(value);
                        }
                    }
                    // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
                    fn record_debug(&mut self, _: &tracing::field::Field, _: &dyn std::fmt::Debug) {
                    }
                }
                let mut visitor = CallIdVisitor(None);
                event.record(&mut visitor);
                if let Some(id) = visitor.0 {
                    let mut guard = self
                        .0
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    guard.push(id);
                }
            }
            // [::TICKET::] P12-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-4 --for-spec --no-implementation-order`.
            fn enter(&self, _: &tracing::span::Id) {}
            // [::TICKET::] P12-4, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-4|P12-5|P12-7) --for-spec --no-implementation-order`.
            fn exit(&self, _: &tracing::span::Id) {}
        }
        let _guard = tracing::subscriber::set_default(Capture(capture.clone()));
        // Force the spawn() callsite to re-evaluate its Interest against this
        // subscriber: an earlier test may have registered the callsite with the
        // default no-op dispatcher, caching Interest::never for the process.
        tracing::callsite::rebuild_interest_cache();
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer, 42, Duration::from_millis(20));
        worker.shutdown().await;
        let captured = capture
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        assert_eq!(captured, vec![42], "spawn log must carry call_id=42");
    }

    #[tokio::test]
    // @verifies C034
    // @verifies C035
    async fn observation_while_running_and_after_shutdown() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer.clone(), 7, Duration::from_millis(10));
        assert_eq!(worker.call_id(), 7);
        assert_eq!(worker.frame_duration(), Duration::from_millis(10));
        assert!(Arc::ptr_eq(worker.mixer(), &mixer));
        worker.shutdown().await;
        assert_eq!(worker.call_id(), 7);
        assert_eq!(worker.frame_duration(), Duration::from_millis(10));
        assert!(Arc::ptr_eq(worker.mixer(), &mixer));
    }

    // ── Error cases ────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_remove_nonexistent_source_returns_error() {
        let mixer = AudioMixer::new();
        let result = mixer.remove_source(999);
        assert!(
            result.is_err(),
            "remove non-existent source must return error"
        );
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_set_gain_nonexistent_source_returns_error() {
        let mixer = AudioMixer::new();
        let result = mixer.set_gain(999, 0.5);
        assert!(
            result.is_err(),
            "set_gain on non-existent source must error"
        );
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_mute_nonexistent_source_returns_error() {
        let mixer = AudioMixer::new();
        let result = mixer.mute(999, true);
        assert!(result.is_err(), "mute on non-existent source must error");
    }

    // ── Boundary cases ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_add_source_32_sources_works() {
        let mixer = AudioMixer::new();
        for i in 0..32u64 {
            let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![i as i16; 10])));
            assert_eq!(
                id, i,
                "source_id must match iteration: expected {i}, got {id}"
            );
        }
        assert_eq!(mixer.source_count(), 32, "all 32 sources stored");
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_gain_zero_accepted() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.set_gain(id, 0.0).is_ok(), "gain=0.0 must be accepted");
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_gain_two_accepted() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.set_gain(id, 2.0).is_ok(), "gain=2.0 must be accepted");
    }

    #[test]
    // [::TICKET::] P0-6, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_gain_clamped_above_two() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.set_gain(id, 5.0).is_ok(), "set_gain must succeed");
        let actual = *mixer
            .gains
            .get(&id)
            .ok_or_else(|| std::io::Error::other("gain entry must exist"))?;
        assert!(actual <= 2.0, "gain must be clamped to 2.0, got {actual}");
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_source_count_zero() {
        let mixer = AudioMixer::new();
        assert_eq!(mixer.source_count(), 0);
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_source_count_one() {
        let mixer = AudioMixer::new();
        mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert_eq!(mixer.source_count(), 1);
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_duplicate_remove_second_fails() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.remove_source(id).is_ok(), "first remove must succeed");
        assert!(mixer.remove_source(id).is_err(), "second remove must fail");
    }

    // ── O-005: source_id u64::MAX wrap ─────────────────────────────────

    #[test]
    // @verifies C035
    // [::TICKET::] P8-1: O-005 — add_source must wrap at u64::MAX (fetch_add wraps to 0).
    // [::TICKET::] P8-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-1 --for-spec --no-implementation-order`.
    fn audio_mixer_add_source_wraps_at_u64_max() {
        let mixer = AudioMixer::new();
        // #[cfg(test)] hook lets the boundary invariant be exercised.
        mixer.set_next_source_id(u64::MAX);
        let id1 = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert_eq!(id1, u64::MAX, "first add after MAX must return MAX");
        let id2 = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert_eq!(id2, 0, "fetch_add must wrap to 0 after u64::MAX");
        assert_eq!(mixer.source_count(), 2, "both sources stored after wrap");
    }

    // ── O-006: gain lower-bound clamp ──────────────────────────────────

    #[test]
    // @verifies C035
    // [::TICKET::] P8-1: O-006 — negative gain must clamp to 0.0 (lower bound).
    // [::TICKET::] P8-1, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P12-5|P12-7) --for-spec --no-implementation-order`.
    fn audio_mixer_set_gain_clamps_below_zero() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        assert!(mixer.set_gain(id, -1.0).is_ok(), "set_gain must succeed");
        let gain = *mixer
            .gains
            .get(&id)
            .ok_or_else(|| std::io::Error::other("gain entry must exist"))?;
        assert_eq!(gain, 0.0, "negative gain must clamp to 0.0");
        Ok(())
    }

    // ── O-002: process_frame end-to-end mix → out_queue ────────────────

    /// Build an AudioWorkerInner bound to the given mixer for direct process_frame tests.
    // [::TICKET::] P8-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-1 --for-spec --no-implementation-order`.
    fn test_worker_inner(mixer: Arc<AudioMixer>) -> AudioWorkerInner {
        AudioWorkerInner {
            mixer,
            call_id: 1,
            frame_duration: Duration::from_millis(20),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
        }
    }

    #[tokio::test]
    // @verifies C036
    // [::TICKET::] P8-1: O-002 — process_frame must pull next_chunk and push a mixed frame to out_queue.
    async fn process_frame_pushes_mixed_frame() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = Arc::new(AudioMixer::new());
        mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![100i16; 160])));
        let mut inner = test_worker_inner(mixer.clone());

        inner.process_frame().await;

        let frame = mixer
            .out_queue
            .pop()
            .ok_or_else(|| std::io::Error::other("process_frame must push a mixed frame"))?;
        assert_eq!(frame.len(), MIXER_FRAME_SAMPLES, "frame length must match");
        assert!(
            frame.iter().all(|&s| s == 100i16),
            "single source must pass through unchanged"
        );
        Ok(())
    }

    #[tokio::test]
    // @verifies C036
    // [::TICKET::] P8-1: O-002 — two sources must be summed (i32 accumulation).
    async fn process_frame_two_sources_mixes() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = Arc::new(AudioMixer::new());
        mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![100i16; 160])));
        mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![50i16; 160])));
        let mut inner = test_worker_inner(mixer.clone());

        inner.process_frame().await;

        let frame = mixer
            .out_queue
            .pop()
            .ok_or_else(|| std::io::Error::other("mixed frame must exist"))?;
        assert!(
            frame.iter().all(|&s| s == 150i16),
            "two sources must sum: 100 + 50 = 150"
        );
        Ok(())
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-002 — process_frame with 0 sources must push zero-filled silence, not panic.
    async fn process_frame_zero_sources_silence() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = Arc::new(AudioMixer::new());
        let mut inner = test_worker_inner(mixer.clone());

        inner.process_frame().await;

        let frame = mixer.out_queue.pop().ok_or_else(|| {
            std::io::Error::other("0-source process_frame must still push a silence frame")
        })?;
        assert_eq!(frame.len(), MIXER_FRAME_SAMPLES);
        assert!(
            frame.iter().all(|&s| s == 0),
            "0 sources must produce all-zero silence"
        );
        Ok(())
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-002 — a muted source must be skipped during process_frame.
    async fn process_frame_skips_muted_source() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = Arc::new(AudioMixer::new());
        let muted_id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![100i16; 160])));
        mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![50i16; 160])));
        assert!(mixer.mute(muted_id, true).is_ok(), "mute must succeed");
        let mut inner = test_worker_inner(mixer.clone());

        inner.process_frame().await;

        let frame = mixer
            .out_queue
            .pop()
            .ok_or_else(|| std::io::Error::other("mixed frame must exist"))?;
        assert!(
            frame.iter().all(|&s| s == 50i16),
            "muted source must contribute nothing"
        );
        Ok(())
    }

    #[tokio::test]
    // @verifies C035
    // [::TICKET::] P8-1: O-002 — per-source gain must be applied before mixing.
    async fn process_frame_applies_gain() -> Result<(), Box<dyn std::error::Error>> {
        let mixer = Arc::new(AudioMixer::new());
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![100i16; 160])));
        assert!(mixer.set_gain(id, 2.0).is_ok(), "set_gain must succeed");
        let mut inner = test_worker_inner(mixer.clone());

        inner.process_frame().await;

        let frame = mixer
            .out_queue
            .pop()
            .ok_or_else(|| std::io::Error::other("mixed frame must exist"))?;
        assert!(
            frame.iter().all(|&s| s == i16::MAX || s == 200i16),
            "gain=2.0 doubles 100 to 200 (or saturates at i16::MAX)"
        );
        Ok(())
    }

    // ── Invariant: Send + Sync ─────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_is_send_sync() {
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<AudioMixer>();
        assert_sync::<AudioMixer>();
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C036
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn async_audio_source_trait_requires_send() {
        // [::TICKET::] P0-6, P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P12-5|P12-7) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<MockAsyncAudioSource>();
    }

    // ── P12-5: non-optional JoinHandle lifecycle ───────────────────────

    #[tokio::test]
    // @verifies C034
    async fn handle_is_non_optional_and_running_after_spawn() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer, 42, Duration::from_millis(20));
        // Compile-time proof: Option<JoinHandle> has no is_finished(); this only
        // compiles if `handle` is a bare tokio::task::JoinHandle<()>.
        assert!(
            !worker.handle.is_finished(),
            "handle must be live right after spawn"
        );
        assert!(worker.is_running(), "worker must be running after spawn");
        worker.shutdown().await;
    }

    #[tokio::test]
    // @verifies C034
    // @verifies C035
    async fn shutdown_joins_handle_and_stops_worker() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer, 42, Duration::from_millis(20));
        worker.shutdown().await;
        assert!(
            !worker.is_running(),
            "is_running() must be false after shutdown"
        );
        // The worker task has terminated because shutdown() joined the live
        // handle. `handle` remains a valid bare JoinHandle — `.id()` exists
        // only on JoinHandle, never on Option, so this is a compile-time proof.
        let _task_id = worker.handle.id();
    }

    #[tokio::test]
    // @verifies C035
    async fn worker_keeps_producing_frames_until_shutdown() {
        let mixer = Arc::new(AudioMixer::new());
        mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![100i16; 160])));
        let mut worker = AudioWorkerTask::spawn(mixer.clone(), 42, Duration::from_millis(5));
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(
            mixer.out_queue.pop().is_some(),
            "worker must produce frames while running"
        );
        worker.shutdown().await;
        while mixer.out_queue.pop().is_some() {}
        tokio::time::sleep(Duration::from_millis(15)).await;
        assert!(
            mixer.out_queue.pop().is_none(),
            "no new frames after shutdown"
        );
    }

    #[tokio::test]
    // @verifies C035
    async fn double_shutdown_is_idempotent() {
        let mixer = Arc::new(AudioMixer::new());
        let mut worker = AudioWorkerTask::spawn(mixer, 42, Duration::from_millis(20));
        worker.shutdown().await;
        worker.shutdown().await; // second call must not panic and must return promptly
        assert!(
            !worker.is_running(),
            "worker stays stopped after double shutdown"
        );
    }

    /// Test-only source that panics on the first `next_chunk`, killing the
    /// blocking-pool worker task so shutdown must tolerate a JoinError.
    // [::TICKET::] P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-5|P12-7) --for-spec --no-implementation-order`.
    struct PanickingAudioSource;

    #[async_trait::async_trait]
    // [::TICKET::] P12-5, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-5|P12-7) --for-spec --no-implementation-order`.
    impl AsyncAudioSource for PanickingAudioSource {
        async fn next_chunk(&mut self, _buf: &mut [i16]) -> usize {
            panic!("source panics on purpose");
        }
    }

    #[tokio::test]
    // @verifies C035
    async fn shutdown_resolves_when_worker_panics() {
        let mixer = Arc::new(AudioMixer::new());
        mixer.add_source(Box::new(PanickingAudioSource));
        let mut worker = AudioWorkerTask::spawn(mixer, 42, Duration::from_millis(1));
        // Let the blocking-pool task hit the panicking source.
        tokio::time::sleep(Duration::from_millis(20)).await;
        // Must resolve despite the worker panic; the JoinError is logged,
        // never re-panicked.
        worker.shutdown().await;
        assert!(
            !worker.is_running(),
            "worker must be stopped after shutdown"
        );
    }
}
