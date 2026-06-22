# Plan: M0-2 AccountId / CallId / AudioSourceId newtype 定義

## 要件（spec 承認済み）

1. `util/id.rs` に AccountId/CallId/AudioSourceId を NonZeroU64 ベースで正式定義
2. 各型に `generate()` 単調増加カウンタ + `into_raw()` + `Display` を実装
3. error.rs の仮定義ブロック（L15-L51）を削除し、`use crate::util::id::{AccountId, CallId}` に置換
4. error.rs テストの `from_raw` → `from_test` 書き換え
5. lib.rs に `pub mod util;` 追加
6. serde::Serialize/Deserialize の手動実装（`#[cfg(feature = "serde")]`）
7. 全テスト PASS

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/util/mod.rs | 新規 | util モジュール宣言、pub mod id |
| crates/siprs/src/util/id.rs | 新規 | AccountId / CallId / AudioSourceId 正式定義 + serde impl |
| crates/siprs/src/lib.rs | 修正 | `pub mod util;` 追加 |
| crates/siprs/src/error.rs | 修正 | 仮定義削除（L15-L51 削除）、use 追加、テストの from_raw → from_test |

## Boy Scout 改善

- error.rs の「仮定義＋TODO」コメントブロック（〜37行）を削除し、コードをクリーンアップ
- into_raw() の doc comment に「FFI 境界以外で使用しないこと」を明記

## テスト計画

### 基本方針

全テストをユニットテストでカバー。13 テスト関数を id.rs に実装。error.rs の既存テストは 1 関数を修正。

### ユニットテスト計画（id.rs: 13件 + error.rs修正: 1件）

**id.rs 新規テスト（13件）:**

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | test_account_id_generate_uniqueness | generate() 100回で全値一意 |
| 2 | test_account_id_non_zero_invariant | generate() 100万回でゼロ非発生 |
| 3 | test_account_id_equality | Eq, Hash, HashMap キー一貫性 |
| 4 | test_account_id_ordering | PartialOrd + Ord が自然順序 |
| 5 | test_account_id_display | "Account(N)" 形式 |
| 6 | test_call_id_generate_uniqueness | CallId 一意性 |
| 7 | test_call_id_display | "Call(N)" 形式 |
| 8 | test_audio_source_id_generate_uniqueness | AudioSourceId 一意性 |
| 9 | test_audio_source_id_display | "AudioSource(N)" 形式 |
| 10 | test_id_types_not_interchangeable | 異種ID間代入がコンパイルエラー |
| 11 | test_id_send_sync_copy | Send + Sync + Copy |
| 12 | test_serde_roundtrip | serde feature 時 JSON roundtrip |
| 13 | test_serde_rejects_zero | serde でゼロ値デシリアライズ失敗 |

**error.rs 修正テスト（1件）:**

| テスト名 | 修正内容 |
|---------|---------|
| test_account_call_id_roundtrip | from_raw(42) → from_test(42), from_raw(99) → from_test(99) |

### ユニットテスト不可能な項目（例外）

- serde roundtrip テストは `#[cfg(feature = "serde")]` が必要。デフォルト feature ではスキップ

## 実装手順

1. **util/id.rs 作成**
   ```bash
   mkdir -p crates/siprs/src/util
   ```
   - AccountId(NonZeroU64) 型定義 + generate() + into_raw() + Display
   - CallId(NonZeroU64) 型定義 + generate() + into_raw() + Display
   - AudioSourceId(NonZeroU64) 型定義 + generate() + into_raw() + Display
   - #[cfg(feature = "serde")] ブロックで Serialize/Deserialize 手動実装（3型分）
   - テスト mod（13テスト関数）

2. **util/mod.rs 作成**
   - `pub mod id;`

3. **lib.rs 修正**
   - `pub mod util;` 追加（コメントアウト解除）

4. **error.rs 修正**
   - L12 の use ブロックに `use crate::util::id::{AccountId, CallId};` 追加
   - L15-L51（仮定義ブロック全体）削除
   - L370-371: `from_raw` → `from_test` に変更
   - L374-375: アサーションの `from_raw` → `from_test` に変更

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
   node /Users/shyme/shyme/zasso/.claude/scripts/tickets/review/run-quality-checks.js crates/siprs/src/util/id.rs crates/siprs/src/error.rs crates/siprs/src/lib.rs
   ```

## 物理的レビュー方法

1. `cargo build` 成功（0 error, 0 warning）
2. `cargo test` 全テスト PASS
3. error.rs に AccountId/CallId の型定義が残っていないことを確認
4. `from_raw` が error.rs から完全に消えていることを確認（test 内も含む）
5. 翻訳可能性 grep（1文字変数なし、マジックナンバーなし、デバッグ出力なし）
6. `run-quality-checks.js` pass

## リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| error.rs の from_raw→from_test 書き換え漏れ | 低 | 中 | コンパイルエラーで検出可能。全ての from_raw 呼び出しを事前 grep |
| util/id.rs と error.rs で循環依存が発生 | 低 | 高 | error.rs は util/id.rs に依存（一方向）。循環は生じない構造 |
| serde impl のコンパイル条件が期待通り動作しない | 低 | 低 | cfgt test で確認。デフォルトビルドには影響なし |
