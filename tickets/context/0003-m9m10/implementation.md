# 実装サマリ: 不足テストの追加（m#9/m#10）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/anthropx/tests/mock_server.rs` | 修正 | 4テスト追加 + `make_mock_config` 拡張 |
| `crates/anthropx/src/provider/translate.rs` | 修正 | モデル名上書き（生産コードバグ修正） |

## 実装内容

### 1. `make_mock_config` の拡張（`tests/mock_server.rs`）
- `api_keys: Vec<&str>` パラメータを追加（従来は `vec!["test-key"]` 固定）
- 既存3呼出元を `vec!["test-key"]` で更新

### 2. AC#3: `translate_non_stream_response_format` テスト追加
- mock upstream が OpenAI Chat Completions 形式の応答を返し、
  translate モードで Anthropic 互換形式（type, content, role）に変換されることを検証
- 変換パイプラインのバグを発見・修正:
  - body の model 名が "provider/model" 形式で llm-bridge-core の `validate_model_name` が '/' を拒否
  - `translate_non_stream` と `translate_stream` で変換前に `resolved.upstream` に model を差し替え

### 3. AC#4: `translate_stream_proxies_via_openai_wire` テスト追加
- SSE ストリーム中継の統合テスト
- Content-Type と content_block_delta の存在を検証

### 4. AC#5: `non_stream_key_failover_recovers_from_503` テスト追加
- AtomicUsize で1回目503→2回目200を確認
- failover 発火を attempt==2 で検証

### 5. AC#6: `stream_no_failover_returns_error` テスト本実化
- 常に503のmock upstream、2 key、stream=true
- failover 非発火 + 5xx サーバーエラーを確認

## 検証結果
- `cargo test`: 186 unit tests + 17 integration tests + 1 doc-test → 全通過
- 既存テストに回帰なし
- quality checks: 1文字変数(`n`→`attempt_count`)を修正
