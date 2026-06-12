//! # ステレオマッピング
//!
//! モノラル IN/OUT フレームを L=IN, R=OUT のステレオ配列に変換する。
//! RFC §26.1 に準拠する。
//!
//! また、IN/OUT ペア整列アルゴリズム `PairAligner` を提供する（RFC §25）。

use std::collections::VecDeque;
use std::time::{Duration, Instant};

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
// PairAligner — IN/OUT ペア整列アルゴリズム（RFC §25）
// ---------------------------------------------------------------------------

/// タイムスタンプ付きフレーム。
struct TimedFrame<T> {
    /// モノトニッククロック由来のタイムスタンプ。
    ts_mono: Instant,
    /// フレームデータ。
    data: T,
}

/// IN/OUT ペア整列アルゴリズム。
///
/// 2 本の timestamped ring buffer（`in_q`, `out_q`）を持ち、
/// 共通 frame boundary で最も近いサンプル列を結合する。
// M15-1 (AudioMixer) で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) struct PairAligner {
    /// IN フレームキュー（RTP 受信音声）。
    in_q: VecDeque<TimedFrame<Vec<i16>>>,
    /// OUT フレームキュー（ローカルミキサー出力）。
    out_q: VecDeque<TimedFrame<Vec<i16>>>,
    /// ペアリング許容時間差。
    tolerance: Duration,
}

#[allow(dead_code)]
impl PairAligner {
    /// 許容時間差を指定して `PairAligner` を生成する。
    pub(crate) fn new(tolerance_ms: u64) -> Self {
        Self {
            in_q: VecDeque::new(),
            out_q: VecDeque::new(),
            tolerance: Duration::from_millis(tolerance_ms),
        }
    }

    /// IN フレームをキューに追加する。
    pub(crate) fn push_in(&mut self, ts: Instant, frame: Vec<i16>) {
        self.in_q.push_back(TimedFrame {
            ts_mono: ts,
            data: frame,
        });
    }

    /// OUT フレームをキューに追加する。
    pub(crate) fn push_out(&mut self, ts: Instant, frame: Vec<i16>) {
        self.out_q.push_back(TimedFrame {
            ts_mono: ts,
            data: frame,
        });
    }

    /// ペアリング可能な IN/OUT ペアを試行する。
    ///
    /// # アルゴリズム（RFC §25）
    ///
    /// 1. 両キューにフレームがあり、時間差が tolerance 以内 → ペアを返す。
    /// 2. 時間差超過かつ IN が古い → IN をドロップし None。
    /// 3. 時間差超過かつ OUT が古い → OUT をドロップし None。
    /// 4. いずれかのキューが空 → None。
    pub(crate) fn try_pair(&mut self) -> Option<(Vec<i16>, Vec<i16>, Instant)> {
        // 両キューにフレームがあることを確認。
        let in_front = self.in_q.front()?;
        let out_front = self.out_q.front()?;

        let delta = if in_front.ts_mono >= out_front.ts_mono {
            in_front.ts_mono - out_front.ts_mono
        } else {
            out_front.ts_mono - in_front.ts_mono
        };

        if delta <= self.tolerance {
            // tolerance 以内 → ペアを生成して返す。
            // front()? で非空を確認済みのため pop_front() は Some を返す。
            let in_frame = self.in_q.pop_front()?;
            let out_frame = self.out_q.pop_front()?;
            let pair_ts = in_frame.ts_mono.max(out_frame.ts_mono);
            Some((in_frame.data, out_frame.data, pair_ts))
        } else if in_front.ts_mono < out_front.ts_mono {
            // IN が古すぎる → IN をドロップ。
            self.in_q.pop_front()?;
            None
        } else {
            // OUT が古すぎる → OUT をドロップ。
            self.out_q.pop_front()?;
            None
        }
    }

    /// tolerance を超過した古いフレームを全てドロップする。
    ///
    /// 戻り値: ドロップしたフレーム数。
    /// `now` からの経過時間が `tolerance` を超えたフレームを古い方から削除する。
    pub(crate) fn flush_stale(&mut self, now: Instant) -> usize {
        let threshold = now - self.tolerance;
        let mut dropped = 0;

        while self
            .in_q
            .front()
            .is_some_and(|f| f.ts_mono < threshold)
        {
            self.in_q.pop_front();
            dropped += 1;
        }
        while self
            .out_q
            .front()
            .is_some_and(|f| f.ts_mono < threshold)
        {
            self.out_q.pop_front();
            dropped += 1;
        }

        dropped
    }

    /// 各キューの滞留フレーム数を返す。
    pub(crate) fn pending_count(&self) -> (usize, usize) {
        (self.in_q.len(), self.out_q.len())
    }
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

    // -----------------------------------------------------------------------
    // PairAligner tests
    // -----------------------------------------------------------------------

    /// 完全一致タイムスタンプのペアが即座に返されることを確認する。
    #[test]
    fn test_pair_exact_match() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();
        aligner.push_in(now, vec![1, 2]);
        aligner.push_out(now, vec![3, 4]);

        if let Some((in_frame, out_frame, _ts)) = aligner.try_pair() {
            assert_eq!(in_frame, vec![1, 2]);
            assert_eq!(out_frame, vec![3, 4]);
        } else {
            panic!("期待されるペアが返されませんでした");
        }
    }

    /// tolerance 以内の微小ズレ（1ms）でペアが返されることを確認する。
    #[test]
    fn test_pair_within_tolerance() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();
        aligner.push_in(now, vec![1]);
        aligner.push_out(now + Duration::from_millis(1), vec![2]);

        let result = aligner.try_pair();
        assert!(result.is_some());
    }

    /// tolerance 超過で IN が古い場合、IN がドロップされることを確認する。
    #[test]
    fn test_pair_tolerance_exceeded_drop_old_in() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();
        aligner.push_in(now, vec![1]);           // 古い IN
        aligner.push_out(now + Duration::from_millis(20), vec![2]); // 新しい OUT

        // tolerance (10ms) 超過 → IN がドロップされ、None。
        assert!(aligner.try_pair().is_none());
        // IN キューが空になった。
        assert_eq!(aligner.pending_count(), (0, 1));
    }

    /// tolerance 超過で OUT が古い場合、OUT がドロップされることを確認する。
    #[test]
    fn test_pair_tolerance_exceeded_drop_old_out() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();
        aligner.push_out(now, vec![1]);          // 古い OUT
        aligner.push_in(now + Duration::from_millis(20), vec![2]); // 新しい IN

        assert!(aligner.try_pair().is_none());
        // OUT キューが空になった。
        assert_eq!(aligner.pending_count(), (1, 0));
    }

    /// IN のみ到着、tolerance 超過後も try_pair は None を返すことを確認する。
    #[test]
    fn test_in_only_no_out() {
        let mut aligner = PairAligner::new(10);
        aligner.push_in(Instant::now(), vec![1]);
        // OUT がないためペアリング不可。
        assert!(aligner.try_pair().is_none());
        assert_eq!(aligner.pending_count(), (1, 0));
    }

    /// OUT のみ到着、同上。
    #[test]
    fn test_out_only_no_in() {
        let mut aligner = PairAligner::new(10);
        aligner.push_out(Instant::now(), vec![1]);
        assert!(aligner.try_pair().is_none());
        assert_eq!(aligner.pending_count(), (0, 1));
    }

    /// IN, OUT, IN, OUT の交互到着で全ペアが正しく返ることを確認する。
    #[test]
    fn test_interleaved_arrival() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();

        aligner.push_in(now, vec![1]);
        aligner.push_out(now + Duration::from_millis(1), vec![10]);
        aligner.push_in(now + Duration::from_millis(2), vec![2]);
        aligner.push_out(now + Duration::from_millis(3), vec![20]);

        // 1 ペア目
        if let Some((in_f1, out_f1, _ts1)) = aligner.try_pair() {
            assert_eq!(in_f1, vec![1]);
            assert_eq!(out_f1, vec![10]);
        } else {
            panic!("1 ペア目が見つかりません");
        }

        // 2 ペア目
        if let Some((in_f2, out_f2, _ts2)) = aligner.try_pair() {
            assert_eq!(in_f2, vec![2]);
            assert_eq!(out_f2, vec![20]);
        } else {
            panic!("2 ペア目が見つかりません");
        }

        // 全ペア消費済み
        assert!(aligner.try_pair().is_none());
    }

    /// IN 10 個 → OUT 10 個のバースト到着で全ペアが正しく返ることを確認する。
    #[test]
    fn test_burst_arrival() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();

        for i in 0..10 {
            aligner.push_in(now + Duration::from_millis(i), vec![i as i16]);
        }
        for i in 0..10 {
            aligner.push_out(now + Duration::from_millis(i), vec![(i + 100) as i16]);
        }

        for i in 0..10 {
            if let Some((in_f, out_f, _ts)) = aligner.try_pair() {
                assert_eq!(in_f, vec![i as i16]);
                assert_eq!(out_f, vec![(i + 100) as i16]);
            } else {
                panic!("ペア {i} が見つかりません");
            }
        }

        assert!(aligner.try_pair().is_none());
    }

    /// flush_stale が古いフレームを正しく削除することを確認する。
    #[test]
    fn test_flush_stale() {
        let mut aligner = PairAligner::new(10);
        let now = Instant::now();

        aligner.push_in(now, vec![1]);             // 古い
        aligner.push_out(now, vec![2]);            // 古い
        aligner.push_in(now + Duration::from_millis(20), vec![3]); // 新しい
        aligner.push_out(now + Duration::from_millis(20), vec![4]); // 新しい

        // 現在時刻より 15ms 後を基準に flush → 最初の 2 つが削除される。
        let dropped = aligner.flush_stale(now + Duration::from_millis(15));
        assert_eq!(dropped, 2);
        assert_eq!(aligner.pending_count(), (1, 1));
    }

    /// pending_count が正しい滞留数を返すことを確認する。
    #[test]
    fn test_pending_count() {
        let mut aligner = PairAligner::new(10);
        assert_eq!(aligner.pending_count(), (0, 0));

        aligner.push_in(Instant::now(), vec![1]);
        assert_eq!(aligner.pending_count(), (1, 0));

        aligner.push_out(Instant::now(), vec![2]);
        assert_eq!(aligner.pending_count(), (1, 1));
    }
}
