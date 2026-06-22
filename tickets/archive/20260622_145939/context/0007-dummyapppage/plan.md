# 実装計画 — チケット #7

## 要件
1. DummyAppPage.vue を作成
2. /app ルートを追加
3. 開閉ボタンにページ遷移を連携

## 変更ファイル
| ファイル | 内容 |
|---|---|
| DummyAppPage.vue | 新規プレースホルダ |
| routes.ts | /app ルート追加 |
| TitleBar.vue | useRouter + router.push 追加 |

## タイミング設計
開く: win.setSize → setIsWindowExpanded(true) → sleep(300) → router.push('/app')
閉じる: setIsWindowExpanded(false) → sleep(300) → router.push('/') + win.setSize(COLLAPSED)

## テスト計画
- pnpm quasar build
- 目視確認

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
