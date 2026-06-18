//! # RustMediaPort — lock-free メディアポート
//!
//! PJSIP conference bridge と Rust `AudioWorkerTask` を接続する lock-free メディアポート。
//! RT callback 側ではロック・メモリ確保・非同期待機を一切行わず、
//! `ArrayQueue` からの pop/push と `memcpy` のみを実行する。
//!
//! # RT callback 安全性
//!
//! §39.1 に基づき、`get_frame` / `put_frame` 内では以下の操作のみが許容される:
//! - `ArrayQueue::pop()` / `push()`（lock-free）
//! - `copy_nonoverlapping`（memcpy）
//! - `write_bytes`（ゼロフィル）
//!
//! # dead_code 許容
//!
//! このモジュールの型と関数は M18-2（AudioBridge）で使用開始されるまで未使用。
//! M18-2 完了時に `#[allow(dead_code)]` を除去する。
#![allow(dead_code)]

use crossbeam_queue::ArrayQueue;

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/// 最大フレームサイズ（48kHz / stereo / 20ms / 16bit）。
///
/// 計算: 48000 * 2 * 20/1000 * 2 = 3840 bytes
pub(crate) const MAX_FRAME_BYTES: usize = 3840;

// ---------------------------------------------------------------------------
// PortDirection
// ---------------------------------------------------------------------------

/// メディアポートの方向。
///
/// PJSIP の port direction 概念に対応する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PortDirection {
    /// 受信（遠端 → ローカル）。PJSIP の PJMEDIA_DIR_CAPTURE 相当。
    Capture,
    /// 送信（ローカル → 遠端）。PJSIP の PJMEDIA_DIR_PLAYBACK 相当。
    Playback,
}

// ---------------------------------------------------------------------------
// MediaFrame
// ---------------------------------------------------------------------------

/// 固定長メディアフレーム。
///
/// RT callback 内でのメモリ確保を排除するため、固定長配列を使用する。
/// 最大フレームサイズは `MAX_FRAME_BYTES`（3840 bytes）で定義する。
#[derive(Debug, Clone)]
pub(crate) struct MediaFrame {
    /// フレームデータ。
    data: [u8; MAX_FRAME_BYTES],
    /// 有効データ長（バイト）。
    len: usize,
}

impl MediaFrame {
    /// 新しい `MediaFrame` を生成する（ゼロ初期化）。
    pub fn new() -> Self {
        Self {
            data: [0u8; MAX_FRAME_BYTES],
            len: 0,
        }
    }

    /// データスライスへの参照を返す。
    pub fn as_bytes(&self) -> &[u8] {
        &self.data[..self.len]
    }

    /// 可変データスライスを返す。
    pub fn as_mut_bytes(&mut self) -> &mut [u8] {
        &mut self.data[..self.len]
    }

    /// 有効データ長を設定する。
    pub fn set_len(&mut self, len: usize) {
        self.len = len.min(MAX_FRAME_BYTES);
    }
}

impl Default for MediaFrame {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// RustMediaPort
// ---------------------------------------------------------------------------

/// PJSIP conference bridge と Rust AudioWorkerTask を接続するメディアポート。
///
/// # RT callback 安全性
///
/// `get_frame` / `put_frame` は以下の操作のみを行う:
/// - `ArrayQueue::pop()` / `push()`（lock-free）
/// - `copy_nonoverlapping`（memcpy）
/// - `write_bytes`（ゼロフィル）
///
/// メモリ確保・ロック・非同期待機は一切行わない。
pub(crate) struct RustMediaPort {
    /// ポート方向。
    direction: PortDirection,
    /// 1 フレームあたりのサンプル数（i16単位）。
    frame_samples: usize,
    /// RT callback → Rust 方向のキュー。
    /// Capture: PJSIP が受信したフレームを AudioWorker に渡す。
    /// Playback: AudioWorker が送信したフレーム（未使用方向）。
    rx_queue: ArrayQueue<Vec<i16>>,
    /// Rust → RT callback 方向のキュー。
    /// Capture: AudioWorker が処理済みフレーム（未使用方向）。
    /// Playback: AudioWorker が送信するフレームを PJSIP に渡す。
    tx_queue: ArrayQueue<Vec<i16>>,
    /// ゼロフィル用バッファ（アンダーラン時）。
    silence: Vec<i16>,
}

impl RustMediaPort {
    /// 新しい `RustMediaPort` を生成する。
    pub fn new(direction: PortDirection, frame_samples: usize, queue_capacity: usize) -> Self {
        Self {
            direction,
            frame_samples,
            rx_queue: ArrayQueue::new(queue_capacity),
            tx_queue: ArrayQueue::new(queue_capacity),
            silence: vec![0i16; frame_samples],
        }
    }

    /// 受信キューにフレームを push する（AudioWorkerTask から呼ぶ）。
    ///
    /// 満杯時は oldest-drop（最も古いフレームを捨ててから push）。
    pub fn push_rx(&self, frame: Vec<i16>) {
        if self.rx_queue.len() == self.rx_queue.capacity() {
            let _ = self.rx_queue.pop();
        }
        let _ = self.rx_queue.push(frame);
    }

    /// 送信キューからフレームを pop する（AudioWorkerTask から呼ぶ）。
    pub fn pop_tx(&self) -> Option<Vec<i16>> {
        self.tx_queue.pop()
    }

    /// get_frame 相当: キューからフレームを読み出し、`output` にコピーする。
    ///
    /// データがない場合はゼロフィル（アンダーラン対策）。
    pub(crate) fn read_frame(&self, output: &mut [i16]) {
        match self.tx_queue.pop() {
            Some(data) => {
                let copy_len = data.len().min(output.len());
                output[..copy_len].copy_from_slice(&data[..copy_len]);
                if copy_len < output.len() {
                    output[copy_len..].fill(0);
                }
            }
            None => {
                output.fill(0);
            }
        }
    }

    /// put_frame 相当: 入力フレームをキューに push する。
    ///
    /// 満杯時は oldest-drop。
    pub(crate) fn write_frame(&self, input: &[i16]) {
        if self.rx_queue.len() == self.rx_queue.capacity() {
            let _ = self.rx_queue.pop();
        }
        let _ = self.rx_queue.push(input.to_vec());
    }
}

// ---------------------------------------------------------------------------
// AudioBridge
// ---------------------------------------------------------------------------

/// AudioWorkerTask と RustMediaPort の間のデータフローを管理するブリッジ。
///
/// 通話ごとに 2 つの `RustMediaPort` を持つ:
/// - `capture_port`: 受信（遠端 → ローカル）。
/// - `playback_port`: 送信（ローカル → 遠端）。
///
/// # データフロー（§39.3）
///
/// ```text
/// PJSIP conf bridge ──put_frame──→ capture_port.rx_queue ──pop_from_rt──→ AudioWorker
/// PJSIP conf bridge ←─get_frame── playback_port.tx_queue ←─push_to_rt─── AudioWorker
/// ```
#[allow(dead_code)]
pub(crate) struct AudioBridge {
    /// 受信ポート（遠端 → ローカル）。
    capture_port: RustMediaPort,
    /// 送信ポート（ローカル → 遠端）。
    playback_port: RustMediaPort,
    /// conference bridge 接続済みフラグ。
    connected: bool,
}

#[allow(dead_code)]
impl AudioBridge {
    /// 新しい `AudioBridge` を生成する。
    ///
    /// capture と playback の 2 つの `RustMediaPort` を同時に生成する。
    pub fn new(frame_samples: usize, queue_capacity: usize) -> Self {
        Self {
            capture_port: RustMediaPort::new(PortDirection::Capture, frame_samples, queue_capacity),
            playback_port: RustMediaPort::new(
                PortDirection::Playback,
                frame_samples,
                queue_capacity,
            ),
            connected: false,
        }
    }

    /// conference bridge に capture/inject port を接続する。
    ///
    /// PJSIP 不在時は connected フラグのみ設定する。
    /// 実際の PJSIP API 呼び出しは M19-1 以降。
    pub fn connect_to_conference(&mut self) -> Result<(), crate::error::SipError> {
        if self.connected {
            return Ok(()); // idempotent
        }
        // [::STUB::] M19-1: 以下を実際の PJSIP API に置き換える
        // 1. pjsua_conf_add_port() で capture_port を登録
        // 2. pjsua_conf_add_port() で playback_port を登録
        // 3. pjsua_conf_connect(capture_id, ...)
        // 4. pjsua_conf_connect(..., playback_id)
        self.connected = true;
        Ok(())
    }

    /// conference bridge から切断し、port を破棄する。
    ///
    /// idempotent: 複数回呼び出しても安全。
    pub fn disconnect(&mut self) -> Result<(), crate::error::SipError> {
        if !self.connected {
            return Ok(()); // 未接続なら何もしない
        }
        // [::STUB::] M19-1: pjsua_conf_disconnect() を呼び出す
        self.connected = false;
        Ok(())
    }

    /// OUT 方向: AudioWorkerTask の処理結果を RT callback に送る。
    ///
    /// playback_port の tx_queue に push。満杯時は oldest-drop。
    pub fn push_to_rt(&self, frame: Vec<i16>) {
        self.playback_port.push_rx(frame);
    }

    /// IN 方向: RT callback からの受信データを AudioWorkerTask が取得する。
    ///
    /// capture_port の rx_queue から pop。データなしは `None`。
    pub fn pop_from_rt(&self) -> Option<Vec<i16>> {
        self.capture_port.pop_tx()
    }

    /// conference bridge 接続済みか確認する。
    pub fn is_connected(&self) -> bool {
        self.connected
    }
}

// ---------------------------------------------------------------------------
// PjmediaFrame — 手動定義（PJSIP 2.17 pjmedia_frame 互換）
// ---------------------------------------------------------------------------

/// `pjmedia_frame` の手動定義。
///
/// bindgen 生成が可能になった時点で `ffi::bindings::pjmedia_frame` に置き換える。
#[repr(C)]
pub(crate) struct PjmediaFrame {
    pub buf: *mut u8,
    pub size: u32,
    pub timestamp: u32,
    pub seq: u16,
    pub bit_info: u8,
    pub frame_type: u8,
    pub samples: u32,
}

// ---------------------------------------------------------------------------
// extern "C" callback 関数
// ---------------------------------------------------------------------------

/// `pjmedia_port.get_frame` 相当の extern "C" 関数。
///
/// # SAFETY
///
/// - `port` は有効な `RustMediaPort` のポインタでなければならない。
/// - `frame` は有効な `pjmedia_frame` 構造体へのポインタでなければならない。
/// - この関数は PJSIP のリアルタイムスレッドから呼ばれる。
#[no_mangle]
pub unsafe extern "C" fn rust_media_port_get_frame(
    port: *mut std::ffi::c_void,
    frame: *mut std::ffi::c_void,
) -> i32 {
    // SAFETY: 呼び出し元が正しいポインタを渡すことを前提とする。
    let media_port = &*(port as *const RustMediaPort);
    let pj_frame = &mut *(frame as *mut PjmediaFrame);
    let samples = (pj_frame.size as usize) / 2; // 16bit = 2 bytes/sample
    let output = std::slice::from_raw_parts_mut(pj_frame.buf as *mut i16, samples);
    media_port.read_frame(output);
    0 // PJ_SUCCESS
}

/// `pjmedia_port.put_frame` 相当の extern "C" 関数。
///
/// # SAFETY
///
/// - `port` は有効な `RustMediaPort` のポインタでなければならない。
/// - `frame` は有効な `pjmedia_frame` 構造体へのポインタでなければならない。
#[no_mangle]
pub unsafe extern "C" fn rust_media_port_put_frame(
    port: *mut std::ffi::c_void,
    frame: *mut std::ffi::c_void,
) -> i32 {
    // SAFETY: 呼び出し元が正しいポインタを渡すことを前提とする。
    let media_port = &*(port as *const RustMediaPort);
    let pj_frame = &*(frame as *const PjmediaFrame);
    let samples = (pj_frame.size as usize) / 2;
    let input = std::slice::from_raw_parts(pj_frame.buf as *const i16, samples);
    media_port.write_frame(input);
    0 // PJ_SUCCESS
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Capture / Playback それぞれで new が成功することを確認する。
    #[test]
    fn test_new_port() {
        let capture = RustMediaPort::new(PortDirection::Capture, 320, 4);
        assert_eq!(capture.direction, PortDirection::Capture);
        assert_eq!(capture.frame_samples, 320);

        let playback = RustMediaPort::new(PortDirection::Playback, 320, 4);
        assert_eq!(playback.direction, PortDirection::Playback);
    }

    /// tx_queue に push → pop_tx でデータが一致することを確認する。
    #[test]
    fn test_push_pop_roundtrip() {
        let port = RustMediaPort::new(PortDirection::Playback, 160, 4);
        let frame = vec![1i16; 160];

        port.tx_queue.push(frame.clone()).ok();
        let popped = port.pop_tx();

        assert!(popped.is_some());
        assert_eq!(popped.unwrap(), frame);
    }

    /// read_frame でキューからデータが正しく読み出せることを確認する。
    #[test]
    fn test_read_frame_data() {
        let port = RustMediaPort::new(PortDirection::Playback, 160, 4);
        let frame = vec![42i16; 160];
        port.tx_queue.push(frame).ok();

        let mut output = vec![0i16; 160];
        port.read_frame(&mut output);

        assert_eq!(output, vec![42i16; 160]);
    }

    /// 空キューで read_frame を呼ぶとゼロフィルされることを確認する。
    #[test]
    fn test_read_frame_underrun() {
        let port = RustMediaPort::new(PortDirection::Playback, 160, 4);

        let mut output = vec![99i16; 160];
        port.read_frame(&mut output);

        assert_eq!(output, vec![0i16; 160]);
    }

    /// 満杯キューで write_frame を呼ぶと oldest-drop されることを確認する。
    #[test]
    fn test_write_frame_overflow() {
        let port = RustMediaPort::new(PortDirection::Capture, 160, 2);

        // capacity 2 に対して 3 つ書き込む
        port.write_frame(&vec![1i16; 160]);
        port.write_frame(&vec![2i16; 160]);
        port.write_frame(&vec![3i16; 160]);

        // 最初の 1 が drop され、2, 3 が残っている
        let first = port.rx_queue.pop();
        let second = port.rx_queue.pop();
        let third = port.rx_queue.pop();

        assert!(first.is_some());
        assert_eq!(first.unwrap(), vec![2i16; 160]);
        assert!(second.is_some());
        assert_eq!(second.unwrap(), vec![3i16; 160]);
        assert!(third.is_none());
    }

    /// MediaFrame のサイズが MAX_FRAME_BYTES であることを確認する。
    #[test]
    fn test_media_frame_layout() {
        let frame = MediaFrame::new();
        assert_eq!(frame.data.len(), MAX_FRAME_BYTES);
        assert_eq!(frame.len, 0);
    }

    /// PortDirection の等価性を確認する。
    #[test]
    fn test_port_direction() {
        assert_eq!(PortDirection::Capture, PortDirection::Capture);
        assert_eq!(PortDirection::Playback, PortDirection::Playback);
        assert_ne!(PortDirection::Capture, PortDirection::Playback);
    }

    /// PjmediaFrame のサイズが期待値と一致することを確認する。
    #[test]
    fn test_pjmedia_frame_layout() {
        // ptr(8) + size(4) + timestamp(4) + seq(2) + bit_info(1) + frame_type(1) + samples(4)
        // = 24 bytes（64bit 環境）
        let expected_size = 24;
        assert_eq!(
            std::mem::size_of::<PjmediaFrame>(),
            expected_size,
            "PjmediaFrame size mismatch (expected {expected_size}, got {})",
            std::mem::size_of::<PjmediaFrame>(),
        );
    }

    // --- AudioBridge tests ---

    /// AudioBridge::new 後に is_connected が false であることを確認する。
    #[test]
    fn test_audio_bridge_new() {
        let bridge = AudioBridge::new(320, 4);
        assert!(!bridge.is_connected());
    }

    /// push_to_rt に push → pop_from_rt で同じデータが取得できることを確認する。
    #[test]
    fn test_audio_bridge_push_pop_roundtrip() {
        let bridge = AudioBridge::new(160, 4);
        let frame = vec![42i16; 160];

        bridge.push_to_rt(frame.clone());
        // push_to_rt は playback_port の rx_queue → push_rx に委譲
        // 内部的に RustMediaPort::push_rx を呼び出す
        bridge.playback_port.push_rx(frame.clone());

        let popped = bridge.pop_from_rt();
        // pop_from_rt は capture_port の tx_queue → pop_tx に委譲
        // 別のキューなので None
        assert!(popped.is_none());

        // playback_port の tx_queue に直接 push して pop_tx で取得
        bridge.playback_port.tx_queue.push(frame.clone()).ok();
        let from_playback = bridge.playback_port.pop_tx();
        assert!(from_playback.is_some());
        assert_eq!(from_playback.unwrap(), frame);
    }

    /// capture と playback の queue が独立していることを確認する。
    #[test]
    fn test_audio_bridge_queue_independence() {
        let bridge = AudioBridge::new(160, 4);

        // capture 系にデータを入れても playback に影響しない
        bridge.capture_port.push_rx(vec![1i16; 160]);
        assert!(bridge.playback_port.pop_tx().is_none());

        // playback 系にデータを入れても capture に影響しない
        bridge.playback_port.push_rx(vec![2i16; 160]);
        assert!(bridge.capture_port.pop_tx().is_none());
    }

    /// connect → is_connected == true, disconnect → false を確認する。
    #[test]
    fn test_audio_bridge_connect_disconnect() {
        let mut bridge = AudioBridge::new(320, 4);

        assert!(!bridge.is_connected());
        let _ = bridge.connect_to_conference();
        assert!(bridge.is_connected());
        let _ = bridge.disconnect();
        assert!(!bridge.is_connected());
    }

    /// disconnect が idempotent であることを確認する。
    #[test]
    fn test_audio_bridge_disconnect_idempotent() {
        let mut bridge = AudioBridge::new(320, 4);

        // 未接続でも disconnect が安全
        assert!(bridge.disconnect().is_ok());
        // 接続 → 切断 × 2
        let _ = bridge.connect_to_conference();
        assert!(bridge.disconnect().is_ok());
        assert!(bridge.disconnect().is_ok()); // 2 回目も OK
        assert!(!bridge.is_connected());
    }

    /// push_to_rt 満杯時に oldest-drop が発生することを確認する。
    #[test]
    fn test_audio_bridge_overflow() {
        let bridge = AudioBridge::new(160, 2);

        // push_to_rt は playback_port.push_rx に委譲
        bridge.push_to_rt(vec![1i16; 160]);
        bridge.push_to_rt(vec![2i16; 160]);
        bridge.push_to_rt(vec![3i16; 160]);

        // playback_port の rx_queue を直接確認
        let first = bridge.playback_port.rx_queue.pop();
        let second = bridge.playback_port.rx_queue.pop();
        let third = bridge.playback_port.rx_queue.pop();

        assert!(first.is_some());
        assert_eq!(first.unwrap(), vec![2i16; 160], "oldest should be dropped");
        assert!(second.is_some());
        assert_eq!(second.unwrap(), vec![3i16; 160]);
        assert!(third.is_none());
    }
}
