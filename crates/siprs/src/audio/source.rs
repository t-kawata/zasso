//! # 音声ソース抽象
//!
//! 利用者が非同期音声ソースを実装するためのプライマリ trait `AsyncAudioSource` と、
//! 内部動的ディスパッチ用の `ErasedAudioSource` blanket impl を提供する。
//! RFC §23, §23.1 に準拠。

use std::future::Future;
use std::pin::Pin;

/// 非同期音声ソース。
///
/// 利用者が実装するプライマリ trait。RPITIT により `impl Future` を trait 内で宣言可能。
/// `Send` 境界を要求し、スレッド間移動を安全にする。
///
/// # 実装例
///
/// ```rust
/// use siprs::audio::source::AsyncAudioSource;
///
/// struct SineSource { phase: f64 }
///
/// impl AsyncAudioSource for SineSource {
///     fn next_chunk(&mut self, buf: &mut [i16]) -> impl std::future::Future<Output = usize> + Send {
///         let len = buf.len();
///         let phase = self.phase;
///         let step = 440.0 / 48000.0 * 2.0 * std::f64::consts::PI;
///         async move {
///             for (i, sample) in buf.iter_mut().enumerate() {
///                 let theta = phase + i as f64 * step;
///                 *sample = (theta.sin() * 0.3 * 32767.0) as i16;
///             }
///             len
///         }
///     }
/// }
/// ```
pub trait AsyncAudioSource: Send {
    /// 次のオーディオチャンクを `buf` に書き込む。
    ///
    /// 戻り値は実際に書き込まれたサンプル数（`buf.len()` 以下）。
    /// 0 を返すとストリーム終了（EOF）とみなす。
    fn next_chunk(&mut self, buf: &mut [i16]) -> impl Future<Output = usize> + Send;
}

/// Object-safe な音声ソース。
///
/// `AudioMixer` 内部での動的ディスパッチ用。
/// `AsyncAudioSource` 実装から blanket impl で自動導出される。
/// 通常の利用者が直接実装することは想定していない。
pub trait ErasedAudioSource: Send {
    /// 次のオーディオチャンクを `buf` に書き込む（boxed future 版）。
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>>;
}

/// blanket impl: `AsyncAudioSource` → `ErasedAudioSource` を自動導出。
///
/// 利用者が `AsyncAudioSource` を実装するだけで、自動的に `ErasedAudioSource` も
/// 実装される。これにより `Box<dyn ErasedAudioSource>` での動的ディスパッチが可能になる。
impl<T: AsyncAudioSource + Send> ErasedAudioSource for T {
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>> {
        Box::pin(AsyncAudioSource::next_chunk(self, buf))
    }
}

// ---------------------------------------------------------------------------
// SyncAudioSource
// ---------------------------------------------------------------------------

/// 同期音声ソース。
///
/// 同期的な音声ソース（ファイル読み込み、生成アルゴリズム等）を
/// `AsyncAudioSource` に適合させるためのプライマリ trait。
pub trait SyncAudioSource: Send {
    /// 次のオーディオチャンクを `buf` に書き込む。
    ///
    /// 戻り値は実際に書き込まれたサンプル数（`buf.len()` 以下）。
    /// 0 を返すとストリーム終了（EOF）とみなす。
    fn next_chunk(&mut self, buf: &mut [i16]) -> usize;
}

/// 同期音声ソースを非同期に適合させるアダプタ。
///
/// `SyncAudioSource` 実装をラップし、`AsyncAudioSource` として提供する。
pub struct SyncSourceAdapter<T: SyncAudioSource + Send> {
    /// 内部の同期音声ソース。
    inner: T,
}

impl<T: SyncAudioSource + Send> SyncSourceAdapter<T> {
    /// 新しいアダプタを生成する。
    pub fn new(inner: T) -> Self {
        Self { inner }
    }

    /// 元の同期音声ソースを返す。
    pub fn into_inner(self) -> T {
        self.inner
    }
}

impl<T: SyncAudioSource + Send> AsyncAudioSource for SyncSourceAdapter<T> {
    fn next_chunk(&mut self, buf: &mut [i16]) -> impl Future<Output = usize> + Send {
        let written = self.inner.next_chunk(buf);
        async move { written }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// テスト用のモック音声ソース。
    ///
    /// `next_chunk` が呼ばれるたびにカウンタをインクリメントし、
    /// バッファをパターンで埋める。
    struct MockSource {
        counter: u32,
    }

    impl AsyncAudioSource for MockSource {
        fn next_chunk(&mut self, buf: &mut [i16]) -> impl Future<Output = usize> + Send {
            let len = buf.len();
            self.counter += 1;
            let counter = self.counter;
            for (i, sample) in buf.iter_mut().enumerate() {
                *sample = (counter as i16).wrapping_add(i as i16);
            }
            async move { len }
        }
    }

    /// MockSource が AsyncAudioSource を実装し、正しいサンプル数を返すことを確認する。
    #[tokio::test]
    async fn test_mock_source() {
        let mut source = MockSource { counter: 0 };
        let mut buf = vec![0i16; 64];

        // UFCS で AsyncAudioSource の next_chunk を明示的に呼び出す
        let written = AsyncAudioSource::next_chunk(&mut source, &mut buf).await;
        assert_eq!(written, 64);
        // バッファの先頭サンプルが counter の値であること
        assert_eq!(buf[0], 1); // counter == 1
        assert_eq!(buf[1], 2); // 1 + 1
    }

    /// Box<dyn ErasedAudioSource> がコンパイル可能であることを確認する。
    #[test]
    fn test_erased_trait_object() {
        fn _assert_erased(_: Box<dyn ErasedAudioSource>) {}
        let _source: Box<dyn ErasedAudioSource> = Box::new(MockSource { counter: 0 });
        drop(_source);
    }

    /// blanket impl により MockSource が自動で ErasedAudioSource を実装することを確認する。
    #[tokio::test]
    async fn test_blanket_impl() {
        let mut source: Box<dyn ErasedAudioSource> = Box::new(MockSource { counter: 0 });
        let mut buf = vec![0i16; 32];

        let written = source.next_chunk(&mut buf).await;
        assert_eq!(written, 32);
        assert_eq!(buf[0], 1); // counter == 1
    }

    /// ErasedAudioSource 経由の呼び出しが元の AsyncAudioSource 実装と同じ結果を返す。
    #[tokio::test]
    async fn test_erased_via_trait_object() {
        let mut erased: Box<dyn ErasedAudioSource> = Box::new(MockSource { counter: 0 });
        let mut buf = vec![0i16; 16];

        let written = erased.next_chunk(&mut buf).await;
        assert_eq!(written, 16);
        // 2回目の呼び出しで counter が進む
        let written = erased.next_chunk(&mut buf).await;
        assert_eq!(written, 16);
        assert_eq!(buf[0], 2); // counter == 2
    }

    /// Send 境界が充足されることをコンパイル時に確認する。
    #[test]
    fn test_send_sync() {
        fn assert_send<T: Send>() {}
        assert_send::<MockSource>();
        assert_send::<Box<dyn ErasedAudioSource>>();
    }

    // -----------------------------------------------------------------------
    // SyncAudioSource tests
    // -----------------------------------------------------------------------

    /// テスト用の同期モック音声ソース。
    struct MockSyncSource {
        counter: u32,
    }

    impl SyncAudioSource for MockSyncSource {
        fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
            let len = buf.len();
            self.counter += 1;
            for (i, sample) in buf.iter_mut().enumerate() {
                *sample = (self.counter as i16).wrapping_add(i as i16);
            }
            len
        }
    }

    /// SyncSourceAdapter 経由で AsyncAudioSource として使用可能であることを確認する。
    #[tokio::test]
    async fn test_sync_source_adapter() {
        let source = MockSyncSource { counter: 0 };
        let mut adapter = SyncSourceAdapter::new(source);
        let mut buf = vec![0i16; 32];

        // UFCS で曖昧性を解消
        let written = AsyncAudioSource::next_chunk(&mut adapter, &mut buf).await;
        assert_eq!(written, 32);
        assert_eq!(buf[0], 1); // counter == 1
    }

    /// into_inner() が元の実装を返すことを確認する。
    #[test]
    fn test_into_inner() {
        let source = MockSyncSource { counter: 42 };
        let adapter = SyncSourceAdapter::new(source);
        let recovered = adapter.into_inner();
        assert_eq!(recovered.counter, 42);
    }

    /// Send 境界が充足されることをコンパイル時に確認する。
    #[test]
    fn test_sync_source_send() {
        fn assert_send<T: Send>() {}
        assert_send::<MockSyncSource>();
        assert_send::<SyncSourceAdapter<MockSyncSource>>();
    }
}
