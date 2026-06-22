# 計画: チケット #68 — M4-2 ユーティリティ（PjOwnedStr）

## 要件

PjStrRaw（pj_str_t モック）を内部に持つ PjOwnedStr を実装する。FFI バインディングは未生成のため、
#[repr(C)] のモック型で代替し、M17-2 で差し替える。SecretString 検証は M3-2（#66）で完了済み。

参照: RFC §27.2「C string 管理」、§35「セキュリティ」

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/util/pj_str.rs | 新規 | PjStrRaw + PjOwnedStr + 10 tests |
| crates/siprs/src/util/mod.rs | 修正 | pub mod pj_str; + pub use PjOwnedStr |

## Boy Scout 改善

util/mod.rs のモジュール宣言にコメントを追加し、各モジュールの責務を明示する。

## 実装手順

1. src/util/pj_str.rs 作成 — 構造体定義、全トレイト実装、10 tests
2. src/util/mod.rs 修正 — pub mod + pub use + コメント改善
3. make check-be でビルド確認
4. make test で全テストPASS確認（172 tests）

## レビュー方法

- run-quality-checks.js on pj_str.rs + mod.rs
- 翻訳可能性 grep（関数名、変数名、魔法数）
- テスト全PASS確認
