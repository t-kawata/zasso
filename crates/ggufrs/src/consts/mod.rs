//! 静的定数定義
//!
//! zasso CLAUDE.md の「設定値は consts/settings.rs で一元管理」ルールを遵守し、
//! ポート番号・デフォルトパス・タイムアウト等の設定値をここで定義する。
//! `consts/mod.rs` 経由で各モジュールから参照する。

pub(crate) mod settings;

// 全モジュールから参照される定数の再公開
// 未使用の定数は settings.rs 内でのみ直接参照され、mod.rs 経由の再公開は行わない
pub(crate) use settings::DEFAULT_MAX_TOKENS;
pub(crate) use settings::DEFAULT_RT_PORT;
pub(crate) use settings::DEFAULT_TEMPERATURE;
pub(crate) use settings::GPU_PROVIDER_ENV_VAR;
