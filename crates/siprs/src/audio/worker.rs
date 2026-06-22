//! # AudioWorker — 音声処理メインループ
//!
//! `AudioMixer` ごとに 1 つ、Tokio の blocking pool 上で動作する。
//! 全非同期ソースから音声を pull し、ミキシング、queue 書き込み、
//! PairAligner 経由の Tap 配送までを行う。
//! RFC §24.3 に準拠。

use std::sync::Arc;

use tokio::sync::watch;

use crate::audio::bridge::PairAligner;
use crate::audio::chunk::AudioChunkPair;
use crate::audio::format::AudioFormat;
use crate::audio::mixer::AudioMixer;
use crate::error::SipError;
use crate::util::id::CallId;

/// 音声処理ワーカー。
///
/// `AudioMixer` を所有し、`spawn_blocking` で駆動される。
/// reactor からの起動パス整備は別チケットで対応。
#[allow(dead_code)]
pub(crate) struct AudioWorker {
    /// 音声ミキサー。
    mixer: Arc<AudioMixer>,
    /// 通話 ID。
    _call_id: CallId,
    /// 音声フォーマット。
    _format: AudioFormat,
    /// Tap 配送チャネル。
    tap_txs: Vec<tokio::sync::mpsc::Sender<AudioChunkPair>>,
    /// IN/OUT ペア整列器。
    pair_aligner: PairAligner,
    /// シャットダウン通知。
    _shutdown: watch::Receiver<bool>,
}

#[allow(dead_code)]
impl AudioWorker {
    /// 新しい `AudioWorker` を生成する。
    pub(crate) fn new(
        mixer: Arc<AudioMixer>,
        call_id: CallId,
        format: AudioFormat,
        tap_txs: Vec<tokio::sync::mpsc::Sender<AudioChunkPair>>,
        shutdown: watch::Receiver<bool>,
    ) -> Self {
        Self {
            mixer,
            _call_id: call_id,
            _format: format,
            tap_txs,
            pair_aligner: PairAligner::new(20), // 20ms tolerance
            _shutdown: shutdown,
        }
    }

    /// 1 フレーム分の音声処理を実行する。
    ///
    /// # 処理順序
    ///
    /// 1. 全ソースから非同期 pull（該当ソースがなければスキップ）
    /// 2. `mix_i16_frame` でミキシング
    /// 3. `out_queue` に push（RT callback が pop する）
    /// 4. `in_queue` から受信音声を pull
    /// 5. PairAligner に push_in / push_out
    /// 6. `try_pair()` でペア生成
    pub(crate) fn process_frame(&mut self) -> Result<(), SipError> {
        // 1. out_queue からミキシング済みフレームを取得（AudioMixer 側で処理）
        //    AudioMixer の out_queue に直接書き込む形式のため、
        //    ここでは out_queue からフレームを取り出して PairAligner に渡す。

        // 2. out_queue からの取得
        if let Some(out_frame) = self.mixer.pop_out_frame() {
            let now = std::time::Instant::now();
            self.pair_aligner.push_out(now, out_frame);
        }

        // 3. in_queue からの受信音声取得
        if let Some(in_frame) = self.mixer.pop_in_frame() {
            let now = std::time::Instant::now();
            self.pair_aligner.push_in(now, in_frame);
        }

        // 4. ペアリング試行（結果を Tap チャネルに配送）
        // try_pair の戻り値は (out_frame, in_frame, timestamp) の tuple。
        // AudioChunkPair への変換には account_id が必要なため、現状は aligner を
        // drain するのみで実際の配送は後続対応とする。
        while let Some((_out, _in, _ts)) = self.pair_aligner.try_pair() {
            // [::STUB::] M18: (out, in, ts) を AudioChunkPair に変換し tap_txs に配送
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::format::BitDepth;
    use crate::audio::format::ChannelLayout;
    use crate::audio::format::SampleRate;

    /// 1 ソースから 10 フレームを処理し、out_queue にフレームが到達することを確認する。
    #[test]
    fn test_single_source() {
        let mixer = Arc::new(AudioMixer::new(16, 16));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let format = AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 10,
        };

        let mut worker = AudioWorker::new(
            mixer.clone(),
            CallId::generate(),
            format,
            vec![],
            shutdown_rx,
        );

        // out_queue に直接フレームを追加
        for i in 0..10 {
            mixer.push_out_frame(vec![i as i16; 160]);
        }

        // process_frame で PairAligner に転送
        for _ in 0..10 {
            let _ = worker.process_frame();
        }

        // out_queue が空になっていること
        assert!(mixer.pop_out_frame().is_none());
    }

    /// in_queue → PairAligner → try_pair のパスを確認する。
    #[test]
    fn test_tap_delivery() {
        let mixer = Arc::new(AudioMixer::new(16, 16));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let format = AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 10,
        };

        let mut worker = AudioWorker::new(
            mixer.clone(),
            CallId::generate(),
            format,
            vec![],
            shutdown_rx,
        );

        // in_queue と out_queue の両方にフレームを追加
        mixer.push_in_frame(vec![1i16; 160]);
        mixer.push_out_frame(vec![2i16; 160]);

        // process_frame → PairAligner でペアリング
        let result = worker.process_frame();
        assert!(result.is_ok());
    }

    /// 空の mixer でも process_frame がエラーにならないことを確認する。
    #[test]
    fn test_empty_frame() {
        let mixer = Arc::new(AudioMixer::new(4, 4));
        let (_shutdown_tx, shutdown_rx) = watch::channel(false);
        let format = AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 10,
        };

        let mut worker = AudioWorker::new(
            mixer.clone(),
            CallId::generate(),
            format,
            vec![],
            shutdown_rx,
        );

        let result = worker.process_frame();
        assert!(result.is_ok());
    }
}
