---
ticket_id: 61
title: "M1-4: ICE/STUN/TURN 設定型定義"
slug: m1-4-icestun-turn
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0061-m1-4-icestun-turn/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0061-m1-4-icestun-turn/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0061-m1-4-icestun-turn/plan.md
---
# M1-4: ICE/STUN/TURN 設定型定義

## Summary

NAT traversal のための ICE/STUN/TURN 設定型を定義する。`IceConfig::default()` は RFC §13 の既定値を反映し、利用者が明示的に指定しない限り有効な ICE 設定で動作する。

以下のファイルを修正し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/Cargo.toml` — 修正：`secrecy` 依存を追加
- `crates/siprs/src/transport.rs` — 修正：`IceConfig` + `StunServerConfig` + `TurnServerConfig` + `TurnTransport` + テストを追記

## Background

### RFC 準拠

RFC §13（ICE/STUN/TURN 完全仕様）に完全準拠する。PJSIP 実装事情により trickle ICE は disabled default の optional optimization とし、`ClientInitialized` イベントの capability matrix で対応有無を明示する。

### 既存チケットからの依存関係

- `TransportConfig` / `TransportKind`（M1-3）→ 同一ファイル（transport.rs）に同居
- `secrecy::SecretString` → `TurnServerConfig.password` の型として使用。`Debug` 出力は自動的に `"***REDACTED***"` となる

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M2-1 | `ClientConfig` の `ice_config` / `stun_servers` / `turn_servers` フィールドとして参照 |
| M3-1 | ICE/STUN/TURN 設定のバリデーション |
| M17-4 | `PjsuaBackend` で実際の ICE/STUN/TURN 設定反映 |

### 設計判断

`IceConfig` は `Default` 実装を持ち、RFC §13 の既定値（ICE enabled, aggressive nomination on, trickle off, renomination off, max 16 candidates）を返す。`TurnServerConfig` の `password` は `secrecy::SecretString` でラップし、デバッグ出力でのパスワード漏洩を防止する。`TurnTransport` は UDP/TCP の 2 値。

## Scope

### 1. `crates/siprs/Cargo.toml`（修正）

```toml
[dependencies]
secrecy = "0.10"
```

（`serde` 行の次などに追加。既存依存を壊さないように挿入）

### 2. `crates/siprs/src/transport.rs`（修正 — ファイル末尾に追記）

```rust
use secrecy::SecretString;

// ---------------------------------------------------------------------------
// IceConfig
// ---------------------------------------------------------------------------

/// ICE 設定。
///
/// RFC §13 に完全準拠する。既定では ICE 有効、aggressive nomination 有効。
/// trickle ICE は disabled default の optional optimization。
#[derive(Debug, Clone)]
pub struct IceConfig {
    /// ICE を有効にするかどうか（既定: true）
    pub enabled: bool,
    /// aggressive nomination を使用するかどうか（既定: true）
    pub aggressive_nomination: bool,
    /// trickle ICE を有効にするかどうか（既定: false）
    pub trickle_ice: bool,
    /// renomination を有効にするかどうか（既定: false）
    pub renomination: bool,
    /// 最大ホスト候補数（既定: 16）
    pub max_host_candidates: usize,
}

impl Default for IceConfig {
    /// RFC §13 既定値による ICE 設定を返す。
    fn default() -> Self {
        Self {
            enabled: true,
            aggressive_nomination: true,
            trickle_ice: false,
            renomination: false,
            max_host_candidates: 16,
        }
    }
}

// ---------------------------------------------------------------------------
// TurnTransport
// ---------------------------------------------------------------------------

/// TURN トランスポートの種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnTransport {
    /// UDP
    Udp,
    /// TCP
    Tcp,
}

// ---------------------------------------------------------------------------
// StunServerConfig
// ---------------------------------------------------------------------------

/// STUN サーバー設定。
#[derive(Debug, Clone)]
pub struct StunServerConfig {
    /// STUN サーバーの URI（例: "stun:stun.example.com:3478"）
    pub uri: String,
}

impl StunServerConfig {
    /// 新しい STUN サーバー設定を生成する。
    pub fn new(uri: impl Into<String>) -> Self {
        Self { uri: uri.into() }
    }
}

// ---------------------------------------------------------------------------
// TurnServerConfig
// ---------------------------------------------------------------------------

/// TURN サーバー設定。
#[derive(Debug, Clone)]
pub struct TurnServerConfig {
    /// TURN サーバーの URI（例: "turn:turn.example.com:3478"）
    pub uri: String,
    /// TURN ユーザー名（認証不要時は None）
    pub username: Option<String>,
    /// TURN パスワード（認証不要時は None）
    ///
    /// `secrecy::SecretString` により Debug 出力は自動的に `"***REDACTED***"` となる。
    pub password: Option<SecretString>,
    /// TURN トランスポート
    pub transport: TurnTransport,
}

impl TurnServerConfig {
    /// 新しい TURN サーバー設定を生成する。
    pub fn new(
        uri: impl Into<String>,
        username: Option<String>,
        password: Option<SecretString>,
        transport: TurnTransport,
    ) -> Self {
        Self {
            uri: uri.into(),
            username,
            password,
            transport,
        }
    }
}
```

**設計判断**:
- `IceConfig` は `PartialEq` ではなく `Clone` のみ。`max_host_candidates` 以外は全て `Eq` だが、一貫性のため `PartialEq` も derive しない（必要なら後続で追加）
- `StunServerConfig::new(impl Into<String>)` — `&str` と `String` の両方を受け付ける
- `TurnServerConfig::new()` も同様に `Into<String>` を使用
- `TurnTransport` は `Copy + Eq` のシンプルな enum（ICE ライブラリに渡すトランスポート指定のため）

### 注意: `secrecy` crate の `SecretString`

`secrecy::SecretString` は内部で `String` をラップし、`Debug` 出力を `"***REDACTED***"` に自動的にマスクする。また `Clone` 時に不要なコピーを防ぐ `clone_with_receiver` 機構を持つ。`TurnServerConfig` が `Clone` を derive するため、`SecretString` が `Clone` を実装している必要がある（secrecy 0.10 は `Clone` を実装済み）。

## Non-scope

- ICE/STUN/TURN 設定のバリデーション — M3-1
- `ClientConfig` への統合 — M2-1
- PJSIP への実際の設定反映 — M17-4
- `serde` の `Serialize` / `Deserialize` 導出 — 後続チケットの検討事項

## Test Plan

### ユニットテスト計画（transport.rs に追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_ice_config_default` | Default の各フィールドが §13 既定値と一致（enabled=true, aggressive=true, trickle=false, renomination=false, max_host_candidates=16） |
| 2 | `test_ice_config_clone_debug` | Clone/Debug がパニックしないこと |
| 3 | `test_turn_transport_clone_copy_eq` | TurnTransport が Clone + Copy + PartialEq + Eq |
| 4 | `test_stun_server_config_new` | StunServerConfig::new("stun:example.com") の uri が正しい |
| 5 | `test_stun_server_config_clone_debug` | Clone/Debug がパニックしないこと |
| 6 | `test_turn_server_config_new` | TurnServerConfig::new() の全フィールドが正しくラウンドトリップすること |
| 7 | `test_turn_server_config_username_password_none` | username/password に None を許容すること |
| 8 | `test_turn_server_config_debug_redacted` | Debug 出力で password が `"***REDACTED***"` にマスクされること |
| 9 | `test_turn_server_config_clone` | Clone が正しく機能すること |
| 10 | `test_ice_config_send_sync` | IceConfig が Send + Sync であることのコンパイル時確認 |
| 11 | `test_turn_server_config_send_sync` | TurnServerConfig が Send + Sync であることのコンパイル時確認 |

### ユニットテスト不可能な項目（例外）

- URI の妥当性検証（`stun:` / `turn:` プレフィックス） — 文字列型では型レベル検証不可。M3-1 の設定バリデーションで実施
- ICE connectivity の実際の動作検証 — M20-1（結合テスト）で Docker 環境を使用して検証

## Boy Scout Rule — 翻訳可能性計画

- `IceConfig` の全フィールドは self-documenting な命名（`enabled`, `aggressive_nomination`, `trickle_ice`, 等）
- `TurnServerConfig::password` の doc comment で `SecretString` による Debug マスクを明示
- `StunServerConfig::new(impl Into<String>)` — `&str` / `String` 両対応の標準的パターン

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存テスト含む）
- [ ] RFC §13 の `IceConfig` が 5 フィールドで定義済み
- [ ] `IceConfig::default()` が RFC 既定値（enabled=true, aggressive=true, trickle=false, renomination=false, max_host_candidates=16）を返す
- [ ] `StunServerConfig { uri: String }` が定義済み
- [ ] `TurnServerConfig { uri, username, password, transport }` が定義済み
- [ ] `TurnTransport` enum（Udp / Tcp）が定義済み
- [ ] `TurnServerConfig.password` が `secrecy::SecretString` でラップされていること
- [ ] `TurnServerConfig` の Debug 出力で password が `"***REDACTED***"` と表示されること
- [ ] 全型が `Clone + Debug + Send + Sync` であること

## Notes

### ファイル配置の判断

ICE/STUN/TURN 型は `src/transport.rs` に TransportConfig と同居させる。RFC の公開 API は `crate::config::IceConfig` 等のパスを示しているが、config.rs は M2-1 で ClientConfig を定義する際に `pub use crate::transport::{IceConfig, ...}` で再公開する。これにより型定義が config.rs に集中するのを防ぎ、transport.rs という適切なモジュールに責務を分離する。

### `secrecy` crate バージョン選定

`secrecy 0.10` は `SecretString`（`Secret<String>` のエイリアス）を提供し、`Debug` 出力の自動マスク、`Clone`、`Zeroize` トレイトを実装している。バージョンは crates.io の最新安定版を確認して指定する。
