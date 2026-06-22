# 実装サマリ — チケット #7

## 変更したファイルと内容

| ファイル | 変更内容 |
|---|---|
| fe/src/pages/DummyAppPage.vue | 新規作成 — プレースホルダページ |
| fe/src/router/routes.ts | MainLayout の子に /app → DummyAppPage ルートを追加 |
| fe/src/components/TitleBar.vue | useRouter を import + router.push('/') と router.push('/app') を開閉シーケンスに追加 |

## タイミング

開く: win.setSize → setIsWindowExpanded(true) → sleep(300ms、丸フェードアウト待ち) → router.push('/app')
閉じる: setIsWindowExpanded(false) → sleep(300ms、タイトルバー縮小+丸フェード遅延待ち) → router.push('/') → win.setSize(COLLAPSED)

## 検証結果
- pnpm quasar build: ✅ 成功
- run-quality-checks: ✅ 0 issues
- 翻訳可能性 grep: ✅ 問題なし
