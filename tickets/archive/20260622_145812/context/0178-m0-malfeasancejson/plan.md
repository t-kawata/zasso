# M0 (#178) 実装計画（/plan-ticket にて承認済み）

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `.claude/scripts/tickets/malfeasance-schema.json` | 新規 | JSON Schema (draft-07) 定義 |
| `.claude/scripts/lib/validate-malfeasance.js` | 新規 | スキーマ検証ユーティリティ（標準 Node.js のみ） |
| `.claude/scripts/tickets/malfeasance-create.js` | 新規 | 新規犯罪レコード作成 |
| `.claude/scripts/tickets/malfeasance-get.js` | 新規 | ID 指定でレコード取得 |
| `.claude/scripts/tickets/malfeasance-search.js` | 新規 | 条件検索 |
| `.claude/scripts/tickets/malfeasance-all.js` | 新規 | 全件取得（フィルタ付き） |
| `.claude/scripts/tickets/malfeasance-update.js` | 新規 | レコード更新 |
| `.claude/scripts/tickets/malfeasance-delete.js` | 新規 | レコード削除 |
| `.claude/scripts/tickets/tests/malfeasance/test-malfeasance.js` | 新規 | 全操作スクリプトのテスト |
| `.claude/scripts/tickets/README.md` | 修正 | Malfeasance 操作スクリプト群を追記 |

## 実装手順
Phase 1: スキーマ定義 + 検証ユーティリティ
Phase 2: 操作スクリプト 6 本（all → get → search → create → update → delete）
Phase 3: テスト
Phase 4: README.md 更新

## レビュー方法
- テスト全件パス確認
- 翻訳可能性 grep（変数名がドメイン概念、関数名が動詞句）
- run-quality-checks.js での静的検査
