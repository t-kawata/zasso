//! # 音声フォーマット型
//!
//! 音声パイプライン全体で使用されるフォーマット表現を定義する。
//! RFC §21 に完全準拠し、§42 の sample rate 制約（8/16/24/48kHz のみ）を反映する。

use std::fmt;

// ---------------------------------------------------------------------------
// SampleRate
// ---------------------------------------------------------------------------

/// サンプルレート（Hz）。
///
/// RFC §42 により 8/16/24/48kHz のみ許可される。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SampleRate {
    /// 8 kHz（PSTN 品質）
    Hz8000,
    /// 16 kHz（広帯域、既定）
    Hz16000,
    /// 24 kHz（超広帯域）
    Hz24000,
    /// 48 kHz（フルスペック）
    Hz48000,
}

impl SampleRate {
    /// サンプルレートを Hz の数値として返す。
    pub fn as_hz(self) -> u32 {
        match self {
            Self::Hz8000 => 8000,
            Self::Hz16000 => 16000,
            Self::Hz24000 => 24000,
            Self::Hz48000 => 48000,
        }
    }
}

impl fmt::Display for SampleRate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}Hz", self.as_hz())
    }
}

// ---------------------------------------------------------------------------
// BitDepth
// ---------------------------------------------------------------------------

/// ビット深度（1 サンプルあたりのビット数表現）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BitDepth {
    /// 16-bit 符号付き整数
    I16,
    /// 32-bit 浮動小数点数
    F32,
}

impl BitDepth {
    /// 1 サンプルあたりのバイト数を返す。
    pub fn bytes_per_sample(self) -> usize {
        match self {
            Self::I16 => 2,
            Self::F32 => 4,
        }
    }
}

impl fmt::Display for BitDepth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::I16 => write!(f, "I16"),
            Self::F32 => write!(f, "F32"),
        }
    }
}

// ---------------------------------------------------------------------------
// ChannelLayout
// ---------------------------------------------------------------------------

/// チャネルレイアウト。
///
/// 既定の `StereoInOut` は L = IN（入力音声）、R = OUT（出力音声）を表す。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ChannelLayout {
    /// モノラル
    Mono,
    /// ステレオ（L=IN, R=OUT）
    StereoInOut,
}

impl ChannelLayout {
    /// チャネル数を返す。
    pub fn num_channels(self) -> u16 {
        match self {
            Self::Mono => 1,
            Self::StereoInOut => 2,
        }
    }
}

impl fmt::Display for ChannelLayout {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Mono => write!(f, "Mono"),
            Self::StereoInOut => write!(f, "Stereo(L=IN,R=OUT)"),
        }
    }
}

// ---------------------------------------------------------------------------
// AudioFormat
// ---------------------------------------------------------------------------

/// 音声フォーマットの完全指定。
///
/// サンプルレート・ビット深度・チャネルレイアウト・フレーム長（ms）の
/// 4 要素で音声ストリームのフォーマットを一意に特定する。
///
/// # 例
///
/// ```
/// use siprs::audio::format::{AudioFormat, SampleRate, BitDepth, ChannelLayout};
///
/// let fmt = AudioFormat {
///     sample_rate: SampleRate::Hz16000,
///     bit_depth: BitDepth::I16,
///     channel_layout: ChannelLayout::Mono,
///     frame_ms: 20,
/// };
/// assert_eq!(fmt.frame_samples(), 320);
/// assert_eq!(fmt.frame_bytes(), 640);
/// ```
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioFormat {
    /// サンプルレート
    pub sample_rate: SampleRate,
    /// ビット深度
    pub bit_depth: BitDepth,
    /// チャネルレイアウト
    pub channel_layout: ChannelLayout,
    /// 1 フレームの時間長（ミリ秒）
    pub frame_ms: u16,
}

impl AudioFormat {
    /// 1 フレームあたりの総サンプル数を計算する。
    ///
    /// フレーム長（ms）とサンプルレートから算出する。
    /// `StereoInOut` の場合、チャネル数（2）を乗じる。
    pub fn frame_samples(&self) -> usize {
        let ms = self.frame_ms as u32;
        let hz = self.sample_rate.as_hz();
        let ch = self.channel_layout.num_channels() as u32;
        // ms × hz / 1000 × ch
        (ms * hz / 1000) as usize * ch as usize
    }

    /// 1 フレームあたりの総バイト数を計算する。
    ///
    /// `frame_samples()` に 1 サンプルあたりのバイト数を乗じる。
    pub fn frame_bytes(&self) -> usize {
        self.frame_samples() * self.bit_depth.bytes_per_sample()
    }
}

impl Default for AudioFormat {
    /// 既定の音声フォーマット（RFC §48）。
    ///
    /// - サンプルレート: 16 kHz
    /// - ビット深度: I16
    /// - チャネルレイアウト: StereoInOut（L=IN, R=OUT）
    /// - フレーム長: 20 ms
    fn default() -> Self {
        Self {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::StereoInOut,
            frame_ms: 20,
        }
    }
}

impl fmt::Display for AudioFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}/{}/{} {}ms",
            self.sample_rate, self.bit_depth, self.channel_layout, self.frame_ms
        )
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // SampleRate
    // -----------------------------------------------------------------------

    /// 全 4 variant の as_hz() が正しい値を返すことを確認する。
    #[test]
    fn test_sample_rate_as_hz_all_variants() {
        assert_eq!(SampleRate::Hz8000.as_hz(), 8000);
        assert_eq!(SampleRate::Hz16000.as_hz(), 16000);
        assert_eq!(SampleRate::Hz24000.as_hz(), 24000);
        assert_eq!(SampleRate::Hz48000.as_hz(), 48000);
    }

    /// Display 出力が "8000Hz" 等の形式であることを確認する。
    #[test]
    fn test_sample_rate_display() {
        assert_eq!(format!("{}", SampleRate::Hz8000), "8000Hz");
        assert_eq!(format!("{}", SampleRate::Hz16000), "16000Hz");
        assert_eq!(format!("{}", SampleRate::Hz24000), "24000Hz");
        assert_eq!(format!("{}", SampleRate::Hz48000), "48000Hz");
    }

    // -----------------------------------------------------------------------
    // BitDepth
    // -----------------------------------------------------------------------

    /// 各 variant の bytes_per_sample() が正しい値を返すことを確認する。
    #[test]
    fn test_bit_depth_bytes_per_sample() {
        assert_eq!(BitDepth::I16.bytes_per_sample(), 2);
        assert_eq!(BitDepth::F32.bytes_per_sample(), 4);
    }

    /// Display 出力が "I16" / "F32" であることを確認する。
    #[test]
    fn test_bit_depth_display() {
        assert_eq!(format!("{}", BitDepth::I16), "I16");
        assert_eq!(format!("{}", BitDepth::F32), "F32");
    }

    // -----------------------------------------------------------------------
    // ChannelLayout
    // -----------------------------------------------------------------------

    /// 各 variant の num_channels() が正しい値を返すことを確認する。
    #[test]
    fn test_channel_layout_num_channels() {
        assert_eq!(ChannelLayout::Mono.num_channels(), 1);
        assert_eq!(ChannelLayout::StereoInOut.num_channels(), 2);
    }

    /// Display 出力が "Mono" / "Stereo(L=IN,R=OUT)" であることを確認する。
    #[test]
    fn test_channel_layout_display() {
        assert_eq!(format!("{}", ChannelLayout::Mono), "Mono");
        assert_eq!(
            format!("{}", ChannelLayout::StereoInOut),
            "Stereo(L=IN,R=OUT)"
        );
    }

    // -----------------------------------------------------------------------
    // AudioFormat — frame_samples
    // -----------------------------------------------------------------------

    /// 16kHz/I16/Mono/20ms で frame_samples が 320 であることを確認する。
    #[test]
    fn test_audio_format_frame_samples() {
        let fmt = AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 20,
        };
        assert_eq!(fmt.frame_samples(), 320);
    }

    /// StereoInOut の場合、frame_samples が Mono の 2 倍になることを確認する。
    #[test]
    fn test_audio_format_frame_samples_stereo() {
        let mono = AudioFormat {
            channel_layout: ChannelLayout::Mono,
            ..AudioFormat::default()
        };
        let stereo = AudioFormat {
            channel_layout: ChannelLayout::StereoInOut,
            ..AudioFormat::default()
        };
        assert_eq!(stereo.frame_samples(), mono.frame_samples() * 2);
    }

    /// 全 sample rate での frame_samples（20ms/Mono）の計算値を確認する。
    #[test]
    fn test_audio_format_frame_samples_all_rates() {
        let base = AudioFormat {
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 20,
            sample_rate: SampleRate::Hz8000,
        };
        assert_eq!(base.frame_samples(), 160); // 8000 * 20 / 1000 = 160

        let mut fmt = base;
        fmt.sample_rate = SampleRate::Hz16000;
        assert_eq!(fmt.frame_samples(), 320);

        fmt.sample_rate = SampleRate::Hz24000;
        assert_eq!(fmt.frame_samples(), 480);

        fmt.sample_rate = SampleRate::Hz48000;
        assert_eq!(fmt.frame_samples(), 960);
    }

    // -----------------------------------------------------------------------
    // AudioFormat — frame_bytes
    // -----------------------------------------------------------------------

    /// I16 の場合、frame_bytes が frame_samples × 2 であることを確認する。
    #[test]
    fn test_audio_format_frame_bytes_i16() {
        let fmt = AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 20,
        };
        assert_eq!(fmt.frame_bytes(), 640); // 320 × 2
    }

    /// F32 の場合、frame_bytes が frame_samples × 4 であることを確認する。
    #[test]
    fn test_audio_format_frame_bytes_f32() {
        let fmt = AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::F32,
            channel_layout: ChannelLayout::Mono,
            frame_ms: 20,
        };
        assert_eq!(fmt.frame_bytes(), 1280); // 320 × 4
    }

    // -----------------------------------------------------------------------
    // AudioFormat — Default
    // -----------------------------------------------------------------------

    /// Default が RFC §48 既定値（16kHz/I16/StereoInOut/20ms）と一致することを確認する。
    #[test]
    fn test_audio_format_default() {
        let fmt = AudioFormat::default();
        assert_eq!(fmt.sample_rate, SampleRate::Hz16000);
        assert_eq!(fmt.bit_depth, BitDepth::I16);
        assert_eq!(fmt.channel_layout, ChannelLayout::StereoInOut);
        assert_eq!(fmt.frame_ms, 20);
    }

    // -----------------------------------------------------------------------
    // AudioFormat — Display
    // -----------------------------------------------------------------------

    /// Display 出力が "16000Hz/I16/Stereo(L=IN,R=OUT) 20ms" 形式であることを確認する。
    #[test]
    fn test_audio_format_display() {
        let fmt = AudioFormat::default();
        assert_eq!(
            format!("{}", fmt),
            "16000Hz/I16/Stereo(L=IN,R=OUT) 20ms"
        );
    }

    // -----------------------------------------------------------------------
    // コンパイル時検証
    // -----------------------------------------------------------------------

    /// 全型が Copy であることを確認する。
    #[test]
    fn test_copy_semantics() {
        fn assert_copy<T: Copy>() {}

        assert_copy::<SampleRate>();
        assert_copy::<BitDepth>();
        assert_copy::<ChannelLayout>();
        assert_copy::<AudioFormat>();
    }

    /// 全型が Send + Sync であることを確認する。
    #[test]
    fn test_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}

        assert_send::<SampleRate>();
        assert_sync::<SampleRate>();
        assert_send::<BitDepth>();
        assert_sync::<BitDepth>();
        assert_send::<ChannelLayout>();
        assert_sync::<ChannelLayout>();
        assert_send::<AudioFormat>();
        assert_sync::<AudioFormat>();
    }
}
