---
ticket_id: 65
title: "M3-1: ClientConfig バリデーション"
slug: m3-1-clientconfig-validation
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0065-m3-1-clientconfig-validation/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0065-m3-1-clientconfig-validation/review.md
---

# M3-1: ClientConfig バリデーション

## Summary

`SipClient::new()` の冒頭で全設定の正当性を検証するバリデーション関数群を実装する。fail-fast の原則に従い、不正な設定は `SipError::InvalidConfig` として PJSUA の初期化前に即座に拒否される。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§42)

## Background

### RFC 準拠

RFC §42（validation フェーズ）に準拠する。以下のルールを強制する：

- `event_bus_capacity >= 16`
- `raw_sip_events.enabled == true` の場合 `raw_sip_event_capacity >= event_bus_capacity`
- `default_delivery_format.sample_rate` は 8/16/24/48kHz のみ（型レベルで保証されるが belt-and-suspenders として検証）
- `pair_buffer_ms` が `mixer_frame_ms` の整数倍
- unsupported transport feature 使用禁止（feature flag 整合性）
- SRTP mandatory かつ feature off 禁止（`#[cfg(not(feature = "srtp"))]` 時）
- TLS config と feature 不整合禁止（`#[cfg(not(feature = "tls"))]` 時）

### 既存チケットからの依存関係

- `ClientConfig` / `ClientAudioConfig` / `RawSipEventConfig` / `TimeoutConfig`（M2-1: #62）— バリデーション対象
- `TransportConfig` / `TransportKind`（M1-3: #60）— transport feature flag 整合性チェックで使用
- `IceConfig`（M1-4: #61）— バリデーション対象（`#[cfg(not(feature = "ice"))]` 時のチェック）
- `SrtpPolicy`（M2-2: #63）— SRTP mandatory チェックで使用
- `SampleRate`（M1-1: #54）— sample_rate 検証で使用
- `AudioFormat`（M1-1: #54）— `default_delivery_format` の構造を参照
- `SipError`（M0-1: #52）— `SipError::invalid_config()` でエラーを返す

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M3-2 (#66) | AccountConfig バリデーション（本チケットと並行して定義） |
| M12-2 | SipClient::new() — バリデーションの呼び出し元 |
| M10-2 | MockBackend でもバリデーションを呼ぶ可能性 |

### 設計判断

- **`pub(crate)` 可視性**: バリデーション関数は crate 内部でのみ使用し、公開 API としてはエクスポートしない。M12-2（SipClient::new()）からのみ呼ばれる想定
- **単一の validate 関数 vs 分割**: Tickets.md のスコープに従い、`validate_client_config()` は単一関数として実装し、内部でサブチェックを呼び出す構造とする
- **`SampleRate` の型安全性**: `SampleRate` enum 自体が 8/16/24/48kHz のみに制限されているため、このチェックは理論上常にパスする。しかし将来の拡張（例: 96kHz 追加）に備えて belt-and-suspenders として明示的に検証する
- **エラーメッセージ**: どのフィールドがどの条件に違反したかを明示する。例: `"event_bus_capacity must be >= 16, got 8"`
- **feature flag チェック**: `tls` / `srtp` / `ice` 各 feature が無効の場合、該当する設定値が使用されていないかを確認する。チェック対象は各 `TransportConfig` バリアント

## Scope

### `crates/siprs/src/config.rs`（修正 — ファイル末尾のテスト前に追記）

1. **`pub(crate) fn validate_client_config(cfg: &ClientConfig) -> Result<(), SipError>`**
   - 全バリデーションルールのエントリポイント
   - 内部で以下のサブチェックを呼び出す
   ```rust
   pub(crate) fn validate_client_config(cfg: &ClientConfig) -> Result<(), SipError> {
       validate_event_bus_capacity(cfg.event_bus_capacity)?;
       validate_raw_sip_event_capacity(cfg.raw_sip_events.enabled, cfg.raw_sip_event_capacity, cfg.event_bus_capacity)?;
       validate_audio_format(&cfg.audio.default_delivery_format)?;
       validate_pair_buffer(cfg.audio.pair_buffer_ms, cfg.audio.mixer_frame_ms)?;
       validate_transports(&cfg.transports)?;
       Ok(())
   }
   ```

2. **`fn validate_event_bus_capacity(capacity: usize) -> Result<(), SipError>`**
   - `capacity >= 16` を検証

3. **`fn validate_raw_sip_event_capacity(enabled: bool, capacity: usize, bus_capacity: usize) -> Result<(), SipError>`**
   - `enabled && capacity < bus_capacity` → `InvalidConfig`

4. **`fn validate_audio_format(fmt: &AudioFormat) -> Result<(), SipError>`**
   - `sample_rate` が 8/16/24/48kHz のいずれかであることを検証
   - `frame_ms` が 0 でないことを検証

5. **`fn validate_pair_buffer(pair_buffer_ms: u32, mixer_frame_ms: u32) -> Result<(), SipError>`**
   - `pair_buffer_ms` が `mixer_frame_ms` の整数倍であり、かつ 0 でないことを検証

6. **`fn validate_transports(transports: &[TransportConfig]) -> Result<(), SipError>`**
   - `#[cfg(not(feature = "tls"))]` 時に `TransportConfig::Tls` が含まれていないことを検証（コンパイル時の型レベルの保証に加えて、列挙型の構造上 Tls バリアントそのものが存在しないため、このチェックは型レベルで保証される。将来の conditional compilation 変更に備えて明示する）

### テストコード

すべてのバリデーションルールについて「許可」と「拒否」の両ケースをテストする。

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_validate_client_config_ok` | 有効な ClientConfig（Default）→ Ok |
| 2 | `test_validate_event_bus_capacity_minimum` | capacity=16 → Ok |
| 3 | `test_validate_event_bus_capacity_too_small` | capacity=15 → InvalidConfig |
| 4 | `test_validate_raw_sip_event_capacity_sufficient` | enabled=true, capacity >= bus → Ok |
| 5 | `test_validate_raw_sip_event_capacity_insufficient` | enabled=true, capacity < bus → InvalidConfig |
| 6 | `test_validate_raw_sip_event_disabled_no_check` | enabled=false → capacity 不問で Ok |
| 7 | `test_validate_audio_format_valid_rates` | 各有効 SampleRate で Ok |
| 8 | `test_validate_pair_buffer_multiple` | pair=120, frame=20 → Ok（6倍） |
| 9 | `test_validate_pair_buffer_not_multiple` | pair=125, frame=20 → InvalidConfig |
| 10 | `test_validate_pair_buffer_zero` | pair=0 → InvalidConfig |
| 11 | `test_validate_client_config_all_errors_have_field_name` | 全エラーメッセージに違反フィールド名が含まれる |
| 12 | `test_validate_client_config_send_sync` | 関数の Send + Sync（Fn 境界の確認） |

### ユニットテスト不可能な項目（例外）

- tls feature 無効時の `TransportConfig::Tls` チェック — 型レベルで Tls バリアントが存在しないため、コンパイル時に保証される。`cargo build --no-default-features` でのビルド確認で代替
- SRTP mandatory × feature off — M3-2（AccountConfig バリデーション）で扱う（`SrtpPolicy` は AccountConfig 側の設定）
- ICE feature off 時の IceConfig チェック — 同様に型レベルで保証される（`IceConfig` は `#[cfg(feature = "ice")]` で条件付き定義されている場合）

## Non-scope

- AccountConfig バリデーション（`validate_account_config`）— M3-2
- `SipClient::new()` でのバリデーション呼び出し — M12-2
- エラー型の拡張 — 既存の `SipError::InvalidConfig` で十分
- serde の Serialize/Deserialize — 後続検討事項
- パフォーマンス最適化 — バリデーションは初期化時に一度だけ実行されるため、簡潔さを優先

## Test Plan

### 基本方針

ユニットテストで全バリデーションルールの網羅率 100% を達成する。各ルールについて「許可ケース」と「拒否ケース」の両方を検証する。エラーメッセージに違反フィールド名が含まれることを確認する。

### ユニットテスト計画

上記 Scope のテストコード一覧を参照。

### ユニットテスト不可能な項目（例外）

- TLS feature flag と型の整合性 — コンパイル時に型システムが保証する。`cargo check --no-default-features` で検証。

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存の 131 テスト + 新規テスト）
- [ ] `validate_client_config()` が `pub(crate)` で定義されている
- [ ] `ClientConfig::default()` が validate を通過すること
- [ ] `event_bus_capacity = 16` → OK, `= 15` → `InvalidConfig`
- [ ] `raw_sip_events.enabled = true`, `raw_sip_event_capacity < event_bus_capacity` → `InvalidConfig`
- [ ] `raw_sip_events.enabled = false` → `raw_sip_event_capacity` 不問で OK
- [ ] `pair_buffer_ms = 120`, `mixer_frame_ms = 20` → OK（6倍）
- [ ] `pair_buffer_ms = 125`, `mixer_frame_ms = 20` → `InvalidConfig`
- [ ] `tls` feature 無効時に `TransportConfig::Tls` を含むとコンパイルエラー（型レベル）
- [ ] 全エラーメッセージに違反フィールド名が含まれること
- [ ] 全バリデーションルールのテスト網羅率 100%

## Notes

### フェーズ2（Layer 1）の開始

本チケット #65 は siprs フェーズ2（純粋ロジック Layer 1）の最初のチケットである。Layer 0（基盤型定義）の M0-M2 が完了した後、初めてのロジック実装となる。

### バリデーションの分割戦略

`validate_client_config()` は単一のパブリック関数とし、内部で複数の小さなチェック関数に委譲する。これにより：
- テスト容易性：各チェックを個別にテスト可能
- 可読性：「翻訳可能性」の原則に従い、関数呼び出しの並びが処理手順を物語る
- 保守性：新ルール追加時に独立した関数を追加するだけ

### InvalidConfig エラー

エラーメッセージは「どのフィールドが、どの条件に違反したか」を明示する。SipErrorKind::InvalidConfig に String でメッセージを格納する既存の設計に従う。

```rust
// 期待されるエラーメッセージの例
Err(SipError::invalid_config("event_bus_capacity must be >= 16, got 15"))
Err(SipError::invalid_config("raw_sip_event_capacity (100) must be >= event_bus_capacity (200)"))
Err(SipError::invalid_config("pair_buffer_ms (125) must be a multiple of mixer_frame_ms (20)"))
```

### フェーズ2 ロードマップ

```text
M3-1 (#65): ClientConfig バリデーション ← 本チケット
M3-2 (#66): AccountConfig バリデーション
M4-1 (#67): BiMap<RuntimeId, NativeId> 実装
M4-2 (#68): ユーティリティ（PjOwnedStr ラッパー骨格 / SecretString 検証）
M5-1 (#69): mix_i16_frame ミキシングアルゴリズム
M5-2 (#70): interleave_in_out ステレオマッピング
M5-3 (#71): PairAligner
```
