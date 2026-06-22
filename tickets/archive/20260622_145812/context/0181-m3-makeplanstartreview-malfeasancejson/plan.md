# M3 (#181) 実装計画（/plan-ticket にて承認済み）

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| scripts/tickets/scan-crimes.sh | 新規 | 犯罪スキャン共通ラッパー（不在時初期化→スキャン） |
| commands/make-ticket.md | 修正 | 犯罪点検コードブロックを scan-crimes.sh に統一 |
| commands/plan-ticket.md | 修正 | 同上 |
| commands/start-ticket.md | 修正 | 犯罪解決コードブロックを scan-crimes.sh に統一 |
| commands/review-ticket.md | 修正 | 同上 |

## 実装手順
1. scan-crimes.sh 作成（_R 解決 + 不在時初期化 + スキャン）
2. 4 コマンドファイルのコードブロックを scan-crimes.sh に統一
3. Malfeasance 全テスト実行
4. 呼び出し形式の統一性確認

## レビュー方法
- Malfeasance.json 不在時・既存時の scan-crimes.sh 動作確認
- 全 Malfeasance テスト通過
- 4 ファイル間の呼び出し形式統一確認
