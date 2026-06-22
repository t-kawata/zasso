---
ticket_id: 7
title: DummyAppPage とルーティングを追加し、ウィンドウ開閉とページ遷移を連携させる
slug: dummyapppage
status: done
created_at: 2026-06-09
updated_at: 2026-06-09
plan_path: /Users/kawata/shyme/zasso/tickets/context/0007-dummyapppage/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0007-dummyapppage/implementation.md
---
# DummyAppPage とルーティングを追加し、ウィンドウ開閉とページ遷移を連携させる

## Summary

1. `DummyAppPage.vue` を作成する
2. ルーターに `/app` ルートを追加し、DummyAppPage が表示されるようにする
3. タイトルバーの開閉ボタンにページ遷移を連携させる：
   - **開く（IndexPage → DummyAppPage）**: ウィンドウ拡大 → 丸が 0.3s でフェードアウト → その後 DummyAppPage に遷移
   - **閉じる（DummyAppPage → IndexPage）**: `isWindowExpanded = false` → 0.3s 後（丸がフェードインを開始するタイミング）に IndexPage に遷移

## Background

- 現在は IndexPage に円形コンテナがあるだけで、開いた先のページがない
- 開閉はウィンドウサイズ変更＋円形のフェードだけを行っており、ページそのものは切り替わらない
- 「開いたらアプリ一覧（DummyAppPage）が表示される」という体験を作ることで、開閉動作に意味が生まれる
- 閉じるときも IndexPage（円形ホーム）に戻ることで、自然なナビゲーションになる

## Scope

1. `fe/src/pages/DummyAppPage.vue` の新規作成
2. `fe/src/router/routes.ts` への `/app` ルート追加
3. `fe/src/components/TitleBar.vue` の `onClickExpandToggleBtn` にページ遷移ロジックを追加（Vue Router の `useRouter` を使用）
4. ビルド確認

## Non-scope

- DummyAppPage の中身の実装 — プレースホルダページで十分
- MainLayout や IndexPage の構造変更
- app.scss の変更（CSS は既に正しく動作している）

## Investigation

### 現在のルーティング構成

**`fe/src/router/routes.ts`:**
```typescript
const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [{ path: '', component: () => import('pages/IndexPage.vue') }],
  },
  { path: '/:catchAll(.*)*', component: () => import('pages/ErrorNotFound.vue') },
];
```

- `MainLayout` に `/` がマウントされ、子として `IndexPage` が表示される
- 新しい `/app` ルートは `MainLayout` の子として追加する（レイアウトを共有）

### 現在の TitleBar の開閉ロジック

**開く（IndexPage → DummyAppPage への流れ）:**
1. `win.setSize(EXPANDED)` — 即座にウィンドウ拡大
2. `setIsWindowExpanded(true)` → IndexPage で `__zasso-index-container-hidden` クラス追加
3. CSS により 0.3s で opacity: 0 へ遷移（フェードアウト）

→ この後（フェード完了後）に DummyAppPage へ遷移するよう変更

**閉じる（DummyAppPage → IndexPage への流れ）:**
1. `setIsWindowExpanded(false)` → タイトルバー縮小 CSS アニメーション開始
2. → IndexPage で `-hidden` クラス削除、0.3s 遅延後に opacity: 1 へ遷移開始
3. `sleep(300)` 後、`win.setSize(COLLAPSED)`

→ 手順2のタイミング（t=0.3s）で IndexPage へ遷移するよう変更

### 変更の影響範囲

| ファイル | 変更内容 |
|---|---|
| `fe/src/pages/DummyAppPage.vue` | **新規作成**: 簡易なプレースホルダページ |
| `fe/src/router/routes.ts` | `/app` ルートを MainLayout の子として追加 |
| `fe/src/components/TitleBar.vue` | `useRouter()` を import、開閉時に `router.push()` を追加 |

### タイミング設計

**開くシーケンス（IndexPage → DummyAppPage）:**
```
t=0:     win.setSize(EXPANDED)、setIsWindowExpanded(true)
t=0〜0.3: 丸がフェードアウト（CSS transition）
t=0.3:   router.push('/app') → DummyAppPage 表示
```

**閉じるシーケンス（DummyAppPage → IndexPage）:**
```
t=0:     setIsWindowExpanded(false) → タイトルバー縮小開始、丸のフェードイン遅延タイマー開始
t=0〜0.3: タイトルバー縮小アニメーション
t=0.3:   router.push('/') → IndexPage に遷移
t=0.3:   丸がフェードイン開始（CSS transition）
t=0.3:   sleep 完了 → win.setSize(COLLAPSED)
```

**注意**: 現在の TitleBar の閉じる処理では `sleep(300)` 後に `win.setSize()` を呼んでいる。これに `router.push('/')` を同じタイミングで追加する（または sleep 前に遷移させる）。

## Test Plan

### ユニットテスト計画

フロントエンドにテストフレームワーク未導入のため、ビルド確認＋目視確認で代用する。

### ユニットテスト不可能な項目（例外）

- **理由1**: プロジェクトにフロントエンドのテストフレームワーク未導入
- **理由2**: Tauri API と Vue Router の連携は実機確認が必要

## Boy Scout Rule — 翻訳可能性計画

- **TitleBar.vue**: `onClickExpandToggleBtn` 関数は既に責務が「開閉＋ページ遷移」で明確。コメントで各タイミングを説明することで翻訳可能性を維持する
- **DummyAppPage.vue**: 新規作成につき最低限の翻訳可能なコードとする（関数名は動詞句、変数名はドメイン概念）

## Acceptance Criteria

- [ ] `/app` にアクセスすると DummyAppPage が表示される
- [ ] IndexPage で expand ボタンを押すとウィンドウ拡大 → 丸フェードアウト → DummyAppPage に遷移する
- [ ] DummyAppPage で collapse ボタンを押すと 0.3s 後に IndexPage に遷移し、丸がフェードインする
- [ ] 開閉のタイミングが崩れていない（丸のフェードとページ遷移が同期している）
- [ ] `pnpm quasar build` が成功する

## Notes

### 成果物

- 計画: context/0007-dummyapppage/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0007-dummyapppage/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0007-dummyapppage/review.md（未作成、/review-ticket 全チェック通過後に作成）
