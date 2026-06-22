# M17-2: PjOwnedStr — pj_str_t wrapper — 実装計画

## 要件
M4-2 で util/pj_str.rs に仮実装した PjOwnedStr を ffi/strings.rs に移行し、
PjStrRaw::slen の型を isize → i32 に修正して PJSIP 2.17 ABI に準拠させる。
util/pj_str.rs は #[deprecated] エイリアスとして非推奨化する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/ffi/strings.rs | 新規 | PjOwnedStr + PjStrRaw(slen:i32) + 12テスト |
| src/ffi/mod.rs | 変更 | mod strings 追加、#[allow] スコープ調整 |
| src/util/pj_str.rs | 変更 | #[deprecated] エイリアス化 |
| src/util/mod.rs | 変更 | 再エクスポート元を ffi::strings に変更 |

## 実装手順
1. src/ffi/strings.rs 作成（PjStrRaw, PjOwnedStr, トレイト, テスト）
2. src/ffi/mod.rs 更新（#[allow] 移動, pub mod strings）
3. src/util/pj_str.rs 置き換え（#[deprecated] エイリアス）
4. src/util/mod.rs 更新（再エクスポート元変更）
5. make check-be
6. make test
7. cargo fmt

## レビュー方法
1. run-quality-checks.js
2. 翻訳可能性 grep
3. cargo fmt --check
## リスク
- isize→i32 変更によるアサーション影響なし（リテラル値 i32 範囲内）
- #[deprecated] による警告 → 現状参照なし
