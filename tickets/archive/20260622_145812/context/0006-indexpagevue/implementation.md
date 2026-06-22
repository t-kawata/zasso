# 実装サマリ — チケット #6

## 変更したファイルと内容

| ファイル | 変更内容 |
|---|---|
| fe/src/pages/IndexPage.vue | 円形コンテナのテンプレート（__zasso-index-container）+ ロジック（mainStore, logoWhiteSrc）を移植。旧 __zasso-page-container → __zasso-index-container に改名 |
| fe/src/layouts/MainLayout.vue | 円形コンテナブロック（q-spinner, img, クラスバインディング）と全スクリプトを削除。純粋なレイアウトシェル（q-layout → q-page-container → router-view）に |
| fe/src/css/app.scss | &-page-container（.‗zasso-page-container）を &-index-container（.__zasso-index-container）に改名し、&-page の兄弟として独立。&-page の width/height ベーススタイルは維持 |

## 検証結果
- pnpm quasar build: ✅ 成功
- 旧クラス名残存確認: ✅ コメント内1件のみ（コード参照ゼロ）
- run-quality-checks: ✅ 0 issues
- 翻訳可能性 grep: ✅ 問題なし
