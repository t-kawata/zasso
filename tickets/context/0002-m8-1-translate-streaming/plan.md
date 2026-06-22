# Plan: M8-1 — Translate streaming リアルタイム化

## 要件の再確認

translate stream の応答処理を全チャンク蓄積型から、チャンク単位の逐次変換＋即時送信（`mpsc::channel` + `tokio::spawn`）に改修する。TTFU を full response 完了時から最初のチャンク受信時に短縮する。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/provider/translate.rs` | 変更 | translate_stream 全面改修、transform_chunk 追加、collect_and_transform_stream 削除、import 追加、test 追加 |

## Boy Scout 改善（スコープ内）

1. **translate_stream の責務分割**: 翻訳不可能な長大関数（L285-384）を3段階に段階分割（リクエスト変換 / upstream 接続 / 応答変換＋中継）
2. **ハードコード値の定数化**: "text/event-stream", "no-cache", チャネルサイズ 64
3. **古いコメントの更新**: collect_and_transform_stream 削除に伴うコメント更新

## テスト計画

### ユニットテスト計画

1. **transform_chunk 正常系**:
   - OpenAI Chat delta chunk → Ok(Some(Bytes)) — 出力に content_block_delta を含む
   - 複数チャンク逐次投入 → 各チャンクが即時 ContentBlockDelta に変換
   - [DONE] 終端 → ContentBlockStop / MessageDelta / MessageStop を含む
   - 空行/keepalive → Ok(None)

2. **transform_chunk 異常系**:
   - 不正な SSE フォーマット → Err(ProxyError::UpstreamError(...))

3. **translate_stream アーキテクチャテスト**:
   - 戻り値型が Result<Response, ProxyError> であること（コンパイル時）
   - Send 制約を満たすこと

### 既存テストへの影響

全既存テストが改修後も通過すること。TransformError → ProxyError マッピングは変更なし。

## 実装手順

1. import 追加（llm_bridge_core::stream の transform_stream_events, events_to_sse）
2. sse_format 変換の共通化ヘルパー追加
3. transform_chunk 関数の追加
4. translate_stream の全面改修（mpsc::channel + tokio::spawn + 逐次変換）
5. collect_and_transform_stream の削除
6. 古いコメントの更新
7. unit test 追加（transform_chunk 向け 5ケース）
8. cargo check 通過確認
9. cargo test 通過確認
10. cargo clippy --all-targets -- -D warnings 通過確認

## 物理的レビュー方法

1. run-quality-checks.js でコード品質チェック
2. 翻訳可能性 grep（名詞始まり関数、1文字変数、ハードコード値）
3. make check-be でビルド検証
4. make test で全テスト通過確認

## リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| transform_stream_events が予期せずブロック | TTFU改善効果半減 | 同関数は同期的（IOなし）であることを確認済み |
| Body::from_stream と ReceiverStream の互換性 | コンパイルエラー | transparent.rs で既に使用実績あり |
| Infallible が Into<axom::Error> を満たさない | コンパイルエラー | フォールバック: Result<Bytes, axom::Error> で統一 |
