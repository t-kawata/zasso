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
use crate::model::audio_format_chunkpair::AudioFormat;

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
/// # Contract (C051)
/// The signature is the RFC-specified API surface. Real capture requires the
/// `cpal` crate, which the AsyncAudioSource ticket's no-new-dependencies
// [::STUB::] P8-7: open_default_microphone_source returns a placeholder because real device capture is not yet wired -- Add cpal as an optional dependency behind the cpal-input feature and implement device-backed capture returning Result<Box<dyn AsyncAudioSource>, SipError> with an integration test
/// constraint prohibits; the body currently returns a typed error.
#[cfg(feature = "cpal-input")]
pub async fn open_default_microphone_source(
    format: AudioFormat,
) -> Result<Box<dyn AsyncAudioSource>, SipError> {
    let _ = format;
    Err(SipError::new(
        SipErrorKind::NativeError,
        "cpal microphone source not yet integrated (P8-4)",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        use crate::error::SipError;
        use crate::model::audio_format_chunkpair::{
            AudioFormat, BitDepth, ChannelLayout, SampleRate,
        };
        use crate::runtime::audio_worker::AsyncAudioSource;

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
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
        assert_microphone_future(crate::api::asyncaudiosrc_adapter::open_default_microphone_source(
            format,
        ));
        Ok(())
    }

    // ── Boundary (P8-4): 65536-sample buffer ──────────────────────────

    /// @verifies C033
    #[tokio::test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    async fn sync_source_adapter_65536_buffer() {
        // O-004 closure: the upper extreme of the boundary invariant — a
        // 65536-sample buffer must be filled without overflow or truncation.
// [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
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
}
