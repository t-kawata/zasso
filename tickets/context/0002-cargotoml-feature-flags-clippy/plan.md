# 実装計画: Cargo.toml feature flags 最終調整 + clippy + ドキュメント

## 要件
Cargo.toml feature flags 定義確認、rustdoc 警告修正、[::STUB::] マーカー除去、品質チェック通過

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/registry.rs:2 | 修正 | rustdoc: `RwLock<Vec<ModelInfo>>` にバッククォート追加 |
| src/registry.rs:47 | 修正 | rustdoc: `Arc<LlamaModel>` にバッククォート追加 |
| src/consts/settings.rs:19 | 修正 | [::STUB::] マーカー削除（コメント本文は維持） |
| src/consts/mod.rs:11-23 | 修正 | 未使用の allow(unused_imports) + 対応する未使用 re-export 行を削除 |

## Boy Scout 改善
- consts/mod.rs: 未使用 re-export（DEFAULT_CONTEXT_SIZE, DEFAULT_MODEL_DIR, CURL_TIMEOUT_SECS）3行と対応する #[allow(unused_imports)] を削除

## 実装手順
1. registry.rs — rustdoc 警告2件修正
2. settings.rs — [::STUB::] マーカー除去
3. consts/mod.rs — 未使用 re-export 削除
4. clippy検証（--all-features + --features=cpu）
5. テスト検証（cargo test）
6. doc検証（cargo doc --no-deps）

## テスト計画
| # | 検証内容 | コマンド | 期待 |
|---|---------|---------|------|
| 1 | clippy全feature | cargo clippy --all-features -- -D warnings | 0 warnings |
| 2 | clippy cpu | cargo clippy --features=cpu -- -D warnings | 0 warnings |
| 3 | 全テスト | cargo test | 189 passed |
| 4 | ドキュメント | cargo doc --no-deps | 0 warnings |

## リスク
- なし（コメント行・未使用行のみの変更）
