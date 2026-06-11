//! 信号品質フィルタ — ASR 実行前に音声信号の品質を判定する
//!
//! 移植元: ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs の is_worthy_to_run_asr()

use crate::types::SignalFilterConfig;

/// 音声信号が意味のある内容を含むかどうかを判定する。
///
/// # 戻り値
/// - `true`: ASR を実行すべき（信号品質が良好、またはフィルタが無効）
/// - `false`: ASR をスキップすべき（無音やノイズのみ）
pub fn is_worthy_to_run_asr(
    samples: &[f32],
    config: &SignalFilterConfig,
    utterance_min_ms: u64,
    sample_rate: u32,
) -> bool {
    if !config.enabled {
        return true;
    }
    if samples.is_empty() {
        return false;
    }

    let duration_ms = (samples.len() as f32 / sample_rate as f32) * 1000.0;
    if duration_ms < utterance_min_ms as f32 {
        return false;
    }

    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    let rms = (sum_sq / samples.len() as f32).sqrt();

    let active_samples = samples
        .iter()
        .filter(|&s| s.abs() > config.rms_threshold)
        .count();
    let occupancy_ratio = active_samples as f32 / samples.len() as f32;

    rms >= config.rms_threshold && occupancy_ratio >= config.occupancy_ratio
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> SignalFilterConfig {
        SignalFilterConfig {
            enabled: true,
            rms_threshold: 0.005,
            occupancy_ratio: 0.15,
        }
    }

    #[test]
    fn test_empty_returns_false() {
        assert!(!is_worthy_to_run_asr(&[], &default_config(), 300, 16000));
    }

    #[test]
    fn test_below_min_duration_returns_false() {
        // 16000Hz で 100 samples → 6.25ms（300ms 未満）
        let samples = vec![0.1f32; 100];
        assert!(!is_worthy_to_run_asr(
            &samples,
            &default_config(),
            300,
            16000
        ));
    }

    #[test]
    fn test_low_rms_returns_false() {
        let samples = vec![0.001f32; 16000];
        assert!(!is_worthy_to_run_asr(
            &samples,
            &default_config(),
            300,
            16000
        ));
    }

    #[test]
    fn test_low_occupancy_returns_false() {
        let mut samples = vec![0.0f32; 16000];
        samples[0] = 1.0;
        assert!(!is_worthy_to_run_asr(
            &samples,
            &default_config(),
            300,
            16000
        ));
    }

    #[test]
    fn test_good_signal_returns_true() {
        let samples = vec![0.1f32; 16000];
        assert!(is_worthy_to_run_asr(
            &samples,
            &default_config(),
            300,
            16000
        ));
    }

    #[test]
    fn test_disabled_always_true() {
        let config = SignalFilterConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(is_worthy_to_run_asr(&[], &config, 300, 16000));
    }

    #[test]
    fn test_deterministic() {
        let config = default_config();
        let samples: Vec<f32> = (0..16000)
            .map(|i| ((i * 7) as f32 / 16000.0).sin())
            .collect();
        let r1 = is_worthy_to_run_asr(&samples, &config, 300, 16000);
        let r2 = is_worthy_to_run_asr(&samples, &config, 300, 16000);
        assert_eq!(r1, r2);
    }
}
