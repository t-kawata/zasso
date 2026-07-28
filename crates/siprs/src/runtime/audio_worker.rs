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
            buf[..to_copy]
                .copy_from_slice(&self.data[self.position..self.position + to_copy]);
            self.position += to_copy;
        }
        to_copy
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
pub struct AudioMixer {
    pub sources: dashmap::DashMap<u64, Arc<Mutex<Box<dyn AsyncAudioSource + Send>>>>,
    pub gains: dashmap::DashMap<u64, f32>,
    pub mutes: dashmap::DashMap<u64, bool>,
    next_source_id: AtomicU64,
}

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
impl AudioMixer {
    /// Create a new empty `AudioMixer`.
    pub fn new() -> Self {
        Self {
            sources: dashmap::DashMap::new(),
            gains: dashmap::DashMap::new(),
            mutes: dashmap::DashMap::new(),
            next_source_id: AtomicU64::new(0),
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
    // [::STUB::] P0-7: mixer stored for future state inspection API.
    // Currently unused in AudioWorkerTask itself (passed to AudioWorkerInner at spawn).
    #[allow(dead_code)]
    mixer: Arc<AudioMixer>,
    // [::STUB::] P0-7: call_id stored for future query API.
    #[allow(dead_code)]
    call_id: u64,
    // [::STUB::] P0-7: frame_duration stored for future query API.
    #[allow(dead_code)]
    frame_duration: Duration,
    shutdown_signal: Arc<AtomicBool>,
    // [::STUB::] P2-4: Replace with JoinHandle once FFI binding is integrated.
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
    // [::STUB::] P0-7: call_id stored for future logging/metrics correlation.
    #[allow(dead_code)]
    call_id: u64,
    frame_duration: Duration,
    shutdown_signal: Arc<AtomicBool>,
}

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
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
    async fn process_frame(&mut self) {
        // Snapshot source IDs to avoid concurrent modification during iteration
        let source_ids: Vec<u64> = self.mixer.sources.iter().map(|e| *e.key()).collect();

        let mut mixed = vec![0i16; 160]; // 20ms @ 8kHz mono

        for id in &source_ids {
            // Skip muted sources
            if let Some(muted) = self.mixer.mutes.get(id) {
                if *muted {
                    continue;
                }
            }

            if let Some(entry) = self.mixer.sources.get(id) {
                let mut guard = entry.lock().await;
                let mut buf = vec![0i16; 160];
                let n = guard.next_chunk(&mut buf).await;
                if n == 0 {
                    continue;
                }
                let gain = self.mixer.gains.get(id).map(|r| *r).unwrap_or(1.0);
                for (i, sample) in buf.iter().enumerate().take(n) {
                    mixed[i] = mixed[i].saturating_add((*sample as f32 * gain) as i16);
                }
            }
        }
        // mixed buffer is ready — P1+ will push to out_queue for RT callback
        let _ = mixed;
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

    // ── Normal: AudioMixer construction ─────────────────────────────────

    #[test]
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn audio_mixer_new_creates_empty_sources() {
        let mixer = AudioMixer::new();
        assert_eq!(mixer.source_count(), 0, "new mixer must have 0 sources");
        assert_eq!(
            mixer.next_source_id(),
            0,
            "first source_id must be 0"
        );
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
        assert_eq!(
            *mixer.gains.get(&id).unwrap(),
            0.5,
            "gain must be updated"
        );
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
        assert!(result.is_err(), "set_gain on non-existent source must error");
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
            assert_eq!(id, i, "source_id must match iteration: expected {i}, got {id}");
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
        assert!(
            actual <= 2.0,
            "gain must be clamped to 2.0, got {actual}"
        );
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
        assert!(
            mixer.remove_source(id).is_err(),
            "second remove must fail"
        );
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
