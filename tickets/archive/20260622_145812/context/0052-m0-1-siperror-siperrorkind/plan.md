# Plan: M0-1 SipError / SipErrorKind 定義

## 要件（spec 承認済み）

1. siprs crate の最小骨組み作成（Cargo.toml, lib.rs, error.rs）
2. SipErrorKind enum（23バリアント、RFC §14 準拠）
3. SipError 構造体（kind, message, native_status, account_id, call_id, retryable）
4. コンストラクタヘルパー 7種（invalid_config, invalid_state, timeout, native_error, channel_closed, shutdown_in_progress, invariant_broken）
5. AccountId/CallId 仮定義（M0-2 で util/id.rs に移設）
6. retryable フラグの決定論的マッピング
7. 全テストが `cargo test` で PASS すること

## Changes already made (during /plan-ticket)

- Tickets.md: 24→23 バリアント数訂正（2箇所）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/Cargo.toml | 新規 | crate マニフェスト（thiserror, tracing,  dev: static_assertions） |
| crates/siprs/src/lib.rs | 新規 | crate ルート、pub mod error |
| crates/siprs/src/error.rs | 新規 | AccountId, CallId, SipErrorKind, SipError, コンストラクタ, テスト |

## Boy Scout 改善（スコープ外）

新規 crate のためスコープ外の改善対象は存在しない。ただし以下の翻訳可能性原則に従って記述する：

- エラーメッセージは日本語で記述（利用者が読むエラーとして意味が伝わること）
- コンストラクタ関数名は動詞句（invalid_config, shutdown_in_progress）とし、処理内容が関数名から読み取れるようにする
- コメントは「なぜ」を日本語で、コードは「何を」で語らせる

## テスト計画

### 基本方針

全テストをユニットテストでカバーする。crate 外部依存（PJSIP）は M0-1 では不要。

### ユニットテスト計画（8件）

| # | テスト名 | 内容 | 正常/異常 |
|---|---------|------|----------|
| 1 | test_sip_error_display_contains_kind_and_message | Display 出力が "{kind}: {message}" 形式であること | 正常 |
| 2 | test_retryable_mapping | 各 variant の retryable フラグが期待値と一致 | 正常 |
| 3 | test_account_call_id_roundtrip | account_id/call_id の設定・取得 | 正常 |
| 4 | test_native_status_none | native_status 未設定時は None | 正常 |
| 5 | test_native_status_some | native_status 設定時に値が保持される | 正常 |
| 6 | test_all_variants_covered_by_retryable_mapping | 全23 variant 網羅性のコンパイル時確認（match 網羅性） | 正常 |
| 7 | test_error_send_sync | Send + Sync のコンパイル時確認 | 正常 |
| 8 | test_debug_output_format | Debug 出力に内部フィールドが含まれる | 正常 |

### ユニットテスト不可能な項目（例外）

- なし（全テストがメモリ内完結）

## 実装手順

1. **crates/siprs/ ディレクトリ作成**
   ```bash
   mkdir -p crates/siprs/src
   ```

2. **Cargo.toml 作成**
   ```bash
   cd crates/siprs
   cargo init --lib --name siprs
   cargo add thiserror
   cargo add tracing
   cargo add --dev static_assertions
   ```

3. **lib.rs 作成**: モジュール宣言 + ドキュメントコメント

4. **error.rs 作成**:
   - AccountId / CallId 仮定義（u64 newtype、M0-2 移設予定のコメント付き）
   - SipErrorKind enum（23 variant、全 variant に日本語 doc comment）
   - SipError struct（thiserror::Error derive、#[error("{kind}: {message}")]）
   - コンストラクタ 7種（invalid_config, invalid_state, timeout, native_error, channel_closed, shutdown_in_progress, invariant_broken）
   - テスト mod（8 テスト関数）

5. **ビルド確認**
   ```bash
   cd crates/siprs && cargo build
   ```

6. **テスト実行**
   ```bash
   cd crates/siprs && cargo test
   ```

7. **品質チェック**
   ```bash
   # run-quality-checks.js が存在すれば実行
   node /Users/shyme/shyme/zasso/.claude/scripts/tickets/review/run-quality-checks.js crates/siprs/src/error.rs crates/siprs/src/lib.rs
   ```

## 物理的レビュー方法

1. `cargo build` がエラーなく成功すること
2. `cargo test` で全 8 テストが PASS すること
3. 翻訳可能性 grep 確認:
   - 1文字変数がないこと（i, n 等のループ変数を除く）
   - 4桁以上のマジックナンバーがないこと
   - デバッグ出力（eprintln!, dbg!）が残っていないこと
4. run-quality-checks.js が pass すること

## リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| thiserror の Error derive が期待通り動作しない | 低 | 中 | テストで Display/Error トレイトを確認 |
| AccountId/CallId の M0-2 移設時に依存の循環が発生 | 低 | 高 | error.rs では最小限の仮定義に留め、M0-2 移設を容易に |
| static_assertions の version resolve 失敗 | 低 | 低 | 不要ならテストの match 網羅性確認のみで代替可能 |
