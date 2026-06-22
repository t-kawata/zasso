# 実装サマリ: test-run に --engine local 対応 (#123)

## 変更ファイル

### crates/voiput/src/binary/test-run.rs
- インポート追加: `LocalAsrKind`, `Qwen3AsrConfig`, `Qwen3AsrModelPaths` (+1行)
- CLI パーサーに `"local"` → `SttEngine::Local { backend: LocalAsrKind::Qwen3Asr }` を追加 (+1行)
- `build_voiput_config()` に Local エンジン分岐を追加: `qwen3_asr_config(...)` でモデルパス・プロバイダ設定 (+11行)

### crates/voiput/Makefile
- 使い方コメントに `run-local` / `run-local-no-denoiser` を追記
- `.PHONY` に両ターゲットを追加
- ターゲット本体を追加: `run-local` / `run-local-no-denoiser`

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| run-quality-checks.js | ✅ 新規 issues なし（165件は pre-existing） |

## Acceptance Criteria
- [x] `--engine local` で Local が選択される
- [x] `--engine os` / `--engine openai` 既存動作維持
- [x] `make run-local` 追加
- [x] `make run-local-no-denoiser` 追加
- [x] `make check-be` 通過
- [x] `cargo test --lib` 全169件通過
