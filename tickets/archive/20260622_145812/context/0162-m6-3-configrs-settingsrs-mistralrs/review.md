# レビュー報告書: M6-3 — config.rs + settings.rs 修正

## チェック結果サマリ

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| コンパイル検証 | ✅ | `cargo check`: 警告0 |
| config tests 85/85 | ✅ | 全テスト通過（2削除、6新規） |
| 全テスト 188/188 | ✅ | 後方互換性維持 |
| 静的品質チェック | ✅ | 95件の issue は全件がテストコード内 unwrap または既存の pre-existing issue |
| 翻訳可能性 | ✅ | DirectML/chat_template/mistralrs_feature 残存: 0件 |
| 波及修正 | ✅ | config.rs 変更に伴う registry.rs/lib.rs の chat_template 除去を完了 |
| `DEFAULT_CONTEXT_SIZE` | ✅ | 2048 に変更確認 |
| `feature_name()` / `cmake_flags()` | ✅ | 正しいシグネチャで追加済み |

## Acceptance Criteria 充足状況

- [x] `GpuProvider` が4バリアント（Auto/Metal/Cuda/Cpu）で動作する
- [x] `from_str("directml")` が `None` を返す（バリアント削除により暗黙的に成立）
- [x] `feature_name()` が正しい値を返す
- [x] `cmake_flags()` が正しい値を返す
- [x] `ModelConfig` に `chat_template` フィールドが存在しない
- [x] `DEFAULT_CONTEXT_SIZE` が 2048
- [x] 全テストスイート通過（188/188）

## 特記事項

- config.rs 変更が registry.rs/lib.rs に波及したため、同チケット内で `chat_template` 除去も実施した（M6-4 の先行作業を一部含む）。
