---
ticket_id: 60
title: "M1-3: TransportKind / TransportConfig 定義"
slug: m1-3-transportkind-transportconfig
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0060-m1-3-transportkind-transportconfig/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0060-m1-3-transportkind-transportconfig/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0060-m1-3-transportkind-transportconfig/plan.md
---
# M1-3: TransportKind / TransportConfig 定義

## Summary

SIP 通信のトランスポート層設定型を定義する。UDP/TCP/TLS の 3 トランスポートをサポートし、TLS は `tls` feature flag で conditional compilation する。TLS 無効時は型レベルで TLS variant が出現せず、誤使用をコンパイルエラーとする（RFC §12）。

以下のファイルを新規作成・修正し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/src/transport.rs` — 新規：TransportKind + TransportConfig + UdpTransportConfig + TcpTransportConfig + TlsTransportConfig (`#[cfg(feature = "tls")]`) + TlsConfig (`#[cfg(feature = "tls")]`) + テスト
- `crates/siprs/src/lib.rs` — 修正：`pub mod transport;` 追加
- `crates/siprs/Cargo.toml` — 修正：`tls` feature flag 追加

## Background

### RFC 準拠

RFC §12（TransportConfig 完全仕様）に完全準拠する。機能要求 §5（UDP/TCP/TLS トランスポート）を満たす。

### 既存チケットからの依存関係

- `SipError`（M0-1）→ TLS 関連の検証エラー（後続 M3-1 で使用、本チケットでは未使用）
- `TlsConfig`（RFC §12）→ `TlsTransportConfig` のフィールドとして本チケットで定義（M2-3 と重複しないよう注意）

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M1-4 | ICE/STUN/TURN 設定 — トランスポートと共に ClientConfig に格納 |
| M2-1 | `ClientConfig.transports: Vec<TransportConfig>` として参照 |
| M3-1 | ClientConfig バリデーション — トランスポート設定の検証 |
| M17-4 | `PjsuaBackend::create_transport()` で実際のトランスポート作成 |

### 設計判断

TLS は feature flag (`tls`) で conditional compilation する。無効時は `TransportKind::Tls` / `TransportConfig::Tls` / `TlsTransportConfig` / `TlsConfig` が全てコンパイル時に存在しない。これにより、TLS 機能なしでビルドされたバイナリで TLS 設定を誤って使用することを防ぐ。

## Scope

### 1. `crates/siprs/Cargo.toml`（修正）

```toml
[features]
serde = ["dep:serde"]
tls = []
```

（`tls = []` を追加）

### 2. `crates/siprs/src/transport.rs`（新規）

```rust
use std::fmt;
use std::net::SocketAddr;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// TransportKind
// ---------------------------------------------------------------------------

/// SIP トランスポートの種類。
///
/// TLS は `tls` feature 有効時のみ存在する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TransportKind {
    /// UDP トランスポート
    Udp,
    /// TCP トランスポート
    Tcp,
    /// TLS トランスポート（`tls` feature 有効時のみ）
    #[cfg(feature = "tls")]
    Tls,
}

impl TransportKind {
    /// トランスポート種類を識別子文字列（小文字）として返す。
    ///
    /// PJSIP の `pj_str_t` 変換やログ出力に使用する。
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Udp => "udp",
            Self::Tcp => "tcp",
            #[cfg(feature = "tls")]
            Self::Tls => "tls",
        }
    }
}

impl fmt::Display for TransportKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// ---------------------------------------------------------------------------
// UdpTransportConfig
// ---------------------------------------------------------------------------

/// UDP トランスポート設定。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UdpTransportConfig {
    /// バインドアドレス
    pub bind_addr: SocketAddr,
}

impl UdpTransportConfig {
    /// 新しい UDP トランスポート設定を生成する。
    pub fn new(bind_addr: SocketAddr) -> Self {
        Self { bind_addr }
    }
}

// ---------------------------------------------------------------------------
// TcpTransportConfig
// ---------------------------------------------------------------------------

/// TCP トランスポート設定。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TcpTransportConfig {
    /// バインドアドレス
    pub bind_addr: SocketAddr,
}

impl TcpTransportConfig {
    /// 新しい TCP トランスポート設定を生成する。
    pub fn new(bind_addr: SocketAddr) -> Self {
        Self { bind_addr }
    }
}

// ---------------------------------------------------------------------------
// TlsConfig
// ---------------------------------------------------------------------------

/// TLS 設定（`tls` feature 有効時のみ）。
#[cfg(feature = "tls")]
#[derive(Debug, Clone)]
pub struct TlsConfig {
    /// サーバー証明書の検証を行うかどうか
    pub verify_server: bool,
    /// CA 証明書のパス
    pub ca_cert_path: Option<PathBuf>,
    /// クライアント証明書のパス
    pub client_cert_path: Option<PathBuf>,
    /// クライアント秘密鍵のパス
    pub client_key_path: Option<PathBuf>,
    /// サーバー名（SNI）
    pub server_name: Option<String>,
    /// 安全でない暗号のレガシー互換を許可する
    pub allow_insecure_cipher_legacy: bool,
}

#[cfg(feature = "tls")]
impl TlsConfig {
    /// 新しい TLS 設定を生成する（全フィールド指定）。
    pub fn new(
        verify_server: bool,
        ca_cert_path: Option<PathBuf>,
        client_cert_path: Option<PathBuf>,
        client_key_path: Option<PathBuf>,
        server_name: Option<String>,
        allow_insecure_cipher_legacy: bool,
    ) -> Self {
        Self {
            verify_server,
            ca_cert_path,
            client_cert_path,
            client_key_path,
            server_name,
            allow_insecure_cipher_legacy,
        }
    }

    /// 最小限の TLS 設定を生成する（検証あり、証明書なし）。
    pub fn default_verified() -> Self {
        Self {
            verify_server: true,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            server_name: None,
            allow_insecure_cipher_legacy: false,
        }
    }

    /// 検証なしの TLS 設定を生成する（自己署名証明書用）。
    pub fn insecure() -> Self {
        Self {
            verify_server: false,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            server_name: None,
            allow_insecure_cipher_legacy: false,
        }
    }
}

// ---------------------------------------------------------------------------
// TlsTransportConfig
// ---------------------------------------------------------------------------

/// TLS トランスポート設定（`tls` feature 有効時のみ）。
#[cfg(feature = "tls")]
#[derive(Debug, Clone)]
pub struct TlsTransportConfig {
    /// バインドアドレス
    pub bind_addr: SocketAddr,
    /// TLS 設定
    pub tls: TlsConfig,
}

#[cfg(feature = "tls")]
impl TlsTransportConfig {
    /// 新しい TLS トランスポート設定を生成する。
    pub fn new(bind_addr: SocketAddr, tls: TlsConfig) -> Self {
        Self { bind_addr, tls }
    }
}

// ---------------------------------------------------------------------------
// TransportConfig
// ---------------------------------------------------------------------------

/// トランスポート設定。
///
/// UDP/TCP/TLS のいずれかのトランスポート設定を保持する。
/// TLS は `tls` feature 有効時のみ利用可能。
#[derive(Debug, Clone)]
pub enum TransportConfig {
    /// UDP トランスポート
    Udp(UdpTransportConfig),
    /// TCP トランスポート
    Tcp(TcpTransportConfig),
    /// TLS トランスポート（`tls` feature 有効時のみ）
    #[cfg(feature = "tls")]
    Tls(TlsTransportConfig),
}

impl TransportConfig {
    /// UDP トランスポートを指定されたポートで生成する（bind_addr = 0.0.0.0）。
    pub fn udp(port: u16) -> Self {
        Self::Udp(UdpTransportConfig::new(SocketAddr::from(([0, 0, 0, 0], port))))
    }

    /// TCP トランスポートを指定されたポートで生成する（bind_addr = 0.0.0.0）。
    pub fn tcp(port: u16) -> Self {
        Self::Tcp(TcpTransportConfig::new(SocketAddr::from(([0, 0, 0, 0], port))))
    }

    /// TLS トランスポートを指定されたポートで生成する（bind_addr = 0.0.0.0）。
    /// `tls` feature 有効時のみ利用可能。
    #[cfg(feature = "tls")]
    pub fn tls(port: u16, tls_config: TlsConfig) -> Self {
        Self::Tls(TlsTransportConfig::new(
            SocketAddr::from(([0, 0, 0, 0], port)),
            tls_config,
        ))
    }

    /// バインドアドレスを返す。
    pub fn bind_addr(&self) -> SocketAddr {
        match self {
            Self::Udp(cfg) => cfg.bind_addr,
            Self::Tcp(cfg) => cfg.bind_addr,
            #[cfg(feature = "tls")]
            Self::Tls(cfg) => cfg.bind_addr,
        }
    }

    /// トランスポート種類を返す。
    pub fn kind(&self) -> TransportKind {
        match self {
            Self::Udp(_) => TransportKind::Udp,
            Self::Tcp(_) => TransportKind::Tcp,
            #[cfg(feature = "tls")]
            Self::Tls(_) => TransportKind::Tls,
        }
    }
}
```

**設計判断**:
- `TransportKind` に `as_str()` を提供し、ログ出力や PJSIP の `pj_str_t` 変換で使用する
- `TlsConfig` に `default_verified()` / `insecure()` の convenience コンストラクタを追加。RFC §12 の構造体フィールドをそのまま保持
- `TransportConfig::udp(port)` / `tcp(port)` / `tls(port, tls)` は `0.0.0.0` バインドの簡易コンストラクタ。IPv6 や特定インタフェース指定は `UdpTransportConfig::new(...)` を直接使用
- `UdpTransportConfig` / `TcpTransportConfig` は `Eq` を derive（SocketAddr が Eq なため）
- `TlsConfig` / `TlsTransportConfig` / `TransportConfig` は `PartialEq` only（PathBuf の Eq 制約、TlsConfig の allow_insecure_cipher_legacy を除いて実質的に比較可能だが PartialEq のみ導出）

### 3. `crates/siprs/src/lib.rs`（修正）

現行:
```rust
pub mod audio;
pub mod error;
pub mod util;
```

修正後:
```rust
pub mod audio;
pub mod error;
pub mod transport;
pub mod util;
```

（`pub mod transport;` を `error` と `util` の間に追加）

## Non-scope

- ICE/STUN/TURN 設定 — M1-4
- `ClientConfig.transports` としてのトランスポート設定集約 — M2-1
- トランスポート設定のバリデーション — M3-1
- 実際のトランスポート作成（PJSIP FFI）— M17-4
- `serde` の `Serialize` / `Deserialize` 導出 — 後続チケットの検討事項

## Test Plan

### ユニットテスト計画（transport.rs）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_transport_kind_as_str_udp` | Udp.as_str() == "udp" |
| 2 | `test_transport_kind_as_str_tcp` | Tcp.as_str() == "tcp" |
| 3 | `test_transport_kind_display` | Display が "udp"/"tcp" を返す |
| 4 | `test_transport_kind_clone_copy_eq` | TransportKind が Clone + Copy + PartialEq + Eq |
| 5 | `test_udp_transport_config_new` | UdpTransportConfig::new() の bind_addr が正しい |
| 6 | `test_tcp_transport_config_new` | TcpTransportConfig::new() の bind_addr が正しい |
| 7 | `test_transport_config_udp` | TransportConfig::udp(5060) の bind_addr が 0.0.0.0:5060 |
| 8 | `test_transport_config_tcp` | TransportConfig::tcp(5060) の bind_addr が 0.0.0.0:5060 |
| 9 | `test_transport_config_bind_addr` | bind_addr() が各 variant で正しいアドレスを返す |
| 10 | `test_transport_config_kind` | kind() が各 variant で正しい TransportKind を返す |
| 11 | `test_transport_kind_send_sync` | TransportKind が Send + Sync であることのコンパイル時確認 |
| 12 | `test_udp_transport_config_send_sync` | UdpTransportConfig が Send + Sync であるコンパイル時確認 |
| 13 | `test_tcp_transport_config_send_sync` | TcpTransportConfig が Send + Sync であるコンパイル時確認 |
| 14 | `test_transport_config_send_sync` | TransportConfig が Send + Sync であるコンパイル時確認 |

**`#[cfg(feature = "tls")]` 条件付きテスト:**

| # | テスト名 | 内容 |
|---|---------|------|
| 15 | `test_tls_config_default_verified` | TlsConfig::default_verified() の verify_server == true |
| 16 | `test_tls_config_insecure` | TlsConfig::insecure() の verify_server == false |
| 17 | `test_tls_transport_config_new` | TlsTransportConfig::new() の bind_addr / tls が正しい |
| 18 | `test_transport_config_tls` | TransportConfig::tls(5061, ...) の bind_addr が 0.0.0.0:5061 |
| 19 | `test_transport_kind_tls_variant` | tls feature 有効時に Tls variant が存在 |
| 20 | `test_tls_config_send_sync` | TlsConfig が Send + Sync であるコンパイル時確認 |
| 21 | `test_tls_transport_config_send_sync` | TlsTransportConfig が Send + Sync であるコンパイル時確認 |

### ユニットテスト不可能な項目（例外）

- `tls` feature 無効時の `TransportConfig::Tls` / `TransportKind::Tls` のコンパイルエラー確認 — doc-test で ```` ```rust,ignore ```` または明示的な note で説明する。自動テストでは `cargo check --no-default-features` で確認する手順を Acceptance Criteria に記載
- 実際の TLS ハンドシェイクの検証 — FFI 結合テスト（M20-1）で実施

## Boy Scout Rule — 翻訳可能性計画

- `as_str()` / `bind_addr()` / `kind()` — 全て「何を返すか」が関数名から自明
- `TransportConfig::udp(port)` / `tcp(port)` / `tls(port, tls)` — 「指定ポートで UDP/TCP/TLS トランスポート設定を生成する」という動作が関数名から一意に特定できる
- `TlsConfig::default_verified()` / `insecure()` — 用途が名前から明確な convenience コンストラクタ
- `UdpTransportConfig` / `TcpTransportConfig` のフィールドは公開し、利用者が自由に構築可能

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存テスト含む）
- [ ] `cargo build --features tls` がエラーなく成功する
- [ ] `cargo test --features tls` で TLS 条件付きテストを含む全テストが PASS
- [ ] RFC §12 の `TransportKind` / `TransportConfig` / `UdpTransportConfig` / `TcpTransportConfig` / `TlsTransportConfig` / `TlsConfig` が定義済み
- [ ] `tls` feature 無効時に `TransportKind::Tls` / `TransportConfig::Tls` が型レベルで存在しない
- [ ] `TransportConfig::udp(5060).bind_addr()` が `0.0.0.0:5060` を返す
- [ ] `TransportConfig::kind()` が各 variant に対応する `TransportKind` を返す
- [ ] 全トランスポート関連型が `Clone + Debug + Send + Sync` であること
- [ ] `lib.rs` に `pub mod transport;` が追加されていること
- [ ] `Cargo.toml` に `tls = []` feature が追加されていること

## Notes

### 後続チケットとの連携

| チケット | 連携内容 |
|----------|----------|
| M1-4 | ICE/STUN/TURN 設定 — TransportConfig と同階層の設定型 |
| M2-1 | `ClientConfig.transports: Vec<TransportConfig>` として集約 |
| M17-4 | `PjsuaBackend::create_transport()` で実際の PJSIP トランスポートを作成 |

### `TlsConfig` の重複について

RFC §12 で定義される `TlsConfig` は本チケット M1-3 で `TlsTransportConfig` の構成要素として定義する。M2-3（チケット名に TlsConfig を含む）は `AccountConfig` や `CallMediaPreferences` と並ぶ設定型群であり、同名の別コンテキストでの使用を想定している可能性があるが、M2-3 の詳細は spec 確定時に調整する。時系列としては、M1-3 で先に定義された TlsConfig を M2-3 から参照することで統一的に扱う。

### `cargo check` による TLS feature 検証

`tls` feature の conditional compilation を検証するには、以下の 2 通りのコマンドが必要：

```bash
# TLS 無効（デフォルト）— TransportKind::Tls は存在しない
cargo check

# TLS 有効 — TransportKind::Tls が存在する
cargo check --features tls
```

Acceptance Criteria では両方の成功を要件とする。
