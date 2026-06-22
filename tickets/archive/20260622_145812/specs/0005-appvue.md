---
ticket_id: 5
title: タイトルバーを App.vue に移動し、全レイアウトで表示可能にする
slug: appvue
status: done
created_at: 2026-06-09
updated_at: 2026-06-09
plan_path: /Users/kawata/shyme/zasso/tickets/context/0005-appvue/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0005-appvue/implementation.md
---
# タイトルバーを App.vue に移動し、全レイアウトで表示可能にする

## Summary

現在 `fe/src/layouts/MainLayout.vue` に直接記述されているタイトルバー（`__zasso-title-bar`）を `fe/src/App.vue` に移動する。これにより、ルーターで別のレイアウトを使った場合でもタイトルバーが常に表示されるようになる。デザイン・機能は完全に維持する。

## Background

- 現在ルート `/` は `MainLayout.vue` を使用しており、その中にタイトルバーが直書きされている
- ルートにしか `MainLayout` を使用していないため問題は顕在化していないが、将来的に別レイアウトを使う場合にタイトルバーが消滅する
- `App.vue` はルートコンポーネントであり、常に存在するため全レイアウト横断でタイトルバーを表示する理想的な場所である
- タイトルバーは Tauri の `data-tauri-drag-region` 属性を持ちウィンドウのドラッグ移動に寄与する — どの画面でも使用できて当然の機能

## Scope

1. `fe/src/components/TitleBar.vue` の新規作成（タイトルバーのテンプレート＋ロジックを抽出）
2. `fe/src/App.vue` への TitleBar コンポーネントの配置（``<router-view>`` より前）
3. `fe/src/layouts/MainLayout.vue` からのタイトルバー部分の削除
4. `fe/src/css/app.scss` へのタイトルバーの固定配置スタイルの追加
5. ビルド確認と動作検証

## Non-scope

- ページコンテナ（スピナー、ロゴ等）の移動 — レイアウト固有のため MainLayout に残す
- `main-store.ts` の変更 — 既存ストアをそのまま利用
- Layout 以外の新規コンポーネント作成（TitleBar は唯一の新規コンポーネント）

## Investigation

### 現状のアーキテクチャ

**ファイル構成**:
```
fe/src/App.vue                     # ルート: <router-view class="__zasso-layout" /> のみ
fe/src/layouts/MainLayout.vue      # タイトルバー + ページコンテナ（スピナー・ロゴ・router-view）
fe/src/components/                  # 空（タイトルバー用コンポーネントなし）
fe/src/router/routes.ts            # ルート: / → MainLayout → IndexPage
fe/src/css/app.scss                 # 全スタイル定義
fe/src/stores/main-store.ts        # isVoiceActive, isWindowExpanded, toggleExpanded()
```

**タイトルバーの実体**（`fe/src/layouts/MainLayout.vue:3-26`）:
- `<div data-tauri-drag-region class="__zasso-title-bar">` — Tauri のドラッグ領域
  - `<q-toggle v-model="mainStore.isVoiceActive">` — 音声アクティブ切替
  - `<q-btn @click="onClickExpandToggleBtn" icon="smartphone">` — ウィンドウサイズ切替

**タイトルバーのロジック**（`fe/src/layouts/MainLayout.vue:109-138`）:
- `useMainStore()` から `isVoiceActive`, `isWindowExpanded` を参照
- `onClickExpandToggleBtn` で Tauri `getCurrentWindow().setSize()` を呼び出し
- 依存: `@tauri-apps/api/window`, `@tauri-apps/api/dpi`, `src/configs/settings`（4つのWINDOW_*定数）

**CSS**（`fe/src/css/app.scss:10-24`）:
```scss
.__zasso-title-bar {
    width: calc(100dvw - 30px);
    height: 30px;
    margin: 0 auto;
    background: linear-gradient(90deg, rgba(151,224,233,0.8) 0%, rgba(193,164,248,0.8) 33%, rgba(240,153,195,0.8) 66%, rgba(236,237,135,0.8) 100%);
    border-radius: 15px;
    cursor: pointer;
}
```
- 要素は通常フロー（ブロック）で配置。親の `q-layout` の中で上端に位置

**MainLayout の構造:**
```
<q-layout>
  <div class="__zasso-title-bar">   ← 通常フロー、高さ30px
  <q-page-container class="__zasso-page-container"> ← position: absolute; bottom: 15px
    <router-view />
```

**App.vue の現在の構造:**
```
<router-view class="__zasso-layout" />
  ← __zasso-layout: height: 100dvh; position: relative
```

### 移動に伴う課題

**課題1: レイアウトの高さ計算**
App.vue に title-bar（30px 通常フロー）を置き、その後に `<router-view class="__zasso-layout">`（100dvh）を置くと、合計 100dvh + 30px となりビューポートをはみ出す。

**解決: `position: fixed` で固定配置**
タイトルバーを `position: fixed; top: 0; z-index: 1000` に変更。これにより：
- 通常フローから外れ、重なりを気にせず常に上端に表示
- ページコンテナ（130px 円形、`bottom: 15px`）とは重ならない
- `data-tauri-drag-region` は fixed 要素でも正常動作
- グラデーション背景が半透明のため、fixed で浮いても問題なし

**課題2: 水平方向のセンタリング**
`position: fixed; left: 0; right: 0; margin: 0 auto; width: calc(100dvw - 30px);` で固定配置した要素のセンタリングが可能。

**課題3: テンプレートの重複排除**
タイトルバーを新規コンポーネント `TitleBar.vue` として抽出し、`App.vue` で読み込む。`MainLayout.vue` からは該当部分を削除。

### 変更の影響範囲

| ファイル | 変更内容 |
|---|---|
| `fe/src/components/TitleBar.vue` | **新規作成**: タイトルバーのテンプレート＋スクリプトを抽出 |
| `fe/src/App.vue` | `<TitleBar />` を追加（`<router-view>` の前） |
| `fe/src/layouts/MainLayout.vue` | タイトルバー部分（div.__zasso-title-bar + q-toggle + q-btn + ロジック）を削除 |
| `fe/src/css/app.scss` | `.__zasso-title-bar` に `position: fixed; top: 0; left: 0; right: 0; z-index: 1000` を追加 |

**依存関係から見た安全確認**:
- `isVoiceActive` / `isWindowExpanded` → Pinia store（コンポーネント間で共有済み）
- `onClickExpandToggleBtn` → Tauri API + settings.ts の定数（TitleBar に移動）
- `data-tauri-drag-region` → DOM 属性（TitleBar に移動）
- スタイル `.puyon`, `.__zasso-page-container` → MainLayout に残るため影響なし

## Test Plan

### ユニットテスト計画

TypeScript/Vue の単体テストは現在のプロジェクトで未導入。以下の検証はビルド確認＋目視確認で代用する。

### ユニットテスト不可能な項目（例外）

- **理由1**: プロジェクトにフロントエンドのテストフレームワーク未導入。テスト導入は本チケットのスコープ外
- **理由2**: Tauri API（`getCurrentWindow().setSize()`）は Tauri ランタイム上でしか動作しないため、ブラウザベースのテストでは検証不可

## Boy Scout Rule — 翻訳可能性計画

- **TitleBar.vue** は新規作成につき、最初から責務をタイトルバー表示に絞った翻訳可能なコードとして実装する
- **MainLayout.vue**: タイトルバー削除後はページコンテナに専念するため、責務の混在が解消される
- **埋め込みスタイル**のインライン指定（`style="..."`）が複数存在するが、スコープ外とし本チケットでは変更しない

## Acceptance Criteria

- [ ] タイトルバーが App.vue に移動し、`make run` で表示される
- [ ] q-toggle のトグル動作が従来通り（`isVoiceActive` の変更がスピナー表示に反映される）
- [ ] スマートフォンボタンのクリックでウィンドウサイズがトグルする
- [ ] `data-tauri-drag-region` によるウィンドウドラッグが動作する
- [ ] デザイン（グラデーション、角丸、マージン）が移動前と同一
- [ ] 他のレイアウトに切り替えてもタイトルバーが表示される（要確認）
- [ ] `pnpm quasar build` が成功する
