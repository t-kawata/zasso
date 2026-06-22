# M4-1: BiMap<RuntimeId, NativeId> 実装サマリ

## 変更ファイル
- `crates/siprs/src/util/bimap.rs` — **新規** BiMap 構造体 + 全操作 + 14 テスト
- `crates/siprs/src/util/mod.rs` — `pub mod bimap;` 追加

## 追加内容

### BiMap<L, R> 構造体（`src/util/bimap.rs`）
- 2 つの `HashMap`（left_to_right / right_to_left）で双方向マッピング
- トレイト境界: `L: Hash + Eq + Clone`, `R: Hash + Eq + Clone`
- 独自 Debug 実装（ジェネリクスに Debug 不要）
- #[must_use] 付き insert

### 全操作（10 操作）
- `new()` / `insert()` / `get_right()` / `get_left()`
- `contains_left()` / `contains_right()`
- `remove_by_left()` / `remove_by_right()`
- `len()` / `is_empty()`

### テスト（14 tests）
1. `test_empty_bimap` — 空状態の全操作
2. `test_insert_and_get` — insert → get
3. `test_insert_replace_left` — left 衝突置換
4. `test_insert_replace_right` — right 衝突置換
5. `test_remove_by_left` — left 削除両方向
6. `test_remove_by_right` — right 削除両方向
7. `test_remove_nonexistent` — 不在キー → None
8. `test_get_nonexistent` — 不在キー get → None
9. `test_len_and_is_empty` — len 変動
10. `test_bimap_send_sync` — Send + Sync
11. `test_bimap_clone` — クローン独立
12. `test_bimap_debug` — Debug 出力
13. `test_bulk_insert_remove` — 1000 件連続操作
14. `test_bimap_insert_returns_old_pair_exact` — 戻り値正確性

## 検証結果
- `cargo test`: 162 passed, 0 failed, 0 warnings
- `run-quality-checks.js`: 0 issues
