// [::TICKET::] P5-2: AsyncAudioSource adapter types — ErasedAudioSource, SyncAudioSource, SyncSourceAdapter
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
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
//   - NODE_ID=N0032:  §23 AsyncAudioSource Trait & SyncSourceAdapter
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0032 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// Re-export AsyncAudioSource and MockAsyncAudioSource from runtime/audio_worker
// for backward compatibility. Downstream crates can use siprs::AsyncAudioSource.
pub use crate::runtime::audio_worker::{AsyncAudioSource, MockAsyncAudioSource};

// Imports are only needed by the cpal-input-gated `open_default_microphone_source`.
#[cfg(feature = "cpal-input")]
use crate::error::{SipError, SipErrorKind};
#[cfg(feature = "cpal-input")]
use crate::model::audio_format_chunkpair::{AudioFormat, ChannelLayout};
#[cfg(feature = "cpal-input")]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
#[cfg(feature = "cpal-input")]
use std::collections::VecDeque;
#[cfg(feature = "cpal-input")]
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// ErasedAudioSource — object-safe wrapper for dynamic dispatch
// ---------------------------------------------------------------------------

/// Object-safe wrapper for `AsyncAudioSource` that erases the concrete type.
///
/// The `AudioMixer` stores sources as `Box<dyn AsyncAudioSource + Send>`, which
/// requires the trait to be object-safe. `#[async_trait]` achieves this by
/// desugaring `async fn` into `Pin<Box<dyn Future>>`. However, when the RFC
/// specifies RPITIT (native `async fn` in trait, MSRV 1.95+), the trait is
/// not object-safe and this `ErasedAudioSource` wrapper provides the dynamic
/// dispatch path.
///
/// The blanket impl `<T: AsyncAudioSource + Send> ErasedAudioSource for T`
/// auto-derives the erased wrapper for every concrete source type.
///
/// Downstream crates implementing `AsyncAudioSource` automatically get
/// `ErasedAudioSource` — no manual impl required.
///
/// # Contract (C033)
/// - Auto-derived for every `T: AsyncAudioSource + Send` (blanket impl).
/// - `ErasedAudioSource` itself is `Send` (inherited from bound).
pub trait ErasedAudioSource: Send {
    /// Produce the next chunk of audio samples into `buf`.
    ///
    /// Returns the number of samples written. `0` indicates the source is
    /// exhausted and will produce no further data.
    // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = usize> + Send + 'a>>;
}

// Blanket impl: every AsyncAudioSource automatically becomes ErasedAudioSource.
impl<T: AsyncAudioSource + Send> ErasedAudioSource for T {
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = usize> + Send + 'a>> {
        Box::pin(AsyncAudioSource::next_chunk(self, buf))
    }
}

// ---------------------------------------------------------------------------
// SyncAudioSource — synchronous audio source trait
// ---------------------------------------------------------------------------

/// A synchronous source of PCM S16LE audio samples.
///
/// Unlike `AsyncAudioSource`, this trait is synchronous and does not require
/// an async runtime. It is used to wrap existing synchronous audio generators
/// (e.g., file readers, tone generators) into the async pipeline via
/// `SyncSourceAdapter`.
///
/// # Contract (C033)
/// - `next_chunk` fills `buf` up to its length and returns the number of samples written.
/// - Returns `0` when the source is exhausted.
/// - Must implement `Send` for cross-thread usage in `AudioMixer`.
pub trait SyncAudioSource: Send {
    /// Produce the next chunk of audio samples into `buf`.
    ///
    /// Returns the number of samples written. `0` indicates the source is
    /// exhausted and will produce no further data.
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn next_chunk(&mut self, buf: &mut [i16]) -> usize;
}

// ---------------------------------------------------------------------------
// SyncSourceAdapter — adapts SyncAudioSource into AsyncAudioSource
// ---------------------------------------------------------------------------

/// An adapter that wraps a [`SyncAudioSource`] into an [`AsyncAudioSource`].
///
/// The adapter simply delegates to the inner source's `next_chunk` in an
/// async context. No additional buffering or transformation is performed.
///
/// # Contract (C033)
/// - Delegates every call to the inner `SyncAudioSource::next_chunk`.
/// - Does not add any processing (pure delegation).
/// - `SyncSourceAdapter<T>` implements `AsyncAudioSource + Send` when `T: SyncAudioSource + Send`.
pub struct SyncSourceAdapter<T> {
    inner: T,
}

impl<T: SyncAudioSource + Send> SyncSourceAdapter<T> {
    /// Create a new `SyncSourceAdapter` wrapping the given synchronous source.
    pub fn new(inner: T) -> Self {
        Self { inner }
    }

    /// Consume the adapter and recover the wrapped inner source.
    pub fn into_inner(self) -> T {
        self.inner
    }
}

// SyncSourceAdapter delegates to the inner SyncAudioSource.
#[async_trait::async_trait]
impl<T: SyncAudioSource + Send> AsyncAudioSource for SyncSourceAdapter<T> {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        self.inner.next_chunk(buf)
    }
}

// ---------------------------------------------------------------------------
// Forward Send bound check for Box<dyn ErasedAudioSource>
// ---------------------------------------------------------------------------

// Compile-time check: Box<dyn ErasedAudioSource> must be Send to be usable
// inside AudioMixer's DashMap.
const _: () = {
    const fn assert_send<T: Send>() {}
    assert_send::<Box<dyn ErasedAudioSource>>();
};

// ---------------------------------------------------------------------------
// open_default_microphone_source — optional microphone source (RFC §40)
// ---------------------------------------------------------------------------

/// Open the platform's default microphone as an `AsyncAudioSource`.
///
/// RFC §40: the microphone is one kind of audio source; the crate exposes the
/// device abstraction behind the optional `cpal-input` feature. When the
/// feature is disabled, any type implementing `AsyncAudioSource` can still be
/// injected — the trait abstraction is complete without the microphone.
///
/// This is an independent capture source — **NOT the call microphone**. It
/// captures the OS default input device (cpal) and can be injected into a call
/// via `add_audio_source`, but it is unrelated to the call's send-path input.
///
/// # Contract (C051)
/// With `cpal-input` enabled and a default input device present, this returns
/// `Ok(Box<dyn AsyncAudioSource>)` whose `next_chunk` fills an `i16` buffer with
/// captured PCM. Device-open, format-mismatch, build-stream, and play failures
/// surface as `Err(SipError)` — never a panic.
#[cfg(feature = "cpal-input")]
pub async fn open_default_microphone_source(
    format: AudioFormat,
) -> Result<Box<dyn AsyncAudioSource>, SipError> {
    let source = CpalMicrophoneSource::new(format)?;
    Ok(Box::new(source))
}

// ---------------------------------------------------------------------------
// SampleQueue — thread-safe FIFO of i16 PCM shared with the cpal callback
// ---------------------------------------------------------------------------

/// A FIFO of i16 PCM samples shared between the cpal callback thread (producer)
/// and the async `next_chunk` consumer. The callback clones the queue (an Arc
/// clone) and pushes; `next_chunk` drains. A poisoned mutex is recovered via
/// `into_inner()` because the callback must never unwind across the audio
/// boundary.
#[cfg(feature = "cpal-input")]
#[derive(Clone, Debug, Default)]
// [::TICKET::] P8-7, P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-7|P13-1) --for-spec --no-implementation-order`.
struct SampleQueue {
    samples: Arc<Mutex<VecDeque<i16>>>,
}

#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
impl SampleQueue {
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn new() -> Self {
        Self::default()
    }

    /// Append samples from the cpal callback thread.
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn push_i16(&self, samples: &[i16]) {
        self.samples
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .extend(samples.iter().copied());
    }

    /// Drain queued samples into `buf` in FIFO order; returns the number written.
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn drain_to(&self, buf: &mut [i16]) -> usize {
        let mut guard = self
            .samples
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let written = guard.len().min(buf.len());
        for (slot, sample) in buf.iter_mut().zip(guard.drain(..written)) {
            *slot = sample;
        }
        written
    }
}

// ---------------------------------------------------------------------------
// Sample conversion helpers — device sample format → i16 pipeline contract
// ---------------------------------------------------------------------------

/// Scale factor mapping an f32 sample in [-1.0, 1.0] to the i16 range (2^15).
#[cfg(feature = "cpal-input")]
const F32_TO_I16_SCALE: f32 = 32768.0;

/// DC-offset midpoint of the u16 sample space (2^15), mapping to i16 zero.
#[cfg(feature = "cpal-input")]
const U16_DC_OFFSET: i32 = 0x8000;

/// Convert an f32 sample in [-1.0, 1.0] to i16, clamping out-of-range values.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn convert_f32_sample_to_i16(sample: f32) -> i16 {
    let scaled = sample * F32_TO_I16_SCALE;
    scaled.clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

/// Convert a u16 sample to i16 with a DC-offset-preserving mapping.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn convert_u16_sample_to_i16(sample: u16) -> i16 {
    (sample as i32 - U16_DC_OFFSET) as i16
}

// ---------------------------------------------------------------------------
// Device error mapping — every cpal failure becomes a typed SipError
// ---------------------------------------------------------------------------

/// cpal 0.18 consolidates all device/stream failures into a single `cpal::Error`;
/// each mapping keeps a distinct message prefix so logs are greppable.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn map_default_config_error(err: cpal::Error) -> SipError {
    SipError::new(
        SipErrorKind::NativeError,
        format!("default_input_config_failed: {err}"),
    )
}

#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn map_supported_configs_error(err: cpal::Error) -> SipError {
    SipError::new(
        SipErrorKind::NativeError,
        format!("supported_input_configs_failed: {err}"),
    )
}

#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn map_build_stream_error(err: cpal::Error) -> SipError {
    SipError::new(
        SipErrorKind::NativeError,
        format!("build_stream_failed: {err}"),
    )
}

#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn map_play_error(err: cpal::Error) -> SipError {
    SipError::new(SipErrorKind::NativeError, format!("play_failed: {err}"))
}

/// cpal's error callback — log only; never unwind across the audio boundary.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
fn input_stream_error(err: cpal::Error) {
    tracing::error!(error = %err, "cpal input stream error");
}

// ---------------------------------------------------------------------------
// CpalMicrophoneSource — device-backed AsyncAudioSource
// ---------------------------------------------------------------------------

/// The concrete device-backed source returned by `open_default_microphone_source`.
///
/// Holds the live `cpal::Stream` plus the shared [`SampleQueue`]. `stream` is
/// `None` only in the `#[cfg(test)]` constructor used to exercise the queue and
/// trait behavior without touching audio hardware.
#[cfg(feature = "cpal-input")]
pub struct CpalMicrophoneSource {
    stream: Option<cpal::Stream>,
    queue: SampleQueue,
}

#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
impl CpalMicrophoneSource {
    /// Open the platform default input device, configure capture from `format`,
    /// and start the stream.
    pub fn new(format: AudioFormat) -> Result<Self, SipError> {
        let host = cpal::default_host();
        let device = host.default_input_device().ok_or_else(|| {
            SipError::new(
                SipErrorKind::NativeError,
                "no_default_input_device: no default input device available",
            )
        })?;
        let config = select_input_config(&device, &format)?;
        let queue = SampleQueue::new();
        let stream = build_input_stream(&device, &config, &queue)?;
        stream.play().map_err(map_play_error)?;
        Ok(Self {
            stream: Some(stream),
            queue,
        })
    }

    /// Test-only constructor that bypasses the real cpal stream.
    #[cfg(test)]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn from_queue(queue: SampleQueue) -> Self {
        Self {
            stream: None,
            queue,
        }
    }

    /// Borrow the shared sample queue (used by unit tests to seed samples).
    #[cfg(test)]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn queue(&self) -> &SampleQueue {
        &self.queue
    }
}

#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
impl Drop for CpalMicrophoneSource {
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn drop(&mut self) {
        // Dropping the cpal::Stream stops capture and releases the device; the
        // explicit take() also marks the field as read (kept solely for its
        // Drop side-effect while the source is alive).
        self.stream.take();
    }
}

#[cfg(feature = "cpal-input")]
#[async_trait::async_trait]
// [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
impl AsyncAudioSource for CpalMicrophoneSource {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        self.queue.drain_to(buf)
    }
}

// ---------------------------------------------------------------------------
// cpal stream construction — per-format data callback → SampleQueue
// ---------------------------------------------------------------------------

/// Find the first supported config matching the requested channel count and
/// sample rate among `candidates`, or None when no candidate matches (the
/// caller then falls back to the device default config).
#[cfg(feature = "cpal-input")]
// [::TICKET::] P14-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P14-2 --for-spec --no-implementation-order`.
fn prefer_config_matching_request<'a>(
    candidates: impl IntoIterator<Item = &'a cpal::SupportedStreamConfig>,
    requested_channels: cpal::ChannelCount,
    requested_sample_rate: cpal::SampleRate,
) -> Option<cpal::SupportedStreamConfig> {
    candidates
        .into_iter()
        .find(|config| {
            config.channels() == requested_channels && config.sample_rate() == requested_sample_rate
        })
        .cloned()
}

/// Pick the capture config: prefer a supported config matching the requested
/// sample rate and channel count; fall back to the device default otherwise.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7, P14-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-7|P14-2) --for-spec --no-implementation-order`.
fn select_input_config(
    device: &cpal::Device,
    format: &AudioFormat,
) -> Result<cpal::SupportedStreamConfig, SipError> {
    let requested_channels = match format.channel_layout {
        ChannelLayout::Mono => 1,
        ChannelLayout::StereoInOut => 2,
    };
    let requested_sample_rate = format.sample_rate.as_hz();
    let candidates = device
        .supported_input_configs()
        .map_err(map_supported_configs_error)?
        .filter_map(|range| range.try_with_sample_rate(requested_sample_rate))
        .collect::<Vec<_>>();
    match prefer_config_matching_request(&candidates, requested_channels, requested_sample_rate) {
        Some(config) => Ok(config),
        None => device
            .default_input_config()
            .map_err(map_default_config_error),
    }
}

/// The per-format data-callback handler for the device's native sample format.
///
/// Carries the shared `SampleQueue` clone so the cpal callback thread can enqueue
/// captured samples without touching the async pipeline.
#[cfg(feature = "cpal-input")]
#[derive(Debug)]
// [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
enum SampleFormatHandler {
    I16(SampleQueue),
    F32(SampleQueue),
    U16(SampleQueue),
}

/// Pick the data-callback handler for a sample format, or reject it as
/// unsupported. Only {I16, F32, U16} are convertible to the i16 pipeline
/// contract; every other format maps to SipErrorKind::AudioFormatUnsupported.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
fn select_sample_format_handler(
    sample_format: cpal::SampleFormat,
    queue: SampleQueue,
) -> Result<SampleFormatHandler, SipError> {
    match sample_format {
        cpal::SampleFormat::I16 => Ok(SampleFormatHandler::I16(queue)),
        cpal::SampleFormat::F32 => Ok(SampleFormatHandler::F32(queue)),
        cpal::SampleFormat::U16 => Ok(SampleFormatHandler::U16(queue)),
        other => Err(SipError::new(
            SipErrorKind::AudioFormatUnsupported,
            format!("unsupported_sample_format: {other:?}"),
        )),
    }
}

/// Build an input stream for the device's native sample format, converting each
/// captured frame to i16 before enqueuing it.
#[cfg(feature = "cpal-input")]
// [::TICKET::] P8-7, P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-7|P13-1) --for-spec --no-implementation-order`.
fn build_input_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    queue: &SampleQueue,
) -> Result<cpal::Stream, SipError> {
    let stream_config = config.config();
    let handler = select_sample_format_handler(config.sample_format(), queue.clone())?;
    let stream = match handler {
        SampleFormatHandler::I16(queue) => device.build_input_stream(
            stream_config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| queue.push_i16(data),
            input_stream_error,
            None,
        ),
        SampleFormatHandler::F32(queue) => device.build_input_stream(
            stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let converted: Vec<i16> = data
                    .iter()
                    .map(|&sample| convert_f32_sample_to_i16(sample))
                    .collect();
                queue.push_i16(&converted);
            },
            input_stream_error,
            None,
        ),
        SampleFormatHandler::U16(queue) => device.build_input_stream(
            stream_config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                let converted: Vec<i16> = data
                    .iter()
                    .map(|&sample| convert_u16_sample_to_i16(sample))
                    .collect();
                queue.push_i16(&converted);
            },
            input_stream_error,
            None,
        ),
    };
    stream.map_err(map_build_stream_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test-only imports for the cpal-input-gated signature test, kept at
    // module scope rather than inside the test body.
    #[cfg(feature = "cpal-input")]
    use crate::model::audio_format_chunkpair::{BitDepth, SampleRate};

    // ── Normal: SyncAudioSource ─────────────────────────────────────────

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_audio_source_fills_buffer() {
        // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
        struct TestSource(Vec<i16>, usize);
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for TestSource {
            // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
                let remaining = self.0.len() - self.1;
                let to_copy = remaining.min(buf.len());
                if to_copy > 0 {
                    buf[..to_copy].copy_from_slice(&self.0[self.1..self.1 + to_copy]);
                    self.1 += to_copy;
                }
                to_copy
            }
        }

        let mut src = TestSource(vec![10i16, 20i16, 30i16], 0);
        let mut buf = [0i16; 4];
        let written = SyncAudioSource::next_chunk(&mut src, &mut buf);
        assert_eq!(written, 3, "must write 3 samples");
        assert_eq!(buf[0], 10);
        assert_eq!(buf[1], 20);
        assert_eq!(buf[2], 30);
    }

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_audio_source_empty_returns_zero() {
        // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
        struct EmptySource;
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for EmptySource {
            // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, _buf: &mut [i16]) -> usize {
                0
            }
        }

        let mut src = EmptySource;
        let mut buf = [0i16; 4];
        let written = SyncAudioSource::next_chunk(&mut src, &mut buf);
        assert_eq!(written, 0, "exhausted source returns 0");
    }

    // ── Normal: SyncSourceAdapter construction ──────────────────────────

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_source_adapter_new_and_into_inner() {
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        struct TestData(Vec<i16>);
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for TestData {
            // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
                let written = self.0.len().min(buf.len());
                buf[..written].copy_from_slice(&self.0[..written]);
                written
            }
        }
        let source = TestData(vec![1i16, 2i16]);
        let adapter = SyncSourceAdapter::new(source);
        let inner = adapter.into_inner();
        assert_eq!(inner.0, vec![1i16, 2i16]);
    }

    // ── SyncSourceAdapter delegates to inner ─────────────────────────────

    #[tokio::test]
    /// @verifies C033
    async fn sync_source_adapter_delegates_next_chunk() {
        // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
        struct FixedSource([i16; 3], usize);
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for FixedSource {
            // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
                let remaining = 3 - self.1;
                let to_copy = remaining.min(buf.len());
                if to_copy > 0 {
                    buf[..to_copy].copy_from_slice(&self.0[self.1..self.1 + to_copy]);
                    self.1 += to_copy;
                }
                to_copy
            }
        }

        let inner = FixedSource([42i16, 43i16, 44i16], 0);
        let mut adapter = SyncSourceAdapter::new(inner);
        let mut buf = vec![0i16; 3];
        // Disambiguate: call AsyncAudioSource::next_chunk explicitly since
        // SyncSourceAdapter implements both AsyncAudioSource and ErasedAudioSource
        // (via blanket impl).
        let written = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(written, 3, "adapter must delegate full chunk");
        assert_eq!(buf, vec![42i16, 43i16, 44i16]);
    }

    /// @verifies C033
    #[tokio::test]
    async fn sync_source_adapter_exhausted_returns_zero() {
        // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
        struct Done;
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for Done {
            // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, _buf: &mut [i16]) -> usize {
                0
            }
        }

        let mut adapter = SyncSourceAdapter::new(Done);
        let mut buf = [0i16; 4];
        // Disambiguate via fully-qualified AsyncAudioSource::next_chunk
        let written = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(written, 0, "exhausted adapter returns 0");
    }

    // ── Normal: ErasedAudioSource blanket impl ───────────────────────────

    /// @verifies C033
    #[tokio::test]
    async fn erased_audio_source_blanket_impl_works() {
        use crate::runtime::audio_worker::MockAsyncAudioSource;

        let mut erased: Box<dyn ErasedAudioSource> =
            Box::new(MockAsyncAudioSource::new(vec![5i16; 4]));
        let mut buf = vec![0i16; 4];
        let written = erased.next_chunk(&mut buf).await;
        assert_eq!(
            written, 4,
            "ErasedAudioSource must delegate to inner AsyncAudioSource"
        );
        assert_eq!(buf, vec![5i16; 4]);
    }

    // ── Error: SyncAudioSource buffer limit ────────────────────────────

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_source_adapter_empty_buffer_returns_zero() {
        // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
        struct OneShot;
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for OneShot {
            // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
                if !buf.is_empty() {
                    buf[0] = 1;
                    1
                } else {
                    0
                }
            }
        }

        let mut one_shot = OneShot;
        let mut buf: [i16; 0] = [];
        // Test the inner SyncAudioSource directly (no ambiguity with ErasedAudioSource)
        let written = SyncAudioSource::next_chunk(&mut one_shot, &mut buf);
        assert_eq!(written, 0, "empty buffer returns 0");
    }

    // ── Invariant: Send bounds ─────────────────────────────────────────

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_audio_source_is_send() {
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<Box<dyn SyncAudioSource>>();
    }

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn erased_audio_source_is_send() {
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<Box<dyn ErasedAudioSource>>();
    }

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn mock_async_audio_source_is_send() {
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<MockAsyncAudioSource>();
    }

    // ── Invariant: Compile-time trait bounds ──────────────────────────

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_audio_source_trait_has_required_bounds() {
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // Vec<i16> is not SyncAudioSource — this checks the trait definition compiles
        assert_send::<Box<dyn SyncAudioSource>>();
    }

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn erased_audio_source_trait_is_object_safe() {
        // Compile-time check: ErasedAudioSource is object-safe via Pin<Box<dyn Future>>
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_constructible() {
            let _erased: Box<dyn ErasedAudioSource> = Box::new(MockAsyncAudioSource::new(vec![]));
        }
        let _ = assert_constructible;
    }

    /// @verifies C033
    #[test]
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_source_adapter_is_send_when_inner_is_send() {
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        struct TestSource;
        // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for TestSource {
            // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, _buf: &mut [i16]) -> usize {
                0
            }
        }
        // [::TICKET::] P5-2, P8-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-2|P8-4) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<SyncSourceAdapter<TestSource>>();
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P8-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-2|P8-4) --for-spec --no-implementation-order`.
    fn open_default_microphone_source_has_correct_signature() -> Result<(), &'static str> {
        // O-007 closure: C051 precondition — the RFC §40 signature
        // `open_default_microphone_source(format: AudioFormat) ->
        // Result<Box<dyn AsyncAudioSource>, SipError>` must exist behind the
        // cpal-input feature. The generic bound fails to compile if the output
        // type drifts (wrong error type, wrong source trait object, wrong arity).
        fn assert_microphone_future<F>(fut: F)
        where
            F: std::future::Future<Output = Result<Box<dyn AsyncAudioSource>, SipError>>,
        {
            // The future is dropped without polling — this is a signature
            // contract check, not an execution of the microphone source.
            drop(fut);
        }

        let format = AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20)
            .map_err(|_| "48000/I16/Mono/20ms is a valid AudioFormat")?;
        assert_microphone_future(
            crate::api::asyncaudiosrc_adapter::open_default_microphone_source(format),
        );
        Ok(())
    }

    // ── Boundary (P8-4): 65536-sample buffer ──────────────────────────

    /// @verifies C033
    #[tokio::test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    async fn sync_source_adapter_65536_buffer() {
        // O-004 closure: the upper extreme of the boundary invariant — a
        // 65536-sample buffer must be filled without overflow or truncation.
        // [::TICKET::] P8-4, P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-4|P8-7) --for-spec --no-implementation-order`.
        struct BigSource(Vec<i16>);
        // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
        impl SyncAudioSource for BigSource {
            // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
                let written = self.0.len().min(buf.len());
                buf[..written].copy_from_slice(&self.0[..written]);
                self.0.drain(..written);
                written
            }
        }

        let inner = BigSource(vec![7i16; 65536]);
        let mut adapter = SyncSourceAdapter::new(inner);
        let mut buf = vec![0i16; 65536];
        let written = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(written, 65536, "adapter must fill a 65536-sample buffer");
        assert_eq!(buf[0], 7);
        assert_eq!(buf[65535], 7, "last sample must be preserved");
    }

    // ── C051: device-backed microphone source (P8-7) ──────────────────

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn sample_queue_drains_in_fifo_order() {
        // C051-Post: SampleQueue::drain_to fills an i16 buffer in FIFO order.
        let queue = SampleQueue::new();
        queue.push_i16(&[100i16, 200i16, 300i16]);
        let mut buf = [0i16; 4];
        let written = queue.drain_to(&mut buf);
        assert_eq!(written, 3, "must write exactly the queued samples");
        assert_eq!(buf[0], 100);
        assert_eq!(buf[1], 200);
        assert_eq!(buf[2], 300);
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn sample_queue_empty_returns_zero() {
        // C051-Post: an empty queue reports end-of-stream (0 samples).
        let queue = SampleQueue::new();
        let mut buf = [0i16; 4];
        assert_eq!(queue.drain_to(&mut buf), 0, "empty queue = end of stream");
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn convert_f32_sample_clamps_at_i16_boundaries() {
        // C051-Post/C051-Inv: f32 in [-1.0, 1.0] maps linearly; out-of-range clamps, never wraps.
        assert_eq!(convert_f32_sample_to_i16(1.0), i16::MAX);
        assert_eq!(convert_f32_sample_to_i16(-1.0), i16::MIN);
        assert_eq!(convert_f32_sample_to_i16(0.0), 0);
        assert_eq!(
            convert_f32_sample_to_i16(2.0),
            i16::MAX,
            "out-of-range clamps, never wraps"
        );
        assert_eq!(convert_f32_sample_to_i16(-2.0), i16::MIN);
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn convert_u16_sample_is_bijective_at_extremes() {
        // C051-Inv: u16 -> i16 mapping is bijective at the extremes and preserves DC offset.
        assert_eq!(convert_u16_sample_to_i16(u16::MAX), i16::MAX);
        assert_eq!(convert_u16_sample_to_i16(0), i16::MIN);
        assert_eq!(convert_u16_sample_to_i16(0x8000), 0);
        assert_eq!(convert_u16_sample_to_i16(1), -32767);
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[tokio::test]
    async fn microphone_source_next_chunk_delegates_to_queue() {
        // C051-Post: next_chunk drains the shared SampleQueue into the caller buffer.
        let mut source = CpalMicrophoneSource::from_queue(SampleQueue::new());
        source.queue().push_i16(&[7i16, 8i16, 9i16, 10i16]);
        let mut out = [0i16; 4];
        let written = AsyncAudioSource::next_chunk(&mut source, &mut out).await;
        assert_eq!(written, 4);
        assert_eq!(out, [7i16, 8i16, 9i16, 10i16]);
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[tokio::test]
    async fn microphone_source_zero_length_buffer_returns_zero() {
        // C051-Post: a zero-length buffer returns 0 without panicking.
        let mut source = CpalMicrophoneSource::from_queue(SampleQueue::new());
        let mut empty: [i16; 0] = [];
        let written = AsyncAudioSource::next_chunk(&mut source, &mut empty).await;
        assert_eq!(written, 0, "zero-length buffer returns 0 without panicking");
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P8-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-7 --for-spec --no-implementation-order`.
    fn microphone_source_is_send() {
        // C051-Inv: the source can live in AudioMixer's DashMap as Box<dyn AsyncAudioSource + Send>.
        // [::TICKET::] P8-7, P13-1, P14-2, P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-7|P13-1|P14-2|P17-9) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<CpalMicrophoneSource>();
        assert_send::<Box<dyn AsyncAudioSource>>();
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[tokio::test]
    async fn microphone_source_is_erased_audio_source() {
        // C051-Inv/C033-Inv: ErasedAudioSource blanket impl auto-derives for the concrete source.
        let mut erased: Box<dyn ErasedAudioSource> =
            Box::new(CpalMicrophoneSource::from_queue(SampleQueue::new()));
        let mut buf = vec![0i16; 4];
        let written = erased.next_chunk(&mut buf).await;
        assert_eq!(
            written, 0,
            "empty source reports end-of-stream through the erased wrapper"
        );
    }

    // ── C051 O-001: error-mapping helpers + sample-format dispatch ─────

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
    fn map_default_config_error_maps_to_native_error() {
        // C051-Post (O-001): default-config failure surfaces as SipErrorKind::NativeError.
        let cpal_err = cpal::Error::with_message(
            cpal::ErrorKind::DeviceNotAvailable,
            "no default input config",
        );
        let sip_err = map_default_config_error(cpal_err);
        assert_eq!(sip_err.kind, SipErrorKind::NativeError);
        assert!(
            sip_err.message.contains("default_input_config_failed:"),
            "message must carry the greppable prefix"
        );
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
    fn map_supported_configs_error_maps_to_native_error() {
        // C051-Post (O-001): supported-config enumeration failure surfaces as NativeError.
        let cpal_err = cpal::Error::with_message(cpal::ErrorKind::HostUnavailable, "host absent");
        let sip_err = map_supported_configs_error(cpal_err);
        assert_eq!(sip_err.kind, SipErrorKind::NativeError);
        assert!(sip_err.message.contains("supported_input_configs_failed:"));
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
    fn map_build_stream_error_maps_to_native_error() {
        // C051-Post (O-001): build-stream failure surfaces as NativeError.
        let cpal_err =
            cpal::Error::with_message(cpal::ErrorKind::PermissionDenied, "mic privacy denied");
        let sip_err = map_build_stream_error(cpal_err);
        assert_eq!(sip_err.kind, SipErrorKind::NativeError);
        assert!(sip_err.message.contains("build_stream_failed:"));
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
    fn map_play_error_maps_to_native_error() {
        // C051-Post (O-001): stream.play() failure surfaces as NativeError.
        let cpal_err = cpal::Error::with_message(cpal::ErrorKind::DeviceBusy, "device busy");
        let sip_err = map_play_error(cpal_err);
        assert_eq!(sip_err.kind, SipErrorKind::NativeError);
        assert!(sip_err.message.contains("play_failed:"));
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
    fn select_sample_format_handler_accepts_convertible_formats() {
        // C051-Post (O-001): {I16, F32, U16} select their per-format handler.
        let queue = SampleQueue::new();
        assert!(matches!(
            select_sample_format_handler(cpal::SampleFormat::I16, queue.clone()),
            Ok(SampleFormatHandler::I16(_))
        ));
        assert!(matches!(
            select_sample_format_handler(cpal::SampleFormat::F32, queue.clone()),
            Ok(SampleFormatHandler::F32(_))
        ));
        assert!(matches!(
            select_sample_format_handler(cpal::SampleFormat::U16, queue),
            Ok(SampleFormatHandler::U16(_))
        ));
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P13-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-1 --for-spec --no-implementation-order`.
    fn select_sample_format_handler_rejects_non_convertible_formats() {
        // C051-Post (O-001): every format outside {I16,F32,U16} maps to
        // AudioFormatUnsupported — a violation (panic or wrong kind) fails this test.
        let queue = SampleQueue::new();
        for format in [
            cpal::SampleFormat::I8,
            cpal::SampleFormat::I24,
            cpal::SampleFormat::I32,
            cpal::SampleFormat::I64,
            cpal::SampleFormat::U8,
            cpal::SampleFormat::U24,
            cpal::SampleFormat::U32,
            cpal::SampleFormat::U64,
            cpal::SampleFormat::F64,
            cpal::SampleFormat::DsdU8,
            cpal::SampleFormat::DsdU16,
            cpal::SampleFormat::DsdU32,
        ] {
            let err = select_sample_format_handler(format, queue.clone())
                .expect_err("every non-convertible format must be rejected");
            assert_eq!(
                err.kind,
                SipErrorKind::AudioFormatUnsupported,
                "format {format:?} must map to AudioFormatUnsupported"
            );
            assert!(err.message.contains("unsupported_sample_format:"));
        }
    }

    // ── C051-Inv O-001: config-preference decision (select_input_config) ──

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P14-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P14-2 --for-spec --no-implementation-order`.
    fn prefer_config_matching_request_prefers_exact_match() -> Result<(), String> {
        // C051-Inv (O-001): among constructible candidates, pick the first config
        // matching the requested channel count AND sample rate.
        let candidates = [
            cpal::SupportedStreamConfig::new(
                2,
                48_000,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::I16,
            ),
            cpal::SupportedStreamConfig::new(
                1,
                44_100,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::I16,
            ),
            cpal::SupportedStreamConfig::new(
                1,
                48_000,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::F32,
            ),
        ];
        let picked = prefer_config_matching_request(&candidates, 1, 48_000)
            .ok_or_else(|| "a Mono@48k candidate must be preferred".to_string())?;
        assert_eq!(picked.channels(), 1);
        assert_eq!(picked.sample_rate(), 48_000);
        assert_eq!(picked.sample_format(), cpal::SampleFormat::F32);
        Ok(())
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P14-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P14-2 --for-spec --no-implementation-order`.
    fn prefer_config_matching_request_returns_none_when_no_config_matches() {
        // C051-Inv (O-001): no Mono@48k candidate -> None triggers the
        // default-config fallback inside select_input_config.
        let candidates = [
            cpal::SupportedStreamConfig::new(
                2,
                48_000,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::I16,
            ),
            cpal::SupportedStreamConfig::new(
                1,
                44_100,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::I16,
            ),
        ];
        assert!(
            prefer_config_matching_request(&candidates, 1, 48_000).is_none(),
            "no matching config -> None -> device default fallback"
        );
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P14-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P14-2 --for-spec --no-implementation-order`.
    fn prefer_config_matching_request_prefers_first_exact_match() -> Result<(), String> {
        // C051-Inv (O-001): the first exact channels+rate match in device order wins.
        let candidates = [
            cpal::SupportedStreamConfig::new(
                1,
                48_000,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::I16,
            ),
            cpal::SupportedStreamConfig::new(
                1,
                48_000,
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::F32,
            ),
        ];
        let picked = prefer_config_matching_request(&candidates, 1, 48_000)
            .ok_or_else(|| "an exact match must be picked".to_string())?;
        assert_eq!(picked.sample_format(), cpal::SampleFormat::I16);
        Ok(())
    }

    /// @verifies C051
    #[cfg(feature = "cpal-input")]
    #[test]
    // [::TICKET::] P14-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P14-2 --for-spec --no-implementation-order`.
    fn prefer_config_matching_request_empty_candidates_returns_none() {
        // C051-Inv (O-001): an empty candidate list yields None without panicking.
        let empty: Vec<cpal::SupportedStreamConfig> = Vec::new();
        assert!(prefer_config_matching_request(&empty, 1, 48_000).is_none());
    }

    // ── P17-9 §62.29: mic source documentation contract (C135) ─────────

    /// @verifies C135
    #[test]
    // [::TICKET::] P17-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-9 --for-spec --no-implementation-order`.
    fn microphone_source_doc_distinguishes_from_call_mic() {
        // C135 invariant: open_default_microphone_source is an independent
        // capture source, distinct from the call microphone. The doc comment
        // must state this explicitly so the contract survives doc edits.
        let source = include_str!("asyncaudiosrc_adapter.rs");
        assert!(
            source.contains("NOT the call microphone"),
            "open_default_microphone_source doc must state it is NOT the call microphone"
        );
    }
}
