# 実装サマリ — チケット #5

## 変更したファイルと内容

| ファイル | 種別 | 内容 |
|---|---|---|
| fe/src/components/TitleBar.vue | 新規作成 | タイトルバーのテンプレート（q-toggle + q-btn）と全ロジック（Tauri window APIによるサイズトグル）を抽出した独立コンポーネント |
| fe/src/App.vue | 修正 | `TitleBar` コンポーネントをimportし、`<router-view>` の前に配置 |
| fe/src/layouts/MainLayout.vue | 整理 | div.__zasso-title-barブロック（q-toggle/q-btn/インラインスタイル）を削除。不要になったTauri API importとonClickExpandToggleBtn関数を削除。ページコンテナ（スピナー・ロゴ・router-view）は維持 |
| fe/src/css/app.scss | 修正 | .__zasso-title-bar に `position: fixed; top: 0; left: 0; right: 0; z-index: 1000` を追加し、通常フローから切り離して常に画面上端に表示 |

## 検証結果
- pnpm quasar build: ✅ 成功
- make check (Rust): ✅ 成功
- 翻訳可能性 grep: ✅ 問題なし
- run-quality-checks: ✅ 0 issues
- data-tauri-drag-region: TitleBar.vue に正常に移行済み
- TitleBar 参照: App.vue のみが参照（正しい配置）

## アーキテクチャ変更
移動前: タイトルバーは MainLayout.vue 内の q-layout の一部
移動後: TitleBar.vue が App.vue から固定表示される。どのレイアウトを使っても常に表示される。
