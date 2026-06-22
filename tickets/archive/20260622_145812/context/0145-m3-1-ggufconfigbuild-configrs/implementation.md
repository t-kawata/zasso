# 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/config.rs` | 変更 | 4つの新規メソッド + テスト28ケース + `::STUB::`除去 + `#[allow(dead_code)]`除去 |

## 実装内容

### 追加したメソッド

1. **`GgufConfig::from_json_str(json, base) -> Result<Self>`** — JSON文字列をパースし、ベース設定にマージ
2. **`GgufConfig::from_file(path, base) -> Result<Self>`** — ファイル読み取り + JSONパース + マージ
3. **`GgufConfig::build(code, json, file) -> Result<Self>`** — 3層マージエントリポイント
4. **`GgufConfig::merge(layers) -> Result<Self>`** — ConfigLayer 配列の動的マージ

### 解決したSTUB（2箇所）
- `config.rs:5` — モジュールドキュメントの `[::STUB::]` 削除
- `config.rs:318` — `merge_overlay()` ドキュメントの `[::STUB::]` 削除 + `#[allow(dead_code)]` 除去

### テスト（28ケース追加）
- `from_json_str`: 6 tests (正常系4 + 異常系2)
- `from_file`: 3 tests (正常系1 + 異常系2)
- `build`: 5 tests (正常系4 + 異常系1)
- `merge`: 8 tests (正常系6 + 異常系2)

### 既存コードへの影響
- 外部API変更なし
- `merge_overlay()` の `#[allow(dead_code)]` 除去（既存テストで使用中のため影響なし）
- `impl Default` が既存の GpuConfig と ServerConfig はそのまま維持

## 検証結果
- `cargo test --lib`: 125 passed, 0 failed
- `cargo check --lib`: 警告0
