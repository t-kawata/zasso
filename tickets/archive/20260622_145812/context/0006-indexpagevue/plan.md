# 実装計画 — チケット #6

## 要件
MainLayout.vue の円形コンテナ（__zasso-page-container）を IndexPage.vue に移動。
クラス名を __zasso-index-container / __zasso-index-container-off に変更。
デザイン・寸法・アニメーションは一切変更しない。

## 変更ファイル一覧
| ファイル | 内容 |
|---|---|
| IndexPage.vue | 円形テンプレート＋ロジックを移植 |
| MainLayout.vue | 円形ブロック＋スクリプトを削除 |
| app.scss | &-page-container → &-index-container に改名・独立 |

## 実装手順
1. IndexPage.vue にテンプレート＋スクリプトを移植
2. MainLayout.vue から円形ブロック＋不要 import を削除
3. app.scss でクラス名を改名
4. ビルド確認＋旧クラス名 grep

## テスト計画
- pnpm quasar build
- grep で旧クラス名の残存確認
- make run で目視確認

## 物理的レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
