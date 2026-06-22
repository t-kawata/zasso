# レビュー報告書: M6-2 — error.rs 修正

## チェック結果サマリ

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| コンパイル検証 | ✅ | `cargo check`: 警告0 |
| error tests 16/16 | ✅ | 全テスト通過 |
| 全テスト 188/188 | ✅ | 既存テストに影響なし |
| 静的品質チェック | ✅ | 24件の unwrap は全テストコード内 — 許容範囲 |
| 翻訳可能性 | ✅ | 旧バリアント名 `MistralrsError`: 0件、デバッグ出力なし |
| `[::STUB::]` 評価 | ✅ | 全10件に解決チケットID明記（M6-11: 6件, M6-6: 4件）— 保留妥当 |
| 構造整合性 | ⚠️ | 既存 issue のみ（本チケット起因なし） |

## Acceptance Criteria 充足状況

- [x] `MistralrsError` → `LlamaCppError` 名称変更
- [x] `#[error("llama-cpp エラー: {0}")]` に変更
- [x] doc コメントを llama-cpp 用に更新
- [x] `[::STUB::]` マーカーで M6-11 での `#[from]` 差し替え予定を明記
- [x] `router.rs` のパターンマッチ + テスト更新
- [x] error.rs 全16テスト通過
- [x] 全テストスイート通過（188/188）

## スタブ評価

全10件の `[::STUB::]` マーカー:
- **error.rs / router.rs の6件**: M6-11 で `#[from] mistralrs::error::Error` → `#[from] llama_cpp_2::LlamaCppError` に差し替え — 保留妥当
- **generate.rs の4件**: M6-6 でファイルごと全削除 — 保留妥当
