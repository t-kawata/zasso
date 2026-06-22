//! # SIP 結合テスト（Asterisk）
//!
//! Docker Compose で起動した Asterisk との SIP プロトコルレベルの結合試験。
//!
//! ## 実行手順
//!
//! ```bash
//! # 1. Asterisk を起動
//! docker compose -f tests/docker/docker-compose.yml up -d
//!
//! # 2. 結合テストを実行
//! cargo test -p siprs --features pjsip -- --ignored --test-threads=1
//!
//! # 3. 終了後クリーンアップ
//! docker compose -f tests/docker/docker-compose.yml down
//! ```
//!
//! ## 注意事項
//!
//! - 全テストに `#[ignore]` を付与 — CI ではスキップされる
//! - PJSIP singleton のため `--test-threads=1` 必須
//! - `feature = "pjsip"` が必須

// `#[path]` 属性で tests/integration/ 以下のサブモジュールを単一バイナリに集約する。
// これにより PJSIP singleton 問題（複数バイナリ間の競合）を回避する。
#[path = "integration/register.rs"]
mod register;

#[path = "integration/call.rs"]
mod call;

#[path = "integration/provisional.rs"]
mod provisional;

#[path = "integration/dtmf.rs"]
mod dtmf;

#[path = "integration/account.rs"]
mod account;

#[path = "integration/media.rs"]
mod media;

#[path = "integration/dual_client.rs"]
mod dual_client;

/// 全テストに共通する共通モジュール。
mod common;

// ── 相互接続試験 ──
// 実 PBX（Asterisk / FreeSWITCH）との相互接続性を検証する。
// 全テストに `#[ignore]` を付与 — 試験実行時のみ有効化。
#[path = "interop/asterisk.rs"]
mod asterisk;

#[path = "interop/freeswitch.rs"]
mod freeswitch;
