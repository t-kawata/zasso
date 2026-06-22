# 実装サマリー: #182 M3-1 test.js — 6段階検証スクリプト

## 変更ファイル一覧

| ファイル | 種別 | 規模 | 内容 |
|---------|------|------|------|
| mycc/test.js | NEW | 197行 | 6段階テストパイプライン（httpRequest / findProcess / printStage / summarize / main） |
| mycc/tests/test-test.js | NEW | 252行 | ユニットテスト（14 ケース、モック不使用） |

## 実装内容

### test.js の関数構成

| 関数/要素 | 責務 |
|-----------|------|
| Configuration | MTPLX_PORT, PROXY_PORT, MODEL_NAME, TIMEOUT を環境変数から解決 |
| httpRequest() | Promise ベース HTTP クライアント + タイムアウト + JSON パース |
| findMTPLXProcess() | pgrep -f "mtplx serve\|lightning-mlx serve" |
| findProxyProcess() | pgrep -f "uvicorn server:app" |
| printStage() | ✅/❌ 整形出力 |
| summarize() | 集計表示 + exit(0)/exit(1) |
| main() | 6段階パイプライン + fail-fast |

### テストパイプライン（6 段階）

| Stage | 対象 | 操作 | 期待値 |
|-------|------|------|--------|
| 1 | MTPLX プロセス | findMTPLXProcess() | true |
| 2 | MTPLX /v1/models | GET → モデル名検証 | HTTP 200 + モデル名 |
| 3 | MTPLX /v1/chat/completions | POST 最小リクエスト | HTTP 200 + choices[0] |
| 4 | Proxy プロセス | findProxyProcess() | true |
| 5 | Proxy / | GET | HTTP 200 |
| 6 | Proxy /v1/messages | POST Anthropic 形式 | HTTP 200 + content |

### テスト構成（14 ケース、モック不使用）

| カテゴリ | ケース数 | テスト方法 |
|---------|---------|-----------|
| printStage | 2 | stdout キャプチャ |
| summarize | 1 | 制御フローテストで代用検証 |
| httpRequest | 3 | 実 HTTP サーバー起動 / 遅延サーバー / 接続拒否 |
| findProcess | 2 | 実 pgrep（不在ケース） |
| main 制御フロー | 4 | 子プロセス実行（サーバー不在 / fail-fast） |
| 環境変数 | 2 | カスタムポート / カスタムモデル名 |

### 外部依存

- require('http') — Node.js ビルトイン
- require('child_process') — Node.js ビルトイン

npm install 不要（Q16 厳守）。

## 検証結果

- test-test.js: 14/14 パス
- test.js 単体実行: 全6段階失敗 → exit 1（サーバー不在時に正しいエラーハンドリング）
- test.js --fail-fast: Stage 1 で停止（fail-fast 正しく動作）
- 既存全テスト回帰: 87/87 パス（common.sh 35 + doctor.sh 26 + setup.sh 14 + run.sh 12）
- 品質チェッカー: console.log 27件 — 全て test.js の出力用およびテストフレームワークの正当な使用
