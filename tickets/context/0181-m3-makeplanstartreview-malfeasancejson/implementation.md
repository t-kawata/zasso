# M3 (#181) 実装サマリ

## 作成したファイル
| ファイル | 内容 |
|---------|------|
| scripts/tickets/scan-crimes.sh | 犯罪スキャン共通ラッパー（Malfeasance.json 不在時は ensure-malfeasance.js で初期化→スキャン） |

## 修正したファイル
| ファイル | 内容 |
|---------|------|
| commands/make-ticket.md | 「犯罪の点検」コードブロックを scan-crimes.sh に統一 |
| commands/plan-ticket.md | 同上 |
| commands/start-ticket.md | 「犯罪の緊急解決」コードブロックを scan-crimes.sh に統一 |
| commands/review-ticket.md | 同上 |
| scripts/tickets/README.md | scan-crimes.sh をカテゴリ一覧・詳細ドキュメントに追加 |

## 特記事項
- M2 (#180) とスコープが重複していたため、実質的な追加は scan-crimes.sh とコードブロック統一に絞った
- **scan-crimes.sh 検証**: Malfeasance.json 不在時（初期化→スキャン）/ 既存時（スキップ→スキャン）の両方で動作確認済み
- **全テスト通過**: 41/41 passed
- **統一性確認**: 全 4 コマンドファイルで scan-crimes.sh 呼び出しに統一。malfeasance-all.js の直接呼び出しは 0。
- **依存充足**: M0 (#178) = done, M2 (#180) = done
