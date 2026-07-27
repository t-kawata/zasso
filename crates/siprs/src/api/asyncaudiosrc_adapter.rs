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

//! Audio source abstractions for the media pipeline.
//!
//! Provides three layers of audio source trait:
//!
//! 1. **`AsyncAudioSource`** — the primary trait users implement. Uses RPITIT
//!    (`async fn` in trait) for ergonomic implementation without manual
//!    `Pin<Box<dyn Future>>` boilerplate. Requires `Send`.
//!
//! 2. **`ErasedAudioSource`** — object-safe wrapper trait used internally by
//!    `AudioMixer` for dynamic dispatch. Automatically derived via blanket
//!    impl for every `T: AsyncAudioSource + Send`.
//!
//! 3. **`SyncAudioSource`** — synchronous audio source trait for simple
//!    producers (e.g., file readers, test sources). Bridged to `AsyncAudioSource`
//!    via `SyncSourceAdapter<T>`.
//!
//! ## N0032 → N0031 (C033)
//!
//! Relies on Audio Subscribe (P5-1) defining `AudioTapHandle` and backpressure
//! policy; the traits defined here are consumed by the future `AudioMixer`
//! pipeline (P4-3+).

use std::future::Future;
use std::pin::Pin;

// ---------------------------------------------------------------------------
// AsyncAudioSource — primary trait with RPITIT
// ---------------------------------------------------------------------------

/// Asynchronous audio source trait.
///
/// Users implement this trait to provide audio frames to the mixing pipeline.
/// Because it uses RPITIT (`async fn` in trait), implementors write a plain
/// `async fn` without manually boxing futures.
///
/// The `next_chunk` method fills `buf` with interleaved PCM samples (`i16`)
/// and returns the number of samples written. The returned value is always
/// `≤ buf.len()`. A return of `0` signals end-of-stream or backpressure.
pub trait AsyncAudioSource: Send {
    /// Fill `buf` with the next chunk of audio samples.
    ///
    /// Returns the number of samples written, which must not exceed `buf.len()`.
    /// Returning `0` signals that no data is available (end-of-stream or
    /// transient underrun).
    ///
    /// The `+ Send` bound on the returned future ensures that the future can be
    /// boxed into `Pin<Box<dyn Future<Output = usize> + Send>>` for dynamic
    /// dispatch via `ErasedAudioSource`.
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn next_chunk(&mut self, buf: &mut [i16]) -> impl Future<Output = usize> + Send;
}

// ---------------------------------------------------------------------------
// ErasedAudioSource — object-safe wrapper for dynamic dispatch
// ---------------------------------------------------------------------------

/// Object-safe version of `AsyncAudioSource` for dynamic dispatch.
///
/// Used internally by `AudioMixer` to hold heterogeneous audio sources as
/// `Box<dyn ErasedAudioSource>`. Automatically derived for every type that
/// implements `AsyncAudioSource + Send` — users never implement this trait
/// directly.
///
/// The `next_chunk` method returns a pinned, boxed future so that the trait
/// remains object-safe despite the `async fn` signature.
pub trait ErasedAudioSource: Send {
    /// Fill `buf` with audio samples, returning a pinned future.
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>>;
}

/// Blanket impl: every `AsyncAudioSource + Send` automatically becomes an
/// `ErasedAudioSource` by boxing the async fn's returned future.
impl<T: AsyncAudioSource + Send> ErasedAudioSource for T {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>> {
        Box::pin(AsyncAudioSource::next_chunk(self, buf))
    }
}

// ---------------------------------------------------------------------------
// SyncAudioSource — synchronous audio source trait
// ---------------------------------------------------------------------------

/// Synchronous audio source for simple producers.
///
/// Types implementing this trait can be adapted to `AsyncAudioSource` via
/// `SyncSourceAdapter<T>`, enabling use in the async audio pipeline without
/// modifying the source implementation.
pub trait SyncAudioSource: Send {
    /// Fill `buf` with audio samples and return the count written.
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn next_chunk(&mut self, buf: &mut [i16]) -> usize;
}

// ---------------------------------------------------------------------------
// SyncSourceAdapter — bridges sync sources into the async pipeline
// ---------------------------------------------------------------------------

/// Adapter that wraps a `SyncAudioSource` as an `AsyncAudioSource`.
///
/// ## Example
///
/// ```rust,ignore
/// struct MySource;
/// impl SyncAudioSource for MySource {
///     fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
///         for sample in buf.iter_mut() { *sample = 42; }
///         buf.len()
///     }
/// }
/// let adapter = SyncSourceAdapter::new(MySource);
/// // adapter now implements AsyncAudioSource
/// ```
pub struct SyncSourceAdapter<T> {
    inner: T,
}

impl<T> SyncSourceAdapter<T> {
    /// Wraps a `SyncAudioSource` for use as an `AsyncAudioSource`.
    pub fn new(inner: T) -> Self {
        SyncSourceAdapter { inner }
    }
}

impl<T: SyncAudioSource + Send> AsyncAudioSource for SyncSourceAdapter<T> {
    /// Delegates to the inner `SyncAudioSource::next_chunk`, wrapping the
    /// synchronous call in an async fn (no actual async work — the call is
    /// immediate).
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        self.inner.next_chunk(buf)
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C033: AsyncAudioSource trait ───────────────────────────────────────
    // -----------------------------------------------------------------------

    /// Helper sync source that returns `buf.len()` (full fill) for testing.
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    struct FillSource;
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    impl SyncAudioSource for FillSource {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
            buf.len()
        }
    }

    /// Helper sync source that returns 0 (empty/underrun) for testing.
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    struct EmptySource;
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    impl SyncAudioSource for EmptySource {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn next_chunk(&mut self, _buf: &mut [i16]) -> usize {
            0
        }
    }

    /// @verifies C033-precondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn audio_source_type_chain_compiles() {
        let _adapter = SyncSourceAdapter::new(FillSource);
        // adapter implements AsyncAudioSource
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_async<T: AsyncAudioSource>() {}
        assert_async::<SyncSourceAdapter<FillSource>>();
    }

    /// @verifies C033-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_source_adapter_constructs() {
        let _adapter = SyncSourceAdapter::new(FillSource);
    }

    /// @verifies C033-postcondition
    #[tokio::test]
    async fn sync_source_adapter_delegates_to_inner() {
        let mut adapter = SyncSourceAdapter::new(FillSource);
        let mut buf = [0i16; 160];
        let count = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(count, 160);
    }

    /// @verifies C033-postcondition
    #[tokio::test]
    async fn sync_source_adapter_inner_returns_zero_for_empty() {
        let mut adapter = SyncSourceAdapter::new(EmptySource);
        let mut buf = [0i16; 160];
        let count = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(count, 0);
    }

    /// @verifies C033-boundary
    #[tokio::test]
    async fn sync_source_adapter_zero_length_buffer() {
        let mut adapter = SyncSourceAdapter::new(FillSource);
        let mut buf: [i16; 0] = [];
        let count = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(count, 0);
    }

    /// @verifies C033-boundary
    #[tokio::test]
    async fn sync_source_adapter_large_buffer() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        struct ConstSource;
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        impl SyncAudioSource for ConstSource {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
            fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
                for s in buf.iter_mut() {
                    *s = 1;
                }
                buf.len()
            }
        }
        let mut adapter = SyncSourceAdapter::new(ConstSource);
        let mut buf = [0i16; 65535];
        let count = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(count, 65535);
        assert!(buf.iter().all(|&s| s == 1));
    }

    /// @verifies C033-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn async_audio_source_requires_send() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<SyncSourceAdapter<FillSource>>();
    }

    /// @verifies C033-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn erased_audio_source_blanket_impl_works() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_erased<T: ErasedAudioSource>() {}
        assert_erased::<SyncSourceAdapter<FillSource>>();

        // Trait object should compile
        let _obj: Option<Box<dyn ErasedAudioSource>> = None;
    }

    /// @verifies C033-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn sync_audio_source_requires_send() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<FillSource>();
        assert_send::<EmptySource>();
    }
}
