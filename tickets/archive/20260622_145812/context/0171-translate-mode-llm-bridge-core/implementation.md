# 実装サマリ: Translate mode 本実装 — llm-bridge-core 変換

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/anthropx/src/provider/translate.rs` | 改修 | `handle_translate()` 本実装 + `From<TransformError>` + 内部関数 |
| `crates/anthropx/src/routing/mod.rs` | 追加 | `to_llm_api_format()` 変換関数 |
| `crates/anthropx/src/http/routes.rs` | 修正 | `resolved` 引数追加 + スタブフォールバック削除 |
| `crates/anthropx/src/http/router.rs` | 修正 | テスト fixutre 更新（mock upstream 対応） |

## 実装の詳細

### translate.rs
- `handle_translate()` に `resolved: &ResolvedModel` 引数を追加し、non-stream / stream で分岐
- `translate_non_stream()`: 3段変換（Anthropic→OpenAI → upstream POST → OpenAI→Anthropic）
- `translate_stream()`: SSE ストリーム変換（Anthropic→OpenAI → upstream SSE → transform_stream）
- `collect_and_transform_stream()`: 全チャンク収集後、`transform_stream()` で Anthropic SSE に変換
- `From<TransformError> for ProxyError`: 全6 variant を明示的マッピング
- Lossy ハンドリング: `should_reject()` 判定 + allow_lossy/error_lossy_continue 設定統合
- OpenAiWireApi 分岐: ChatCompletions / Responses / Auto

### routing/mod.rs
- `to_llm_api_format()` 追加: ローカル `ApiFormat` → `llm_bridge_core::model::ApiFormat`

### routes.rs / router.rs
- 呼び出し元で `resolved` 引数を追加
- スタブフォールバック（`or_else`）を削除
- テスト用 AppState に mock upstream サーバーを追加

## 解決したスタブ
- `translate.rs:4`: `[::STUB::] 実際の API 呼び出しは M3-5 以降で実装。` — ✅ 本実装に置き換え（マーカー除去）
- `translate.rs:19`: `[::STUB::] llm-bridge-core API の探索後に実装する。` — ✅ 本実装に置き換え（マーカー除去）

## テスト結果
- 153 lib tests: all passed
- 0 warnings on compile
- 0 unwrap/expect in production code
- 品質チェック: 47 issues（全て既存コードのテストコード内 unwrap/expect または routing/mod.rs の標準パターン）
