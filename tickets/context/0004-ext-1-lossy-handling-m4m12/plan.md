# 実装計画: EXT-1 Lossy handling 完全対応

## 要件
`allow_lossy=true + error_lossy_continue=true` 時に Error 級 lossy が発生しても続行し、損失フィールドを metrics + tracing + span に記録する。llm-bridge-core 側の `anthropic_to_openai_lossy()` API 追加が前提。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/provider/translate.rs` | 改修 | lossy 処理全面改修。`handle_lossy_translation` 関数抽出、`record_lossy_event` 統合関数追加 |
| `src/provider/translate.rs` | テスト追加 | lossy-tolerant テストケース追加 |

## 実装手順

### Phase 1: 準備（llm-bridge-core API 待ちの間に実施可能）

1. `fn record_lossy_event` の追加: `record_lossy` + `tracing::warn!` + `Span::current().record` を統合
2. `fn handle_lossy_translation` の抽出: 現在の lossy ハンドリングを関数に抽出（既存動作維持）
3. `"content-type"` → `const CONTENT_TYPE_JSON` 定数化
4. テスト追加: `record_lossy_event` の単体テスト、既存動作維持テスト

### Phase 2: 本実装（llm-bridge-core API 利用可能後）

5. llm-bridge-core バージョンアップ
6. `handle_lossy_translation` を `anthropic_to_openai_lossy()` に切り替え
7. stream path lossy 対応
8. テスト追加（lossy_fields あり/なし/allow_lossy=false）

## テスト計画
- record_lossy_event: 空 fields / 1件 / 100件
- handle_lossy_translation: 正常 / 拒否(400) / エラー
- stream lossy: 続行 / 空 fields

## レビュー方法
1. make check-be
2. make test
3. 翻訳可能性 grep
4. cargo clippy --all-targets -- -D warnings
5. find-all-stubs.js
6. cargo build --no-default-features
