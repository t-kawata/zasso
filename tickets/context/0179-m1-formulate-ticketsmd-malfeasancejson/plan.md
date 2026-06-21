# M1 (#179) 実装計画（/plan-ticket にて承認済み）

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `.claude/scripts/tickets/ensure-malfeasance.js` | 新規 | Malfeasance.json 初期化スクリプト |
| `.claude/commands/formulate-tickets.md` | 修正 | Step 0 直後に ensure-malfeasance.js 呼び出し追加 |
| `.claude/scripts/tickets/README.md` | 修正 | ensure-malfeasance.js 追記 |
| `tests/malfeasance/test-malfeasance.js` | 修正 | ensure-malfeasance 用テストケース追加 |

## 実装手順
Phase 1: ensure-malfeasance.js 作成
Phase 2: formulate-tickets.md 修正
Phase 3: テスト追加
Phase 4: README.md 更新

## レビュー方法
- テスト全件パス確認
- formulate-tickets.md 該当セクション目視確認
- run-quality-checks.js 検査
