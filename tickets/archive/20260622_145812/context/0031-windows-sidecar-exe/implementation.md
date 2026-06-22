# 実装サマリ: Windows: sidecar テストが拡張子 .exe で失敗する問題の修正

## 変更ファイル
- `src-tauri/src/sidecar.rs` — 1ファイル、3箇所の修正

## 修正内容

### 1. expected_suffix を binary_filename() で生成（127行目）
```rust
// Before
let expected_suffix = format!("bifrost{}bifrost-http", std::path::MAIN_SEPARATOR);

// After
let expected_suffix = format!("bifrost{}{}", std::path::MAIN_SEPARATOR, binary_filename());
```

### 2. テストコメントの更新（111-112行目）
platform依存の拡張子が付くことを明記。

### 3. エラーメッセージの動的化（130-131行目）
`binary_filename()` の戻り値をエラーメッセージに含めることで、プラットフォームに関係なく正確な期待値を表示。

## 検証結果
- `cargo test --lib -- sidecar`: 7 tests passed (all sidecar tests)
- Quality checks: 0 issues
- フォーマット: cargo fmt 済み
