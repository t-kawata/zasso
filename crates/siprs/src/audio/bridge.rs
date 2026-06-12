//! # ステレオマッピング
//!
//! モノラル IN/OUT フレームを L=IN, R=OUT のステレオ配列に変換する。
//! RFC §26.1 に準拠する。

/// モノラル IN/OUT フレームを L=IN, R=OUT のステレオ配列にインタリーブする。
///
/// 両入力の短い方に合わせて切り詰める。
/// 空入力の場合は空の `Vec` を返す。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) fn interleave_in_out(in_mono: &[i16], out_mono: &[i16]) -> Vec<i16> {
    let pair_count = in_mono.len().min(out_mono.len());
    let mut result = Vec::with_capacity(pair_count * 2);
    for i in 0..pair_count {
        result.push(in_mono[i]);
        result.push(out_mono[i]);
    }
    result
}

/// ステレオ配列を L→IN, R→OUT のモノラルペアにデインタリーブする。
///
/// 入力長が奇数の場合、最後の 1 サンプルは切り捨てる。
/// 空入力の場合は空のペアを返す。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) fn deinterleave_stereo(stereo: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let pair_count = stereo.len() / 2;
    let mut left = Vec::with_capacity(pair_count);
    let mut right = Vec::with_capacity(pair_count);
    for chunk in stereo.chunks_exact(2) {
        left.push(chunk[0]);
        right.push(chunk[1]);
    }
    (left, right)
}

/// f32 版インタリーブ。
///
/// `interleave_in_out` の f32 版。同一の L=IN, R=OUT 配置に従う。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) fn interleave_in_out_f32(in_mono: &[f32], out_mono: &[f32]) -> Vec<f32> {
    let pair_count = in_mono.len().min(out_mono.len());
    let mut result = Vec::with_capacity(pair_count * 2);
    for i in 0..pair_count {
        result.push(in_mono[i]);
        result.push(out_mono[i]);
    }
    result
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 基本: in=[1,2,3], out=[4,5,6] → [1,4,2,5,3,6]（L=IN, R=OUT）。
    #[test]
    fn test_interleave_i16_basic() {
        let result = interleave_in_out(&[1, 2, 3], &[4, 5, 6]);
        assert_eq!(result, vec![1, 4, 2, 5, 3, 6]);
    }

    /// 基本: ステレオ → (IN, OUT) の分離が正しいこと。
    #[test]
    fn test_deinterleave_basic() {
        let stereo = vec![1, 4, 2, 5, 3, 6];
        let (left, right) = deinterleave_stereo(&stereo);
        assert_eq!(left, vec![1, 2, 3]);
        assert_eq!(right, vec![4, 5, 6]);
    }

    /// interleave → deinterleave のラウンドトリップが恒等写像であること。
    #[test]
    fn test_roundtrip() {
        let in_mono = vec![100, 200, 300];
        let out_mono = vec![400, 500, 600];
        let interleaved = interleave_in_out(&in_mono, &out_mono);
        let (left, right) = deinterleave_stereo(&interleaved);
        assert_eq!(left, in_mono);
        assert_eq!(right, out_mono);
    }

    /// IN が OUT より長い場合、短い方 (OUT) に切り詰められること。
    #[test]
    fn test_interleave_in_longer() {
        let result = interleave_in_out(&[1, 2, 3, 4], &[5, 6]);
        assert_eq!(result, vec![1, 5, 2, 6]);
    }

    /// OUT が IN より長い場合、短い方 (IN) に切り詰められること。
    #[test]
    fn test_interleave_out_longer() {
        let result = interleave_in_out(&[1, 2], &[3, 4, 5]);
        assert_eq!(result, vec![1, 3, 2, 4]);
    }

    /// 空入力で空の Vec が返ることを確認する。
    #[test]
    fn test_interleave_empty() {
        let result: Vec<i16> = interleave_in_out(&[], &[]);
        assert!(result.is_empty());
        let result_f32: Vec<f32> = interleave_in_out_f32(&[], &[]);
        assert!(result_f32.is_empty());
    }

    /// f32 版の基本動作を確認する。
    #[test]
    fn test_interleave_f32_basic() {
        let result = interleave_in_out_f32(&[1.0, 2.0], &[3.0, 4.0]);
        assert_eq!(result, vec![1.0, 3.0, 2.0, 4.0]);
    }

    /// 奇数長のステレオ入力で最後のサンプルが切り捨てられることを確認する。
    #[test]
    fn test_deinterleave_odd_length() {
        let stereo = vec![1, 10, 2, 20, 3]; // 5 elements → 奇数
        let (left, right) = deinterleave_stereo(&stereo);
        assert_eq!(left, vec![1, 2]);
        assert_eq!(right, vec![10, 20]);
    }

    /// 1000 サンプルで正しくインタリーブされることを確認する。
    #[test]
    fn test_interleave_large() {
        let in_mono: Vec<i16> = (0..1000).collect();
        let out_mono: Vec<i16> = (1000..2000).collect();
        let result = interleave_in_out(&in_mono, &out_mono);
        assert_eq!(result.len(), 2000);
        // L=IN, R=OUT の配置をスポットチェック。
        for i in 0..1000 {
            assert_eq!(result[i * 2], i as i16);       // L = IN
            assert_eq!(result[i * 2 + 1], (i + 1000) as i16); // R = OUT
        }
    }
}
