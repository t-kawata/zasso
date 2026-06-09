# 実装計画 — チケット #5

## 要件
タイトルバーを MainLayout.vue から App.vue に移動し、全レイアウト横断で表示されるようにする。デザイン・機能は変更しない。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| fe/src/components/TitleBar.vue | 新規作成 | タイトルバーテンプレート＋全ロジックを抽出 |
| fe/src/App.vue | 修正 | TitleBar を追加配置 |
| fe/src/layouts/MainLayout.vue | 修正 | タイトルバー部分を削除 |
| fe/src/css/app.scss | 修正 | `.__zasso-title-bar` に position: fixed を追加 |

## 実装手順
1. TitleBar.vue を作成（MainLayout からテンプレート＋スクリプトを移植）
2. App.vue に TitleBar を配置
3. MainLayout.vue からタイトルバー部分を削除
4. app.scss に fixed 配置スタイルを追加
5. ビルド検証

## テスト計画
- pnpm quasar build でフロントエンドビルド確認
- make check で Rust コンパイル確認
- make run で目視確認（タイトルバー表示、q-toggle、expandボタン、ドラッグ領域）

## 物理的レビュー方法
- 翻訳可能性 grep（1文字変数、ハードコード値、デバッグ出力）
- run-quality-checks.js による品質チェック
