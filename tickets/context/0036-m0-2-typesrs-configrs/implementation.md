# 実装サマリー: M0-2 公開型定義

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/types.rs` | 新規 | 12型定義（SttEvent, SttEngine, LocaleCode + 3メソッド, OpenAiConfig, VadModelPaths, VadConfig, VadType, PostCorrectionConfig, DenoiserConfig, SignalFilterConfig）＋ 18テスト |
| `src/config.rs` | 新規 | VoiceKitConfig + VoiceKitConfigBuilder（ビルダーパターン、3バリデーションルール）＋ 10テスト |
| `src/error.rs` | 変更 | インライン SttEngine 削除 → use crate::types::SttEngine、テスト1件削除 |
| `src/lib.rs` | 変更 | mod types/config 有効化、pub use 追加、doc-test 復帰 |
| `src/bin/test-run.rs` | 変更 | test_config() 追加（5ケース）、Stage 2/6 更新 |

## 検証結果

- cargo check: ✅ 通過（dead_code 警告のみ）
- cargo test: ✅ 34/34 PASS（既存7 + types.rs 18 + config.rs 10 - error.rs 1削除）
- cargo run --bin test-run: ✅ Stage 2/6 + [CONFIG] 正常系・異常系デモ表示
- cargo fmt: ✅ 整形済み

## 特記事項

- SttEngine の情報源が error.rs から types.rs に統一された（M0-1 の TODO 解決）
- doc-test がコンパイル可能になった（lib.rs の例示コードが rust,no_run でPASS）
- OpenAiConfig, VadModelPaths 等の設定型の Default impl は提供しない（RFC のビルダーパターン経由での作成を想定）
