---
ticket_id: 21
title: スラッシュコマンドのstatus更新信頼性改善
slug: status-reliability
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# スラッシュコマンドのstatus更新信頼性改善

## Summary

各コマンドの .md ファイルにおいて、status 更新（`update-ticket.js`）をユーザー確認・承認待ちのステップより前に移動する。自動ループ（conver.js）で status が未確定のまま次工程に進む問題を解決する。

## Background

plan-ticket 完了後も status が `made` のままになる問題が確認されている。原因は .md ファイル内の status 更新が「承認待ち」や「ユーザー確認」の**後**に配置されているため、Claude Code が承認待ちで停止すると status 更新に到達しないことにある。

## Scope

1. `make-ticket.md`: Step 10（status→made）を Step 9（ユーザー確認）より前に移動
2. `plan-ticket.md`: ステータス更新（→planned）を Step 6（承認待ち）より前に移動。承認待ちは「次に可能なアクション」案内に変更
3. `start-ticket.md`: 現状維持（Step 12 が既に最後）
4. `review-ticket.md`: 現状維持（status更新が既に最後）

## Non-scope

- コマンドの停止動作自体は変更しない
- 案内メッセージは維持する
- runner.ts 等のコードは変更しない

## Investigation

### 修正対象ファイル

| ファイル | 修正内容 |
|---------|---------|
| `make-ticket.md` | status更新をユーザー確認より前に移動（新規作成・深掘りの両方） |
| `plan-ticket.md` | status更新を承認待ちより前に移動。承認待ちを案内表示に変更 |

### 修正後の流れ（plan-ticket.md の例）

```
Step 5: 計画策定
↓
#### ステータス更新 ← 承認前に確定
echo '{"status":"planned"}' | update-ticket.js
↓
Step 6: 次に可能なアクション（案内のみ）
以下のコマンドを実行して実装を開始できます: /start-ticket $ARGUMENTS
↓
Step 7: 計画の保存（情報の永続化）
```

## Test Plan

- `make test-conver` 全 PASS
- 各 .md の修正は手動確認

## Acceptance Criteria

- [ ] make-ticket 完了後、status が `made` に更新されてから停止する
- [ ] plan-ticket 完了後、status が `planned` に更新されてから停止する
- [ ] start/review は現状維持で動作
- [ ] `make test-conver` 全 PASS
- [ ] 犯罪なし

## Notes

- 影響範囲: `make-ticket.md`, `plan-ticket.md`
- .md のステップ順序変更のみ。コード変更なし
