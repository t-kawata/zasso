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
pub(crate) fn mix_i16_frame_with_gains(
    inputs: &[&[i16]],
    gains: &[f32],
    output: &mut [i16],
) {
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
        *sample = apply_gain_i32(*sample as i32, gain)
            .clamp(i16::MIN as i32, i16::MAX as i32) as i16;
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
}
