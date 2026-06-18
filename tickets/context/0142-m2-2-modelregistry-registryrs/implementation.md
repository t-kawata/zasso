# 実装サマリ: M2-2 — ModelRegistry 非同期メソッド (registry.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/registry.rs` | **修正** | 3 async メソッド + テスト3件 + STUB解決 |

## 追加したメソッド

| メソッド | ロック戦略 | 戻り値 |
|---------|:----------:|--------|
| `get(&self, name)` | read→write 二段階 | `Result<Arc<Model>, GgufError>` |
| `load_immediate(&self)` | write | `Result<(), GgufError>` |
| `load_all(&self)` | write | `Result<(), GgufError>` |

## 検証結果

| 項目 | 結果 |
|------|------|
| `make check-ggufrs` | ✅ 0 warnings, 0 errors |
| `cargo test` | ✅ **93 passed** (+3), 0 failed |
| 品質チェック | ✅ 6 expect — RwLock poisoned で正当 |

## スタブ解決状況

- ✅ registry.rs M2-2 STUB → M3-2 に更新
- ⏳ 実際のモデルロードは M3-2

## 残課題

次は M2-3（GgufEngine::new() 実装）に進むこと。
