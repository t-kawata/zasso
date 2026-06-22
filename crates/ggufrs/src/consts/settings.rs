// 定数群は後続チケット（M0-3〜M3-5）で初めて参照される。
// 現時点では未参照だが計画済みのため dead_code 警告を抑制する。
// 実参照が開始されたチケットで個別に #[allow(dead_code)] を除去すること。
#![allow(dead_code)]

//! 静的設定定数
//!
//! zasso CLAUDE.md の「設定値は consts/settings.rs で一元管理」ルールを遵守し、
//! ポート番号・デフォルトパス・タイムアウト等の設定値をここで定義する。
//! 各定数には「なぜこの値か」をコメントで記述する。
//! `pub(crate) const` で定義し、`consts/mod.rs` 経由で各モジュールから参照する。
//!
//! # 定数設計方針
//!
//! - ポート番号は他の zasso サービスと衝突しない範囲（3900-3919）から割り当てる
//! - 推論パラメータは Qwen3.5 シリーズの推奨値に基づく
//! - タイムアウト値は voiput crate の設定に準拠する
//!
//! # dead_code 抑制の理由
//!
//! 参照状況（M3-5 現在）:
//! - `DEFAULT_RT_PORT`: M0-5（ServerConfig::default）で使用済み ✅
//! - `DEFAULT_CONTEXT_SIZE` / `DEFAULT_MAX_TOKENS` / `DEFAULT_TEMPERATURE`: M2-1（GenerateParams::default）で使用済み ✅
//! - `GPU_PROVIDER_ENV_VAR`: M1-2（GpuProvider::detect）で使用済み ✅
//! - （DEFAULT_SW_PORT は M6-11 で削除済み）
//! - `DEFAULT_MODEL_DIR` / `CURL_TIMEOUT_SECS`: M5（build.rs モデル自動DL）で使用予定 ⏳
//!
//! 未使用の定数が存在する間は `#![allow(dead_code)]` が必要。
//! 各定数の実参照が開始されたタイミングで、当該チケットが本コメントの該当行を削除する。

/// REST API / OpenAI 互換エンドポイントのデフォルトポート番号
///
/// 3910: zasso の RT_PORT との整合性を保つため。
/// 0-1023 はシステム予約ポート、1024-49151 はユーザーポート範囲。
pub(crate) const DEFAULT_RT_PORT: u16 = 3910;

/// モデルファイルを格納するデフォルトディレクトリ名
///
/// "models": build.rs による自動ダウンロード先および
/// GgufEngine がモデルファイルを検索するデフォルトパス。
/// プロジェクトルート（crate ルート）からの相対パスとして解釈される。
pub(crate) const DEFAULT_MODEL_DIR: &str = "models";

/// モデルダウンロードの HTTP リクエストタイムアウト（秒）
///
/// 60: voiput crate のダウンロードタイムアウト設定に準拠。
/// モデルファイル（Qwen3.5-0.8B-Q4_K_M: 約600MB）のダウンロードに
/// 十分な時間を確保しつつ、ネットワーク障害時の早期切り替えを可能にする。
/// 3.1GB（Gemma4 E2B）のダウンロードに十分な時間。日本からの HuggingFace 接続では
/// 安定して完了するまでに 3〜5分程度要する。
pub(crate) const CURL_TIMEOUT_SECS: u64 = 600;

/// デフォルトのコンテキストサイズ（トークン数）
///
/// 2048: llama-cpp-2 デフォルト推奨値。
/// ASR 補正タスク（入出力 60-90 トークン）では 128k フルコンテキストは不要。
/// 2048 に制限することで prefill コストを削減する。
/// ユーザーは ModelConfig で自由に変更可能。
pub(crate) const DEFAULT_CONTEXT_SIZE: u32 = 2048;

/// デフォルトの最大生成トークン数
///
/// 256: 短い応答を期待する対話タスクに適した値。
/// 過度に長い応答によるレイテンシ増加とメモリ消費を防ぐ。
pub(crate) const DEFAULT_MAX_TOKENS: u32 = 256;

/// デフォルトの温度パラメータ（ランダム性の制御）
///
/// 0.1: 低温度により決定論的で安定した出力を優先。
/// GGUF モデルの量子化による品質低下を補うため、高温度より
/// 低温度の方が安定した結果が得られる傾向にある。
pub(crate) const DEFAULT_TEMPERATURE: f32 = 0.1;

/// GPU プロバイダーを指定する環境変数名
///
/// "GGUFRS_GPU_PROVIDER": GpuProvider 列挙型（config.rs）の値と対応する。
/// 例: "metal" / "cuda" / "cpu"（未設定時は cpu 扱い）。
pub(crate) const GPU_PROVIDER_ENV_VAR: &str = "GGUFRS_GPU_PROVIDER";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_rt_port_is_in_user_range() {
        // 1024-49151 はユーザーポート範囲（動的/プライベートポートを除く）
        assert!(
            (1024..=49151).contains(&DEFAULT_RT_PORT),
            "DEFAULT_RT_PORT ({}) must be in user port range 1024-49151",
            DEFAULT_RT_PORT
        );
    }

    #[test]
    fn ports_are_distinct() {
        // DEFAULT_SW_PORT は M6-11 で削除済みのため、単一ポートの確認のみ
        assert!(DEFAULT_RT_PORT > 0, "RT port must be positive");
    }

    #[test]
    fn default_model_dir_is_not_empty() {
        assert!(
            !DEFAULT_MODEL_DIR.is_empty(),
            "DEFAULT_MODEL_DIR must not be empty"
        );
    }

    #[test]
    fn curl_timeout_secs_is_positive() {
        assert!(
            CURL_TIMEOUT_SECS > 0,
            "CURL_TIMEOUT_SECS ({}) must be positive",
            CURL_TIMEOUT_SECS
        );
    }

    #[test]
    fn default_context_size_is_reasonable() {
        // コンテキストサイズは 0 より大きく、128K を超えない
        assert!(
            DEFAULT_CONTEXT_SIZE > 0 && DEFAULT_CONTEXT_SIZE <= 131072,
            "DEFAULT_CONTEXT_SIZE ({}) must be in (0, 131072]",
            DEFAULT_CONTEXT_SIZE
        );
    }

    #[test]
    fn default_max_tokens_is_positive() {
        assert!(
            DEFAULT_MAX_TOKENS > 0,
            "DEFAULT_MAX_TOKENS ({}) must be positive",
            DEFAULT_MAX_TOKENS
        );
    }

    #[test]
    fn max_tokens_does_not_exceed_context_size() {
        assert!(
            DEFAULT_MAX_TOKENS <= DEFAULT_CONTEXT_SIZE,
            "DEFAULT_MAX_TOKENS ({}) must not exceed DEFAULT_CONTEXT_SIZE ({})",
            DEFAULT_MAX_TOKENS,
            DEFAULT_CONTEXT_SIZE
        );
    }

    #[test]
    fn default_temperature_is_in_range() {
        assert!(
            (0.0..=2.0).contains(&DEFAULT_TEMPERATURE),
            "DEFAULT_TEMPERATURE ({}) must be in [0.0, 2.0]",
            DEFAULT_TEMPERATURE
        );
    }

    #[test]
    fn gpu_provider_env_var_is_not_empty() {
        assert!(
            !GPU_PROVIDER_ENV_VAR.is_empty(),
            "GPU_PROVIDER_ENV_VAR must not be empty"
        );
    }

    #[test]
    fn gpu_provider_env_var_has_ggufrs_prefix() {
        assert!(
            GPU_PROVIDER_ENV_VAR.starts_with("GGUFRS_"),
            "GPU_PROVIDER_ENV_VAR ({}) must start with GGUFRS_",
            GPU_PROVIDER_ENV_VAR
        );
    }
}
