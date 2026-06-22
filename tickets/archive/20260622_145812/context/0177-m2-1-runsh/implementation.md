# 実装サマリー: #177 M2-1 run.sh — サーバー・プロキシ起動スクリプト

## 変更ファイル一覧

| ファイル | 種別 | 規模 | 内容 |
|---------|------|------|------|
| mycc/run.sh | NEW | 196行 | メイン起動スクリプト（MTPLX → Proxy 起動、readiness ポーリング、trap cleanup） |
| mycc/tests/test-run.sh | NEW | 475行 | ユニットテスト（17 テストケース、全モックベース） |

## 実装内容

### run.sh の関数構成

| 関数 | 責務 |
|------|------|
| `cleanup()` | バックグラウンドプロセス（MTPLX / Proxy）を kill + wait、CLEANUP_DONE フラグで二重実行防止 |
| `check_port()` | lsof -i :port で LISTEN 確認、占有時エラー終了＋ポート変更提案 |
| `detect_serve_cmd()` | mtplx serve / lightning-mlx serve を動的検出、フォールバック付き |

### run.sh の制御フロー

1. パス解決 (SCRIPT_DIR / PROJECT_ROOT)
2. .env 読込（set -a; source .env; set +a）
3. デフォルト値解決 (MTPLX_PORT, PROXY_PORT, MODEL_DIR)
4. trap cleanup SIGINT SIGTERM EXIT
5. ポート空き確認 (check_port × 2)
6. モデル存在確認 (config.json)
7. MTPLX 起動（background）+ readiness ポーリング（120s, 2s 間隔, MTPLX_TIMEOUT 環境変数で上書き可能）
8. Proxy 起動（background）+ readiness ポーリング（30s, 1s 間隔, PROXY_TIMEOUT 環境変数で上書き可能）
9. 起動完了表示（OpenAI / Anthropic / Claude Code / test.js エンドポイント）
10. wait（フォアグラウンド待機）

### テスト構成（17 ケース）

| カテゴリ | ケース数 | テスト内容 |
|---------|---------|-----------|
| check_port | 2 | 空きポート通過、占有ポート検出 |
| detect_serve_cmd | 3 | mtplx 検出、lightning-mlx フォールバック、コマンド不在 |
| cleanup | 2 | 両プロセス停止、PID 未設定 |
| .env 読込 | 2 | 不在時エラー、存在時正常 |
| モデル確認 | 2 | ディレクトリ不在、config.json 不在 |
| MTPLX readiness | 2 | 正常起動、タイムアウト |
| Proxy readiness | 2 | 正常起動、タイムアウト |
| 統合 | 2 | 正常起動完了、完了表示の全エンドポイント確認 |

### モック設計（7 種類）

lsof, curl, kill, wait, mtplx, lightning-mlx, uv — 全てテンポラリディレクトリのモックバイナリで代替。

### 発見・修正された問題

1. **bash 3.2（macOS 標準）の set -u バグ**: echo 文内で全角括弧 `（` `）` と `$PROXY_PORT` を併用すると、変数がバインド済みでも unbound variable エラーが発生。全角括弧を半角 `(` `)` に変更して回避。
2. **デフォルト定数の環境変数上書き**: テスト容易性のため MTPLX_TIMEOUT / PROXY_TIMEOUT を環境変数で上書き可能に変更（元の RFC コードはハードコード）。

## 検証結果

- run.sh ユニットテスト: 17/17 パス
- 既存 common.sh テスト: 35/35 パス
- 既存 setup.sh テスト: 16/16 パス
- 品質チェッカー: 0 issues
- 実行権限: chmod +x 確認済み
