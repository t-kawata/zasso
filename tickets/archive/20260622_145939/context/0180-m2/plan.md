# M2 (#180) 実装計画（/plan-ticket にて承認済み）

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| CLAUDE.md | 修正 | 「スタブポリシー」→「第一級規則」に全面改訂 |
| .claude/commands/make-ticket.md | 修正 | 先頭に第一級規則追加、スタブ点検セクション拡張 |
| .claude/commands/plan-ticket.md | 修正 | 同上 |
| .claude/commands/start-ticket.md | 修正 | 同上 |
| .claude/commands/review-ticket.md | 修正 | 同上 |

## 実装手順
1. CLAUDE.md: スタブポリシー全面置き換え
2. make-ticket.md: 先頭+スタブ点検
3. plan-ticket.md: 先頭+スタブ検証
4. start-ticket.md: 先頭+スタブ解決
5. review-ticket.md: 先頭+スタブ一覧
6. grep でキーワード存在確認

## レビュー方法
- grep キーワード確認（絶対的法規/第一級規則）
- 禁止表現の不在確認
