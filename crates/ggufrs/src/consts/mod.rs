//! 静的定数定義
//!
//! zasso CLAUDE.md の「設定値は consts/settings.rs で一元管理」ルールを遵守し、
//! ポート番号・デフォルトパス・タイムアウト等の設定値をここで定義する。
//! `consts/mod.rs` 経由で各モジュールから参照する。

pub(crate) mod settings;

// 再公開する定数は後続チケットで初めて参照される。
// 現時点では未参照だが計画済みのため unused_imports 警告を抑制する。
#[allow(unused_imports)]
pub(crate) use settings::DEFAULT_RT_PORT;
#[allow(unused_imports)]
pub(crate) use settings::DEFAULT_SW_PORT;
#[allow(unused_imports)]
pub(crate) use settings::DEFAULT_MODEL_DIR;
#[allow(unused_imports)]
pub(crate) use settings::CURL_TIMEOUT_SECS;
#[allow(unused_imports)]
pub(crate) use settings::DEFAULT_CONTEXT_SIZE;
#[allow(unused_imports)]
pub(crate) use settings::DEFAULT_MAX_TOKENS;
#[allow(unused_imports)]
pub(crate) use settings::DEFAULT_TEMPERATURE;
#[allow(unused_imports)]
pub(crate) use settings::GPU_PROVIDER_ENV_VAR;
