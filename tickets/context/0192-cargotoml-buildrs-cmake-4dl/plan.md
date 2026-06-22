# M6-11 実装計画

## 要件
llama-cpp-2 バックエンド移行のビルド基盤完成: 依存差し替え、cmake フラグ制御、MODEL_FILES GGUF 化、DEFAULT_SW_PORT 削除、Gemma4 パス更新、gbnf cfg ゲート解除。

## 変更ファイル一覧
| # | ファイル | 種別 | 内容 |
|---|---------|------|------|
| 1 | Cargo.toml | MODIFY | mistralrs/llm-bridge-core 削除、gbnf 追加、features 再編 |
| 2 | settings.rs | MODIFY | DEFAULT_SW_PORT 削除、テスト修正 |
| 3 | consts/mod.rs | MODIFY | DEFAULT_SW_PORT re-export 削除 |
| 4 | config.rs | MODIFY | Gemma4 model_path GGUF 更新、コメント更新 |
| 5 | build.rs | MODIFY | cmake フラグ制御追加、MODEL_FILES GGUF 差し替え |
| 6 | inference/generate.rs | MODIFY | gbnf cfg ゲート解除、スタブ解決 |

## 実装手順
1. settings.rs + mod.rs — DEFAULT_SW_PORT 削除
2. config.rs — Gemma4 モデルパス更新
3. Cargo.toml — 依存差し替え
4. build.rs — cmake + MODEL_FILES
5. inference/generate.rs — gbnf cfg ゲート解除

## テスト計画
- cargo check --all-targets（絶対条件）
- cargo test --lib
- cargo check --features metal
- cargo tree で依存確認

## 物理的レビュー
- run-quality-checks.js で全変更ファイルチェック
- 翻訳可能性 grep
