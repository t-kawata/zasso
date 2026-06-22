# 実装サマリ: M6-5 inference/mod.rs 修正 — InferenceEngine トレイト3メソッド化

## 変更したファイル

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `crates/ggufrs/src/inference/mod.rs` | MODIFY | 1ファイル、11箇所の外科的修正 |

## 実装内容

### 削除した項目

1. **`use mistralrs::{RequestBuilder, Response};` import 行削除** — mistralrs 依存の除去
2. **`GenerateParams::enable_thinking` フィールド + doc コメント削除** — llama-cpp-2 に相当機能なし
3. **`GenerateParams::default()` の `enable_thinking: None,` 削除**
4. **`InferenceEngine` トレイトの `send_raw()` メソッド定義 + doc コメント削除** — 4→3メソッド化
5. **`DummyEngine` の `send_raw()` 実装削除** — テスト用ダミー実装の整理
6. **`MockEngine` の `send_raw()` モック定義削除** — mockall モック定義の整理
7. **`mock_send_raw_exists` テスト削除** — send_raw 関連テストの削除
8. **`generate_params_enable_thinking_true` テスト削除** — enable_thinking 関連テストの削除
9. **`generate_params_default_uses_constants` の `enable_thinking` アサート行削除**

### 更新・追加した項目

10. **トレイト doc コメント更新**: 「4メソッドのうち3つが高レベルAPI、1つ（send_raw）が低レベルAPI」→「3メソッド全てが高レベルAPI」
11. **モジュール doc コメント更新**: 「mistralrs バックエンド」→「llama-cpp-2 バックエンド」
12. **`// pub mod raw;` コメント追加**: 将来の誤追加防止。`[::STUB::]` マーカー付き（M6-8 で削除予定）

### 検証結果

- `send_raw` が mod.rs 内で 0 件であることを確認 ✅
- `enable_thinking` が mod.rs 内で 0 件であることを確認 ✅
- `mistralrs` 参照がコメント行のみであることを確認 ✅
- 新たな `[::STUB::]` 未付与の不完全実装がないことを確認 ✅
- Malfeasance.json 未解決 0 件を確認 ✅
- `run-quality-checks.js` 通過（27件検出、全て変更前からの既存パターン）✅

### コンパイルステータス

本チケット変更後のクレート全体のコンパイルは通らない（`server/openai.rs` が `send_raw` 呼び出しでエラー）。これは許容範囲であり M6-9 で解消予定。
