---
ticket_id: 185
title: PjsuaBackend メソッド完全化 — configure_codecs auto モード（P1）
slug: pjsuabackend-configure-codecs-auto-p1
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0185-pjsuabackend-configure-codecs-auto-p1/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0185-pjsuabackend-configure-codecs-auto-p1/review.md
---
# PjsuaBackend メソッド完全化 — configure_codecs auto モード（P1）

## Summary

`PjsuaBackend::configure_codecs()` に RFC02 §6.4 準拠の auto モード（Opus=255, PCMU=254, その他無効）を実装し、`CallMediaPreferences::preferred_codecs` との2層ポリシー連携を確立する。ついでに現在逆転している優先度定数を修正する。

## Background

M17-4 で `SipBackend` trait の `configure_codecs()` が骨格実装された。しかし以下の問題を確認した：

1. **優先度定数の逆転（バグ）**: 
   - `crates/siprs/src/ffi/pjsua_backend.rs:43`: `CODEC_PRIO_PCMU = 255`（最高優先度）
   - `crates/siprs/src/ffi/pjsua_backend.rs:45`: `CODEC_PRIO_OPUS = 254`（第二優先度）
   - RFC02 §6.4 の正しい優先順位は **Opus=255, PCMU=254**。現在の実装は逆であり、Opus が利用可能な環境でも PCMU が優先的に選択される。
   - 関連テスト `test_codec_priority_constants`（`pjsua_backend.rs:847`）も逆転した定数値をそのままアサートしているため、定数修正と同時にテストも修正が必要。

2. **auto モード未実装**:
   - `configure_codecs()`（`pjsua_backend.rs:570-619`）は現在ハードコードされた1パターンのみ。
   - `CallMediaPreferences::preferred_codecs`（`config.rs:537`）の値を一切参照していない。
   - RFC02 §6.5 で規定される2層ポリシー（auto モード / 明示指定モード）が未実装。

3. **configure_codecs が未結合**:
   - `RuntimeCommand` enum（`command.rs:67-`）に `ConfigureCodecs` variant が存在しない。
   - Reactor loop（`reactor.rs`）内で `configure_codecs()` が一度も呼ばれていない。
   - `PjsuaBackend::initialize()`（`pjsua_backend.rs:197-266`）内でも呼ばれていない。
   - そのため、現在の実装はデッドコード状態にある。

4. **trait 設計課題**:
   - `SipBackend::configure_codecs(&mut self)`（`backend.rs:100`）は `&mut self` のみを受け取り、`preferred_codecs` を受け取る手段がない。
   - PJSIP の `pjsua_codec_set_priority` はグローバル設定（プロセス全体）であるため、`configure_codecs` は初期化時に1度だけ呼ばれる想定。ただし将来 per-account の `AccountCodecPolicy`（`config.rs:294`）との統合も考慮する必要がある。

## Investigation

### 証拠1: 優先度定数の逆転

```rust
// pjsua_backend.rs:42-47
/// PCMU/8000 の優先度（最高）。
pub(crate) const CODEC_PRIO_PCMU: u8 = 255;   // ← バグ: 254 が正しい
/// Opus 系コーデックの優先度。
pub(crate) const CODEC_PRIO_OPUS: u8 = 254;   // ← バグ: 255 が正しい
/// 無効化するコーデックの優先度。
pub(crate) const CODEC_PRIO_DISABLED: u8 = 0;
```

RFC02 §6.4（付録B で修正確定済み）: Opus=255（最優先）、PCMU=254（フォールバック）。

### 証拠2: テストも逆転値をアサート

```rust
// pjsua_backend.rs:847-851
#[test]
fn test_codec_priority_constants() {
    assert_eq!(CODEC_PRIO_PCMU, 255);   // ← 定数修正後に 254 に変更
    assert_eq!(CODEC_PRIO_OPUS, 254);   // ← 定数修正後に 255 に変更
    assert_eq!(CODEC_PRIO_DISABLED, 0); // ← これは正しい
}
```

### 証拠3: configure_codecs が呼ばれていない

バックエンド実装は存在するが、Reacto rのどの `RuntimeCommand` handler からも呼ばれていない:

- `crates/siprs/src/runtime/command.rs`: `RuntimeCommand` enum に `ConfigureCodecs` variant なし
- `crates/siprs/src/runtime/reactor.rs`: `configure_codecs` の呼び出しなし
- `crates/siprs/src/ffi/pjsua_backend.rs:197-266`: `initialize()` 内で `configure_codecs()` 呼び出しなし

### 証拠4: 現状の configure_codecs 実装（pjsua_backend.rs:570-619）

```rust
fn configure_codecs(&mut self) -> Result<(), SipError> {
    unsafe {
        // PCMU（G.711 μ-law）= 最高優先度 (255)
        let pcmu = ...;
        let mut status = bindings::pjsua_codec_set_priority(&pcmu, CODEC_PRIO_PCMU);
        // → 優先度逆転のため Opus より PCMU が優先される

        // Opus（利用可能な場合）= 高優先度 (254)
        let opus = ...;
        status = bindings::pjsua_codec_set_priority(&opus, CODEC_PRIO_OPUS);
        // Opus 未インストール時は無視（status != 0 を握りつぶす）

        // PCMU/Opus 以外の全コーデックを無効化
        // → 優先度逆転のまま disable ロジックが走る
    }
    Ok(())
}
```

### 証拠5: 関連型の定義

```rust
// config.rs:230-235 — サポートするコーデック
pub enum Codec { Pcmu, Opus }

// config.rs:531-538 — 通話メディア設定
pub struct CallMediaPreferences {
    pub enable_early_media: bool,
    pub enable_srtp: Option<bool>,
    pub preferred_codecs: Vec<Codec>,  // 空 = auto モード
}

// config.rs:294-301 — アカウントのコーデックポリシー
pub struct AccountCodecPolicy {
    pub enable_pcmu: bool,
    pub enable_opus: bool,
    pub opus: OpusConfig,
}

// config.rs:582-590 — コーデック選択ポリシー
pub enum CodecSelectionPolicy {
    Ordered,
    #[default]
    PreferOpusFallbackPcmu,
}
```

## Scope

1. **優先度定数の修正**:
   - `CODEC_PRIO_PCMU`: 255 → 254
   - `CODEC_PRIO_OPUS`: 254 → 255
   - テスト `test_codec_priority_constants` のアサーション値を修正

2. **`configure_codecs` の auto モード実装**（同一メソッド内で完結）:
   - `pjsua_enum_codecs()` で全コーデック列挙
   - Opus 系（`opus/` で始まるコードcID）→ priority 255（最優先）
   - PCMU/8000/1 → priority 254（Opus 非対応環境用フォールバック）
   - それ以外 → priority 0（無効化）
   - コメントを修正し意図を正確に反映（現行コメントは「PCMU=最高」と誤記）

3. **`SipBackend` trait の修正**: `configure_codecs` のシグネチャを `&[Codec]` を受け取る形に変更する（auto モードか明示指定モードかの分岐をバックエンドに委譲）。ただし破壊的変更点を最小限に抑える設計検討が必要 → 空スライス = auto モード、非空 = 明示指定モードとする。

4. **`MockBackend::configure_codecs` の更新**: 新しいシグネチャに対応。

5. **Reactor 結合**: `RuntimeCommand::Initialize` ハンドラ内で `configure_codecs(&[])`（auto モード）を呼び出し、初期化時にコーデック設定が確定するよう結合する。

6. **エラーハンドリング**: `pjsua_codec_set_priority` 失敗時のエラー伝播（現状 Opus の失敗のみ握りつぶし、これは意図通り維持する）。

7. **テスト**:
   - `MockBackend` ユニットテストで auto モードの挙動確認
   - 優先度定数修正後のアサーション
   - `PjsuaBackend` 非PJSIPスタブの `configure_codecs` が `unimplemented!()` を返すことの確認（既存）

## Non-scope

- `AccountCodecPolicy`（`config.rs:294`）と `configure_codecs` の連携 — 別チケットで対応
- `CallMediaPreferences::preferred_codecs` の per-call 反映（SDP negotiation レベル）— 別チケット
- `CodecSelectionPolicy`（`PreferOpusFallbackPcmu`）と `configure_codecs` の統合 — 別チケット
- `RuntimeCommand::UpdateAccountConfig` からのコーデック再設定 — 別チケット

## Test Plan

### ユニットテスト計画

#### 優先度定数テスト（既存テスト修正）

| # | テスト | 内容 | ファイル |
|---|--------|------|----------|
| 1 | `test_codec_priority_constants` | `CODEC_PRIO_OPUS = 255`, `CODEC_PRIO_PCMU = 254`, `CODEC_PRIO_DISABLED = 0` | `pjsua_backend.rs` |

#### MockBackend configure_codecs テスト（新規）

`MockBackend` は空実装のため `configure_codecs(&[])` が `Ok(())` を返すことだけ確認する。

| # | テスト | 内容 |
|---|--------|------|
| 2 | `test_configure_codecs_auto_ok` | Auto モード（空スライス）で `Ok(())` |
| 3 | `test_configure_codecs_explicit_ok` | 明示指定モード（`[Codec::Opus]`）で `Ok(())` |

#### Backend trait 非PJSIPスタブテスト（既存確認）

| # | テスト | 内容 |
|---|--------|------|
| 4 | `test_configure_codecs_without_pjsip` | `feature = "pjsip"` なしで `unimplemented!()` |

### 結合テスト計画

| # | テスト | 内容 | 備考 |
|---|--------|------|------|
| 5 | Initialize 時に configure_codecs が呼ばれる | Reactor 初期化後にコーデック設定が反映される | `tests/` integration test |
| 6 | Opus → PCMU フォールバック | Docker Asterisk で Opus 非対応環境との接続確認 | 既存統合テストフレームワーク活用 |

### ユニットテスト不可能な項目（例外）

- `pjsua_codec_set_priority` の実際の FFI 呼び出し結果（PJSIP ライブラリ依存）→ `#[cfg(feature = "pjsip")]` の結合テストでカバー
- `pjsua_enum_codecs` の列挙結果のバリエーション（利用可能コーデックは環境依存）→ モックバックエンドでロジックのみ検証

## Boy Scout Rule — 翻訳可能性計画

1. **優先度定数の命名とコメント修正**:
   - `CODEC_PRIO_PCMU` → コメントを「Opus 非対応環境向けフォールバック優先度」に修正（現行「最高」は誤り）
   - `CODEC_PRIO_OPUS` → コメントを「Opus 系コーデックの最優先度」に修正

2. **`configure_codecs` 内の処理ブロックの関数抽出**:
   - PCMU 設定ブロック → `fn set_pcmu_priority(&self) -> Result<(), SipError>`
   - Opus 設定ブロック → `fn set_opus_priority(&self) -> Result<(), SipError>`
   - その他コーデック無効化ブロック → `fn disable_other_codecs(&self) -> Result<(), SipError>`
   - これにより `configure_codecs` が「PCMU を設定し、Opus を設定し、その他を無効化する」という日本語に逐語訳可能な関数になる

3. **`pjsua_enum_codecs` の unsafe ブロック最小化**:
   - 現在の大きな unsafe ブロックを、各 FFI 呼び出しごとの最小単位の unsafe に分割し、各ブロックに `// SAFETY:` コメントを付与

4. **Opus エラー握りつぶしの意図明示**:
   - 現状 `if status != 0 { /* Opus 未インストールの場合は無視 */ }` とコメントがあるが、これを `if status != 0 { tracing::debug!(...) }` に変更し少なくともログ出力するよう改善

## Acceptance Criteria

- [ ] 優先度定数が RFC02 §6.4 に従い Opus=255, PCMU=254 に修正されている
- [ ] `test_codec_priority_constants` が修正後の値を正しくアサートしている
- [ ] `configure_codecs(&[])`（auto モード）で Opus が 255、PCMU が 254、その他が 0 に設定されるロジックになっている
- [ ] `SipBackend::configure_codecs` の trait シグネチャが `&[Codec]` を受け取る形に変更されている（空 = auto、非空 = 明示指定）
- [ ] `MockBackend::configure_codecs` が新しいシグネチャに対応している
- [ ] Reactor の `Initialize` ハンドラで `configure_codecs` が呼ばれるよう結合されている
- [ ] `cargo test` が全テストパスする
- [ ] `make check-be` が clippy 警告なしでパスする
- [ ] 翻訳可能性を改善するリファクタリングが実施されている（関数抽出、unsafe 最小化、ログ改善）

## Notes

### 設計判断: configure_codecs の trait シグネチャ

`SipBackend::configure_codecs` のシグネチャを `fn configure_codecs(&mut self) -> Result<(), SipError>` から `fn configure_codecs(&mut self, preferred: &[Codec]) -> Result<(), SipError>` に変更する。

- `preferred` が空スライスの場合: auto モード（Opus=255, PCMU=254）
- `preferred` が非空の場合: 明示指定モード（指定順に優先度設定、指定外は無効化）

この変更により呼び出し側（Reactor）は初期化時に `configure_codecs(&[])` を呼び出し auto モードを適用する。将来 per-call の上書きが必要な場合は、別途呼び出し可能なメソッドを追加する。

### 成果物

- 計画: `context/0185-pjsuabackend-configure-codecs-auto-p1/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0185-pjsuabackend-configure-codecs-auto-p1/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0185-pjsuabackend-configure-codecs-auto-p1/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）
