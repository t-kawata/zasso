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

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
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

    /// Add a new audio source and return its assigned `source_id`.
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
    #[allow(dead_code)]
    mixer: Arc<AudioMixer>,
    // [::TICKET::] P3-2: call_id stored for query API (reserved for future inspection).
    #[allow(dead_code)]
    call_id: u64,
    // [::TICKET::] P3-2: frame_duration stored for query API (reserved for future inspection).
    #[allow(dead_code)]
    frame_duration: Duration,
    shutdown_signal: Arc<AtomicBool>,
    // [::STUB::] P3-2: Replace with JoinHandle once FFI binding is integrated.
    #[allow(dead_code)]
    handle: Option<tokio::task::JoinHandle<()>>,
}

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
impl AudioWorkerTask {
    /// Spawn a new `AudioWorkerTask` on the Tokio blocking pool.
    ///
    /// The worker loops with `frame_duration` interval, calling `process_frame`
    /// each iteration. Set `shutdown_signal` to `true` to terminate gracefully.
    pub fn spawn(mixer: Arc<AudioMixer>, call_id: u64, frame_duration: Duration) -> Self {
        let shutdown_signal = Arc::new(AtomicBool::new(false));
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
            handle: Some(handle),
        }
    }

    /// Request graceful shutdown and wait for the worker to finish.
    pub async fn shutdown(&mut self) {
        self.shutdown_signal.store(true, Ordering::Release);
        if let Some(handle) = self.handle.take() {
            let _ = handle.await;
        }
    }

    /// Returns `true` if the worker is still running.
    pub fn is_running(&self) -> bool {
        !self.shutdown_signal.load(Ordering::Acquire)
    }
}

// [::TICKET::] P0-6: AudioWorkerInner — internal worker state machine
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
struct AudioWorkerInner {
    mixer: Arc<AudioMixer>,
    // [::STUB::] P3-2: call_id stored for future logging/metrics correlation.
    #[allow(dead_code)]
    call_id: u64,
    frame_duration: Duration,
    shutdown_signal: Arc<AtomicBool>,
}

// [::TICKET::] P0-6, P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P3-2) --for-spec --no-implementation-order`.
impl AudioWorkerInner {
    /// Main worker loop: calls `process_frame` at `frame_duration` intervals.
    async fn run(&mut self) {
        while !self.shutdown_signal.load(Ordering::Acquire) {
            self.process_frame().await;
            tokio::time::sleep(self.frame_duration).await;
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
        // Snapshot source IDs to avoid concurrent modification during iteration
        let source_ids: Vec<u64> = self.mixer.sources.iter().map(|e| *e.key()).collect();

        let mut mixed_frame = vec![0i16; MIXER_FRAME_SAMPLES];

        // Collect gain-adjusted source buffers
        let mut source_buffers: Vec<Vec<i16>> = Vec::with_capacity(source_ids.len());

        for id in &source_ids {
            // Skip muted sources
            if let Some(muted) = self.mixer.mutes.get(id) {
                if *muted {
                    continue;
                }
            }

            if let Some(entry) = self.mixer.sources.get(id) {
                let mut guard = entry.lock().await;
                let mut buf = vec![0i16; MIXER_FRAME_SAMPLES];
                let n = guard.next_chunk(&mut buf).await;
                if n == 0 {
                    // Source exhausted — skip it
                    continue;
                }
                // Apply gain to the source buffer
                if let Some(gain) = self.mixer.gains.get(id) {
                    let g = *gain;
                    if g != 1.0 && g >= 0.0 {
                        for sample in buf.iter_mut().take(n) {
                            *sample = (*sample as f32 * g) as i16;
                        }
                    }
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
        let _ = self.mixer.out_queue.push(mixed_frame);
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
        assert!(out.iter().all(|&s| s <= i16::MAX), "output must not overflow");
        assert!(out.iter().all(|&s| s == i16::MAX), "16*10000 saturates at MAX");
    }

    #[test]
    // @verifies C034, C036
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mix_i16_frame_zero_sources_produces_silence() {
        let mut out = vec![0i16; MIXER_FRAME_SAMPLES];
        // Fill with non-zero to verify it gets cleared
        for s in &mut out {
            *s = 42;
        }
        mix_i16_frame(&[], &mut out);
        assert!(out.iter().all(|&s| s == 0), "zero sources must produce silence");
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
        assert_eq!(out.len(), MIXER_FRAME_SAMPLES, "output length must match constant");
    }

    // ── Normal: crossbeam queue ───────────────────────────────────────

    #[test]
    // @verifies C034
    // @verifies C050
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn audio_mixer_queue_push_non_blocking_on_full() {
        let q = crossbeam_queue::ArrayQueue::<Vec<i16>>::new(2);
        assert!(q.push(vec![0i16; 4]).is_ok());
        assert!(q.push(vec![1i16; 4]).is_ok());
        // Third push should fail (queue full), but NOT block
        let result = q.push(vec![2i16; 4]);
        assert!(result.is_err(), "push on full queue must return Err (not block)");
        assert_eq!(q.len(), 2, "queue must still have 2 items");
    }

    #[test]
    // @verifies C034
    // @verifies C050
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn audio_mixer_queue_pop_returns_inserted_data() {
        let q = crossbeam_queue::ArrayQueue::<Vec<i16>>::new(4);
        let data = vec![42i16; 160];
        assert!(q.push(data.clone()).is_ok());
        let popped = q.pop();
        assert!(popped.is_some(), "pop after push must return Some");
        assert_eq!(popped.unwrap(), data, "popped data must match pushed data");
    }

    #[test]
    // @verifies C034
    // @verifies C050
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn audio_mixer_queue_empty_pop_returns_none() {
        let q = crossbeam_queue::ArrayQueue::<Vec<i16>>::new(4);
        assert!(q.pop().is_none(), "pop from empty queue must return None");
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
        assert_eq!(mixer.out_queue.capacity(), DEFAULT_QUEUE_CAPACITY, "out_queue must have default capacity");
        assert_eq!(mixer.in_queue.capacity(), DEFAULT_QUEUE_CAPACITY, "in_queue must have default capacity");
        assert!(mixer.out_queue.is_empty(), "out_queue must be empty on creation");
        assert!(mixer.in_queue.is_empty(), "in_queue must be empty on creation");
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
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_set_gain_updates_gain() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        let result = mixer.set_gain(id, 0.5);
        assert!(result.is_ok(), "set_gain must succeed");
        assert_eq!(*mixer.gains.get(&id).unwrap(), 0.5, "gain must be updated");
    }

    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_mute_toggles_flag() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        let result = mixer.mute(id, true);
        assert!(result.is_ok(), "mute must succeed");
        assert!(*mixer.mutes.get(&id).unwrap(), "source must be muted");

        let result = mixer.mute(id, false);
        assert!(result.is_ok(), "unmute must succeed");
        assert!(!*mixer.mutes.get(&id).unwrap(), "source must be unmuted");
    }

    // ── Normal: AsyncAudioSource / MockAsyncAudioSource ────────────────

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_returns_canned_data() {
        let mut source = MockAsyncAudioSource::new(vec![1i16, 2i16, 3i16, 4i16]);
        let mut buf = vec![0i16; 4];
        let n = source.next_chunk(&mut buf).await;
        assert_eq!(n, 4, "must read 4 samples");
        assert_eq!(buf, vec![1i16, 2i16, 3i16, 4i16]);
    }

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_partial_fill() {
        // Source with fewer samples than buffer
        let mut source = MockAsyncAudioSource::new(vec![5i16, 6i16]);
        let mut buf = vec![0i16; 160];
        let n = source.next_chunk(&mut buf).await;
        assert_eq!(n, 2, "partial fill returns actual sample count");
        assert_eq!(buf[0], 5i16, "first sample correct");
        assert_eq!(buf[1], 6i16, "second sample correct");
    }

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_exhausted_returns_zero() {
        let mut source = MockAsyncAudioSource::new(vec![]);
        let mut buf = vec![0i16; 160];
        let n = source.next_chunk(&mut buf).await;
        assert_eq!(n, 0, "exhausted source must return 0");
    }

    #[tokio::test]
    // @verifies C036
    async fn mock_async_audio_source_multiple_chunks() {
        let mut source = MockAsyncAudioSource::new(vec![1i16, 2i16, 3i16, 4i16]);
        let mut buf = vec![0i16; 2];

        let n = source.next_chunk(&mut buf).await;
        assert_eq!(n, 2);
        assert_eq!(buf, vec![1i16, 2i16]);

        let n = source.next_chunk(&mut buf).await;
        assert_eq!(n, 2);
        assert_eq!(buf, vec![3i16, 4i16]);

        let n = source.next_chunk(&mut buf).await;
        assert_eq!(n, 0, "exhausted after all data consumed");
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
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_gain_clamped_above_two() {
        let mixer = AudioMixer::new();
        let id = mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![0i16; 160])));
        let _ = mixer.set_gain(id, 5.0);
        let actual = *mixer.gains.get(&id).unwrap();
        assert!(actual <= 2.0, "gain must be clamped to 2.0, got {actual}");
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
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<MockAsyncAudioSource>();
    }
}
