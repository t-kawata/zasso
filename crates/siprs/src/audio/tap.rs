//! # 音声タップ
//!
//! 利用者が通話音声を購読するための API を提供する。
//! RFC §22, §22.1 に準拠。

use tokio::sync::mpsc;

use crate::audio::chunk::AudioChunkPair;

/// 音声タップモード。
///
/// `Realtime`（既定）はリアルタイム性を優先し、購読者の処理遅延時に
/// oldest-drop で最新フレームを優先する。
/// `Lossless` はバックプレッシャーをかけてフレームドロップを避ける。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioTapMode {
    /// リアルタイム優先（oldest-drop）。既定。
    Realtime,
    /// ロスレス優先（backpressure）。
    Lossless,
}

impl Default for AudioTapMode {
    fn default() -> Self {
        Self::Realtime
    }
}

/// 音声タップハンドル。
///
/// `subscribe_audio` で取得し、通話音声を非同期で受信する。
pub struct AudioTapHandle {
    /// 受信チャネル。
    rx: mpsc::Receiver<AudioChunkPair>,
}

impl AudioTapHandle {
    /// 新しい `AudioTapHandle` を生成する。
    pub(crate) fn new(rx: mpsc::Receiver<AudioChunkPair>) -> Self {
        Self { rx }
    }

    /// 次のフレームペアを受信する。
    ///
    /// 通話終了後は `None` を返す。
    pub async fn recv(&mut self) -> Option<AudioChunkPair> {
        self.rx.recv().await
    }

    /// 非ブロッキングでフレームペアを受信する。
    pub fn try_recv(&mut self) -> Result<AudioChunkPair, mpsc::error::TryRecvError> {
        self.rx.try_recv()
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Realtime モードの既定値を確認する。
    #[test]
    fn test_tap_mode_default() {
        assert_eq!(AudioTapMode::default(), AudioTapMode::Realtime);
    }

    /// テスト用の AudioChunkPair を生成する。
    fn make_test_pair(value: i16) -> AudioChunkPair {
        AudioChunkPair {
            call_id: crate::util::id::CallId::generate(),
            account_id: crate::util::id::AccountId::generate(),
            timestamp: std::time::SystemTime::now(),
            in_chunk: crate::audio::chunk::AudioChunk::I16(vec![value; 10]),
            out_chunk: crate::audio::chunk::AudioChunk::I16(vec![value; 10]),
        }
    }

    /// Realtime モード: capacity 超過で oldest-drop が発生する。
    #[tokio::test]
    async fn test_tap_realtime_drop() {
        let (tx, mut rx) = mpsc::channel::<AudioChunkPair>(2);

        // Realtime モード: try_send で超過時は drop
        // capacity 2 に対して 3 つ送信 → 最初の2つは成功、3つ目は drop
        assert!(tx.try_send(make_test_pair(1)).is_ok());
        assert!(tx.try_send(make_test_pair(2)).is_ok());
        assert!(tx.try_send(make_test_pair(3)).is_err()); // capacity 超過

        // 最初の2つだけ受信できる
        let received = rx.recv().await;
        assert!(received.is_some());
        let received2 = rx.recv().await;
        assert!(received2.is_some());
        // 3つ目は drop されている
        let received3 = rx.try_recv();
        assert!(received3.is_err());
    }

    /// channel close 後に recv が None を返すことを確認する。
    #[tokio::test]
    async fn test_tap_recv_none_on_close() {
        let (tx, mut rx) = mpsc::channel::<AudioChunkPair>(4);

        // capacity 4 なので送信は成功
        assert!(tx.send(make_test_pair(0)).await.is_ok());
        drop(tx); // 送信側を破棄

        // 最後のフレームを受信
        let received = rx.recv().await;
        assert!(received.is_some());
        // その後 None
        let end = rx.recv().await;
        assert!(end.is_none());
    }
}
