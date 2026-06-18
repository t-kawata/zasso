//! # ミキシングアルゴリズム
//!
//! 複数音声ソースの i16 フレームを加算ミキシングする純粋関数。
//! RFC §24.2 に準拠し、i32 accumulation → i16 clamp の順で処理する。

/// 複数の i16 フレームを加算ミキシングする。
///
/// 各サンプル位置で全 input の値を i32 に加算後、i16 範囲に clamp する。
/// 入力リストが空の場合は output をゼロフィルする。
/// 入力長が output より短い場合、不足分はゼロパディング扱いとなる。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) fn mix_i16_frame(inputs: &[&[i16]], output: &mut [i16]) {
    for (sample_idx, out_sample) in output.iter_mut().enumerate() {
        let mut accumulated: i32 = 0;
        for input in inputs {
            accumulated += input.get(sample_idx).copied().unwrap_or(0) as i32;
        }
        *out_sample = accumulated.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
    }
}

/// ゲイン適用版ミキシング。
///
/// 各 input に個別ゲインを乗算してから加算する。
/// `gains` の長さが `inputs` より短い場合、残りのゲインは 1.0 とする。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) fn mix_i16_frame_with_gains(inputs: &[&[i16]], gains: &[f32], output: &mut [i16]) {
    for (sample_idx, out_sample) in output.iter_mut().enumerate() {
        let mut accumulated: i32 = 0;
        for (input_idx, input) in inputs.iter().enumerate() {
            let sample = input.get(sample_idx).copied().unwrap_or(0) as i32;
            let gain = gains.get(input_idx).copied().unwrap_or(1.0);
            accumulated += apply_gain_i32(sample, gain);
        }
        *out_sample = accumulated.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
    }
}

/// 単一 i16 フレームにゲインを適用する。
///
/// `gain * sample` を i32 計算し、i16 範囲に clamp する。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) fn apply_gain_to_frame(frame: &mut [i16], gain: f32) {
    for sample in frame.iter_mut() {
        *sample =
            apply_gain_i32(*sample as i32, gain).clamp(i16::MIN as i32, i16::MAX as i32) as i16;
    }
}

/// i32 値に浮動小数点ゲインを乗算し、i32 に切り詰める内部ヘルパー。
///
/// 乗算結果が i32 範囲を超える場合は飽和させる。
fn apply_gain_i32(value: i32, gain: f32) -> i32 {
    let product = (value as f64) * (gain as f64);
    if product > i32::MAX as f64 {
        i32::MAX
    } else if product < i32::MIN as f64 {
        i32::MIN
    } else {
        product as i32
    }
}

// ---------------------------------------------------------------------------
// AudioMixer
// ---------------------------------------------------------------------------

use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU32;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use crossbeam_queue::ArrayQueue;
use dashmap::DashMap;
use std::num::NonZeroU64;

use crate::audio::source::ErasedAudioSource;
use crate::error::SipError;
use crate::util::id::AudioSourceId;

/// ミキサー内部のソースエントリ。
// AudioWorker 起動後に使用開始される。
#[allow(dead_code)]
struct MixerSourceEntry {
    /// 音声ソース（Mutex で保護、AudioWorkerTask からのみアクセス）。
    source: Mutex<Box<dyn ErasedAudioSource>>,
    /// ゲイン（f32 のビット表現を AtomicU32 で保持）。
    gain: AtomicU32,
    /// ミュートフラグ。
    muted: AtomicBool,
    /// EOF フラグ（ソースが終了したことを示す）。
    eof: AtomicBool,
}

/// 通話単位の音声ミキサー。
///
/// 全ソースから音声を pull し、`mix_i16_frame` でミキシング、
/// 結果を lock-free queue に書き込む。
pub(crate) struct AudioMixer {
    /// ソース管理（通話中の並行追加・削除に備え DashMap）。
    sources: DashMap<AudioSourceId, MixerSourceEntry>,
    /// マスターゲイン（全出力に一律適用、f32 のビット表現）。
    master_gain: AtomicU32,
    /// 次に採番する AudioSourceId の内部値。
    next_id: AtomicU64,
    /// ミキシング済み OUT フレーム（RT callback が消費）。
    out_queue: ArrayQueue<Vec<i16>>,
    /// RT callback からの受信 IN フレーム（AudioWorkerTask が消費）。
    in_queue: ArrayQueue<Vec<i16>>,
}

impl AudioMixer {
    /// 新しい `AudioMixer` を生成する。
    pub(crate) fn new(out_capacity: usize, in_capacity: usize) -> Self {
        Self {
            sources: DashMap::new(),
            master_gain: AtomicU32::new(f32::to_bits(1.0)),
            next_id: AtomicU64::new(1),
            out_queue: ArrayQueue::new(out_capacity),
            in_queue: ArrayQueue::new(in_capacity),
        }
    }

    /// 音声ソースを追加し、`AudioSourceId` を返す。
    pub(crate) fn add_source(&self, source: Box<dyn ErasedAudioSource>) -> AudioSourceId {
        // NonZeroU64 は 0 を禁止しているため、id_value は 1 から開始される。
        // fetch_add で u64::MAX からオーバーフローした場合のみ 0 が返りうるが、
        // 実質的に到達不能（約 1.8e19 回の追加が必要）。
        let id_value = self.next_id.fetch_add(1, Ordering::Relaxed);
        // id_value が 0（カウンタオーバーフロー）の場合は
        // NonZeroU64::MIN を使用する。u64::MAX 回の追加後にのみ発生し、
        // 実質的に到達不能だが、衝突のリスクを許容する。
        let inner = NonZeroU64::new(id_value).unwrap_or(NonZeroU64::MIN);
        let id = AudioSourceId(inner);
        self.sources.insert(
            id,
            MixerSourceEntry {
                source: Mutex::new(source),
                gain: AtomicU32::new(f32::to_bits(1.0)),
                muted: AtomicBool::new(false),
                eof: AtomicBool::new(false),
            },
        );
        id
    }

    /// 音声ソースを削除する。
    ///
    /// 存在しない ID の場合は `false` を返す。
    pub(crate) fn remove_source(&self, id: AudioSourceId) -> bool {
        self.sources.remove(&id).is_some()
    }

    /// ソースのゲインを設定する。
    ///
    /// `gain` は 0.0 以上（負値は呼び出し側で検証済み）。
    pub(crate) fn set_gain(&self, id: AudioSourceId, gain: f32) -> Result<(), SipError> {
        let entry = self
            .sources
            .get(&id)
            .ok_or_else(|| SipError::invalid_state(format!("audio source not found: {id}")))?;
        entry.gain.store(f32::to_bits(gain), Ordering::Release);
        Ok(())
    }

    /// ソースをミュート/ミュート解除する。
    pub(crate) fn mute(&self, id: AudioSourceId, muted: bool) -> Result<(), SipError> {
        let entry = self
            .sources
            .get(&id)
            .ok_or_else(|| SipError::invalid_state(format!("audio source not found: {id}")))?;
        entry.muted.store(muted, Ordering::Release);
        Ok(())
    }

    /// ミキシング済みフレームを OUT queue に push する。
    ///
    /// 満杯時は oldest-drop（最新フレームを優先）。
    pub(crate) fn push_out_frame(&self, frame: Vec<i16>) {
        if self.out_queue.len() >= self.out_queue.capacity() {
            #[cfg(feature = "metrics")]
            crate::metrics::increment_audio_tap_overflows();
            // oldest-drop: 最も古いフレームを捨てる
            let _ = self.out_queue.pop();
        }
        // 満杯でない場合（または drop 後）は push
        let _ = self.out_queue.push(frame);
    }

    /// ミキシング済みフレームを OUT queue から pop する。
    ///
    /// RT callback 側から呼ばれる。空の場合は `None`。
    pub(crate) fn pop_out_frame(&self) -> Option<Vec<i16>> {
        self.out_queue.pop()
    }

    /// IN フレームを queue に push する。
    ///
    /// RT callback からの受信フレームを格納。満杯時は oldest-drop。
    pub(crate) fn push_in_frame(&self, frame: Vec<i16>) {
        if self.in_queue.len() >= self.in_queue.capacity() {
            #[cfg(feature = "metrics")]
            crate::metrics::increment_audio_tap_overflows();
            let _ = self.in_queue.pop();
        }
        let _ = self.in_queue.push(frame);
    }

    /// IN フレームを queue から pop する。
    ///
    /// AudioWorkerTask 側から呼ばれる。空の場合は `None`。
    pub(crate) fn pop_in_frame(&self) -> Option<Vec<i16>> {
        self.in_queue.pop()
    }

    /// マスターゲインを設定する。
    pub(crate) fn set_master_gain(&self, gain: f32) {
        self.master_gain
            .store(f32::to_bits(gain), Ordering::Release);
    }

    /// 現在のマスターゲインを取得する。
    fn master_gain_value(&self) -> f32 {
        f32::from_bits(self.master_gain.load(Ordering::Acquire))
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 単一 input がそのまま output に反映されることを確認する。
    #[test]
    fn test_mix_single_input() {
        let mut output = vec![0i16; 3];
        mix_i16_frame(&[&[100, 200, 300]], &mut output);
        assert_eq!(output, vec![100, 200, 300]);
    }

    /// 2 つの input が正しく加算されることを確認する。
    #[test]
    fn test_mix_two_inputs() {
        let mut output = vec![0i16; 2];
        mix_i16_frame(&[&[100, 200], &[50, 100]], &mut output);
        assert_eq!(output, vec![150, 300]);
    }

    /// 加算結果が i16::MAX を超えた場合に飽和することを確認する。
    #[test]
    fn test_mix_overflow_clamp() {
        let mut output = vec![0i16; 1];
        mix_i16_frame(&[&[i16::MAX], &[1]], &mut output);
        assert_eq!(output[0], i16::MAX);
    }

    /// 加算結果が i16::MIN を下回った場合に飽和することを確認する。
    #[test]
    fn test_mix_underflow_clamp() {
        let mut output = vec![0i16; 1];
        mix_i16_frame(&[&[i16::MIN], &[-1]], &mut output);
        assert_eq!(output[0], i16::MIN);
    }

    /// 空の input リストで output がゼロフィルされることを確認する。
    #[test]
    fn test_mix_empty_inputs() {
        let mut output = vec![42i16; 3];
        mix_i16_frame(&[], &mut output);
        assert_eq!(output, vec![0, 0, 0]);
    }

    /// 入力長が不一致の場合、短い方がゼロパディング扱いとなることを確認する。
    #[test]
    fn test_mix_mismatched_lengths() {
        let mut output = vec![0i16; 3];
        mix_i16_frame(&[&[100, 200, 300], &[50]], &mut output);
        assert_eq!(output, vec![150, 200, 300]);
    }

    /// gain=0.5 で値が半減することを確認する。
    #[test]
    fn test_mix_with_gains_half() {
        let mut output = vec![0i16; 2];
        mix_i16_frame_with_gains(&[&[100, 200]], &[0.5], &mut output);
        assert_eq!(output, vec![50, 100]);
    }

    /// gain=0.0 で全ゼロになることを確認する。
    #[test]
    fn test_mix_with_gains_zero() {
        let mut output = vec![42i16; 2];
        mix_i16_frame_with_gains(&[&[100, 200]], &[0.0], &mut output);
        assert_eq!(output, vec![0, 0]);
    }

    /// gain=2.0 で値が倍になることを確認する。
    #[test]
    fn test_mix_with_gains_double() {
        let mut output = vec![0i16; 1];
        mix_i16_frame_with_gains(&[&[10000]], &[2.0], &mut output);
        assert_eq!(output, vec![20000]);
    }

    /// apply_gain_to_frame で gain=0.5 が正しく適用されることを確認する。
    #[test]
    fn test_apply_gain_half() {
        let mut frame = vec![100, 200];
        apply_gain_to_frame(&mut frame, 0.5);
        assert_eq!(frame, vec![50, 100]);
    }

    /// apply_gain_to_frame でゲイン適用後の値が i16::MAX で飽和することを確認する。
    #[test]
    fn test_apply_gain_clamp() {
        let mut frame = vec![20000];
        apply_gain_to_frame(&mut frame, 2.0);
        assert_eq!(frame[0], i16::MAX);
    }

    /// 1000 サンプル × 10 入力 × 1000 回のストレステスト。
    ///
    /// 大量の加算でもオーバーフロー/アンダーフローが発生せず、
    /// 全ての値が i16 範囲内に収まることを確認する。
    #[test]
    fn test_mix_stress() {
        let sample_count = 1000;
        let input_count = 10;

        // 各入力に i16::MAX / input_count の値を設定（合計で i16::MAX を超えない）。
        let inputs: Vec<Vec<i16>> = (0..input_count)
            .map(|_| (0..sample_count).map(|_| 3000i16).collect())
            .collect();
        let input_refs: Vec<&[i16]> = inputs.iter().map(|v| v.as_slice()).collect();

        let mut output = vec![0i16; sample_count];

        for _ in 0..1000 {
            output.fill(0);
            mix_i16_frame(&input_refs, &mut output);
        }

        // 全てのサンプルが i16 範囲内。
        for sample in &output {
            assert!(*sample >= i16::MIN);
            assert!(*sample <= i16::MAX);
        }
    }

    // -----------------------------------------------------------------------
    // AudioMixer tests
    // -----------------------------------------------------------------------

    /// add_source で ID が採番されることを確認する。
    #[test]
    fn test_add_source() {
        let mixer = AudioMixer::new(4, 4);
        let id = mixer.add_source(Box::new(MockAudioSource));
        // ID は 0 以外（NonZeroU64 のため 1 から開始）
        assert_ne!(id.into_raw(), 0);
    }

    /// ソース追加 → 削除 → 再追加で ID が単調増加することを確認する。
    #[test]
    fn test_add_remove_reuse() {
        let mixer = AudioMixer::new(4, 4);
        let id1 = mixer.add_source(Box::new(MockAudioSource));
        mixer.remove_source(id1);
        let id2 = mixer.add_source(Box::new(MockAudioSource));
        assert!(id2.into_raw() > id1.into_raw());
    }

    /// push_out_frame → pop_out_frame が同じデータを返すことを確認する。
    #[test]
    fn test_out_queue_roundtrip() {
        let mixer = AudioMixer::new(2, 2);
        mixer.push_out_frame(vec![1, 2, 3]);
        let popped = mixer.pop_out_frame();
        assert_eq!(popped, Some(vec![1, 2, 3]));
    }

    /// out_queue 満杯時に oldest-drop されることを確認する。
    #[test]
    fn test_out_queue_overflow() {
        let mixer = AudioMixer::new(2, 2);
        mixer.push_out_frame(vec![1]);
        mixer.push_out_frame(vec![2]);
        mixer.push_out_frame(vec![3]); // これで [1] が drop される
        let first = mixer.pop_out_frame();
        assert_eq!(first, Some(vec![2])); // 古い方 [1] が drop され [2] が残る
    }

    /// in_queue 満杯時に oldest-drop されることを確認する。
    #[test]
    fn test_in_queue_overflow() {
        let mixer = AudioMixer::new(2, 2);
        mixer.push_in_frame(vec![1]);
        mixer.push_in_frame(vec![2]);
        mixer.push_in_frame(vec![3]); // [1] が drop
        let first = mixer.pop_in_frame();
        assert_eq!(first, Some(vec![2])); // [2] が残る
    }

    /// set_master_gain(0.5) で値が変化することを確認する。
    #[test]
    fn test_master_gain() {
        let mixer = AudioMixer::new(4, 4);
        mixer.set_master_gain(0.5);
        let gain = f32::from_bits(mixer.master_gain.load(Ordering::Acquire));
        // f32 の比較は誤差を許容
        assert!((gain - 0.5).abs() < 1e-6);
    }

    /// テスト用のモック音声ソース。
    struct MockAudioSource;

    impl crate::audio::source::ErasedAudioSource for MockAudioSource {
        fn next_chunk<'a>(
            &'a mut self,
            _buf: &'a mut [i16],
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = usize> + Send + 'a>> {
            Box::pin(async move { 0 })
        }
    }
}
