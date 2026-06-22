---
ticket_id: 64
title: "M2-3: TlsConfig / ReconnectPolicy / CallMediaPreferences / OutgoingCallRequest / NegotiatedCodec / CodecSelectionPolicy 定義"
slug: m2-3-config-remaining
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0064-m2-3-config-remaining/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0064-m2-3-config-remaining/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0064-m2-3-config-remaining/plan.md
---
# M2-3: TlsConfig / ReconnectPolicy / CallMediaPreferences / OutgoingCallRequest / NegotiatedCodec / CodecSelectionPolicy 定義

## Summary

M2 マイルストーン最終チケット。発信リクエスト・TLS 設定・ネゴシエーション結果・再接続ポリシーを型で規定する。既存の `src/config.rs` に追記し、`TlsConfig` は `transport.rs` の既存定義を `pub use` で再公開する。

## Background

### RFC 準拠

RFC §8.5（OutgoingCallRequest）、§12（TlsConfig、transport.rs 既存）、§29.2（NegotiatedCodec / CodecSelectionPolicy）、§31（ReconnectPolicy）に準拠する。

### 既存チケットからの依存関係

- `AuthOverride`（M2-2）→ `OutgoingCallRequest.auth_override` で使用
- `Codec` / `OpusConfig`（M2-2）→ `CallMediaPreferences.preferred_codecs` / `NegotiatedCodec.Opus(config)` で使用
- `TransportKind`（M1-3）→ `OutgoingCallRequest.preferred_transport` で使用
- `TlsConfig`（M1-3, transport.rs）→ 本チケットで `pub use` 再公開

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M3-1 | ClientConfig バリデーション |
| M12-2 | SipClient::make_call() — OutgoingCallRequest を受け取る |
| M13-2 | 発着信APIからの参照 |

## Scope

### `crates/siprs/src/config.rs`（修正）

1. **pub use に `TlsConfig` 追加**（`#[cfg(feature = "tls")]` 条件付き）
2. **CallMediaPreferences** struct — enable_early_media / enable_srtp / preferred_codecs
3. **OutgoingCallRequest** struct — target_uri / headers / auth_override / preferred_transport / media / auto_answer_refer
4. **NegotiatedCodec** enum — Pcmu / Opus(OpusConfig)（Clone + Copy + Eq... Opus は OpusConfig 参照のため PartialEq only）
5. **CodecSelectionPolicy** enum — Ordered / PreferOpusFallbackPcmu + Default
6. **ReconnectPolicy** struct — base_delay / max_delay / jitter_ratio

### TlsConfig の配置判断

`TlsConfig` は M1-3 で既に `transport.rs` に定義済み（`#[cfg(feature = "tls")]`）。M2-3 ではこれを config.rs で `pub use` 再公開し、利用者が `crate::config::TlsConfig` のパスでもアクセスできるようにする。重複定義は行わない。

```rust
#[cfg(feature = "tls")]
pub use crate::transport::TlsConfig;
```

### 各型の定義

```rust
/// 発信通話リクエスト。
#[derive(Debug, Clone)]
pub struct OutgoingCallRequest {
    /// 発信先 URI（例: "sip:user@domain.com"）
    pub target_uri: String,
    /// カスタム SIP ヘッダー
    pub headers: Vec<(String, String)>,
    /// 認証オーバーライド
    pub auth_override: Option<AuthOverride>,
    /// 優先トランスポート（None でアカウント設定に従う）
    pub preferred_transport: Option<TransportKind>,
    /// メディア設定
    pub media: CallMediaPreferences,
    /// Refer を自動応答する（既定: false）
    pub auto_answer_refer: bool,
}

/// 通話メディア設定。
#[derive(Debug, Clone)]
pub struct CallMediaPreferences {
    /// Early media を有効にする（既定: true）
    pub enable_early_media: bool,
    /// SRTP を有効にする（None でアカウント設定に従う）
    pub enable_srtp: Option<bool>,
    /// 優先コーデック一覧（PCMU / Opus のみ受理、他は validation error）
    pub preferred_codecs: Vec<Codec>,
}

/// SDP negotiation 後に確定した使用コーデック。
#[derive(Debug, Clone, PartialEq)]
pub enum NegotiatedCodec {
    /// PCMU (G.711 μ-law) / 8000Hz / 1ch
    Pcmu,
    /// Opus / 48000Hz / 2ch
    Opus(OpusConfig),
}

/// コーデック選択ポリシー。
#[derive(Debug, Clone)]
pub enum CodecSelectionPolicy {
    /// 設定された優先順位で交渉し、最初に合意したコーデックを採用
    Ordered,
    /// Opus を優先試行、拒否時のみ PCMU にフォールバック（既定）
    PreferOpusFallbackPcmu,
}

impl Default for CodecSelectionPolicy {
    fn default() -> Self { Self::PreferOpusFallbackPcmu }
}

/// トランスポート再接続ポリシー。
#[derive(Debug, Clone)]
pub struct ReconnectPolicy {
    /// 基本遅延（既定: 1 秒）
    pub base_delay: Duration,
    /// 最大遅延（既定: 60 秒）
    pub max_delay: Duration,
    /// ジッター比率（0.0–1.0）（既定: 0.5）
    pub jitter_ratio: f32,
}
```

**設計判断**:
- `NegotiatedCodec` は `PartialEq` only（OpusConfig が PartialEq のため Eq なし）
- `CodecSelectionPolicy` は `Default` トレイトのみ実装（RFC §29.2）
- `ReconnectPolicy.jitter_ratio` の範囲検証（0.0–1.0）は M3-1（設定バリデーション）で実施
- `CallMediaPreferences` の `enable_srtp` は `Option<bool>`（None = アカウント設定に従う）
- `OutgoingCallRequest.auth_override` は M2-2 で定義した `AuthOverride` を参照

## Non-scope

- バリデーション（preferred_codecs PCMU/Opus のみ、ReconnectPolicy 範囲等）— M3-1
- SDP negotiation ロジック — 実 FFI 結合層（M17 以降）
- `make_call()` の実装 — M12-2

## Test Plan

### ユニットテスト計画（config.rs に追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_outgoing_call_request_fields` | 全フィールドのラウンドトリップ |
| 2 | `test_call_media_preferences_default_early_media` | enable_early_media 既定値（true） |
| 3 | `test_call_media_preferences_default_srtp` | enable_srtp 既定値（None） |
| 4 | `test_call_media_preferences_default_codecs` | preferred_codecs 既定値（空） |
| 5 | `test_negotiated_codec_pcmu` | Pcmu variant |
| 6 | `test_negotiated_codec_opus` | Opus(config) variant が config を保持 |
| 7 | `test_codec_selection_policy_default` | Default が PreferOpusFallbackPcmu |
| 8 | `test_reconnect_policy_fields` | 全フィールドのラウンドトリップ |
| 9 | `test_reconnect_policy_send_sync` | ReconnectPolicy の Send + Sync 確認 |
| 10 | `test_call_media_preferences_send_sync` | CallMediaPreferences の Send + Sync 確認 |
| 11 | `test_outgoing_call_request_send_sync` | OutgoingCallRequest の Send + Sync 確認 |
| 12+ | `test_tls_config_pub_use*` | （`#[cfg(feature = "tls")]` 条件付き）再公開の確認 |

### ユニットテスト不可能な項目（例外）

- バリデーションルール — M3-1
- tls feature 無効時の TlsConfig コンパイルエラー — `cargo check` で検証（Acceptance Criteria）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること
- [ ] `cargo build --features tls` が成功すること
- [ ] CallMediaPreferences が 3 フィールドで定義済み
- [ ] OutgoingCallRequest が 6 フィールドで定義済み
- [ ] NegotiatedCodec enum（Pcmu / Opus(OpusConfig)）定義済み
- [ ] CodecSelectionPolicy（Ordered / PreferOpusFallbackPcmu）+ Default 定義済み
- [ ] ReconnectPolicy（3 フィールド）定義済み
- [ ] config.rs で `pub use crate::transport::TlsConfig` を `#[cfg(feature = "tls")]` 付きで再公開
- [ ] 全型が Clone + Debug + Send + Sync

## Notes

### M2 マイルストーン完了

本チケット #64 で M2（設定型）の全 3 チケットが完了する。これによりフェーズ1（基盤型定義 Layer 0）が完了し、次フェーズ（純粋ロジック Layer 1）に進む。

### TlsConfig の再公開パス

RFC の lib.rs 公開 API は `crate::config::TlsConfig` のパスを示している。M1-3 で `transport.rs` に定義した TlsConfig を config.rs で `pub use` することで、両方のパスからアクセス可能になる。
