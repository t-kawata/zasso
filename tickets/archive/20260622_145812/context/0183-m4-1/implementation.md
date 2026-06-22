# 実装サマリー: #183 M4-1 全スクリプト連携テストと障害モード検証

## 変更ファイル一覧

| ファイル | 種別 | 規模 | 内容 |
|---------|------|------|------|
| mycc/tests/test-e2e.sh | NEW | 250行 | 統合テストスクリプト（6+2テストケース、--skip-heavy対応） |
| mycc/run.sh | MODIFIED | +3行 | check_port で lsof をフルパス(/usr/sbin/lsof)で呼び出すよう修正、全角括弧→半角 |
| mycc/tests/test-run.sh | MODIFIED | +1行 | CHECK_PORT_FUNC を run.sh と同期 |

## 検出・修正された不具合

| # | 問題 | 原因 | 修正 |
|---|------|------|------|
| 1 | `lsof` が PATH 解決時に LISTEN 状態を検出できない | macOS Sequoia 以降のサンドボックス制限 | `/usr/sbin/lsof` のフルパス指定に変更 |
| 2 | bash 3.2 で `${service_name}_PORT` が unbound variable | 変数展開 + UTF-8 文字併用時のパース不具合 | `local env_var` で中間変数化＋全角括弧を半角化 |

## テスト結果（軽量モード --skip-heavy）

| # | テスト | 結果 |
|---|--------|------|
| 1 | 障害#4 ポート占有 → run.sh エラー終了 | ✅ |
| 2 | 障害#5 モデル不在 → run.sh エラー終了 | ✅ |
| 3 | 障害#7 MTPLX 未起動 → test.js Stage 1 失敗 | ✅ |
| 4 | 障害#9 コマンド検出失敗 → run.sh エラー終了 | ✅ |
| 5 | test.js --fail-fast 早期停止 | ✅ |
| 6 | setup.sh 冪等性（2回実行） | ✅ |

## 回帰検証

| テストスイート | 結果 |
|--------------|------|
| test-common.sh | ✅ 35/35 |
| test-doctor.sh | ✅ 26/26 |
| test-run.sh | ✅ 12/12 |
| test-test.js | ✅ 14/14 |
| test-e2e.sh (skip-heavy) | ✅ 6/6 |
| **合計** | **93/93** |

## 未解決（手動検証が必要な項目）

| 項目 | 理由 |
|------|------|
| E2E 正常系（setup.sh→run.sh→test.js） | MTPLX + 27B モデルが必要 |
| 障害#1 非 Apple Silicon | Intel Mac または VM が必要 |
| 障害#6 MTPLX readiness タイムアウト | 実 MTPLX 起動が必要 |
| 障害#8 Proxy 変換不良 | Proxy 設定変更が必要 |
| Ctrl+C シャットダウン | 対話的操作が必要 |
| ドキュメント検証（Appendix） | 実機確認が必要 |
