---
ticket_id: 6
title: 円形コンテナを IndexPage.vue に移動し、クラス名を再命名する
slug: indexpagevue
status: approved
created_at: 2026-06-09
updated_at: 2026-06-09
---
# 円形コンテナを IndexPage.vue に移動し、クラス名を再命名する

## Summary

`MainLayout.vue` に直書きされている円形オブジェクト（`__zasso-page-container`）を `IndexPage.vue` に移動する。同時に、クラス名を `page` → `index` に変更して所有権を明示し、SCSS のネスト構造も追従させる。`MainLayout.vue` は最小限のレイアウトシェルに純化する。

## Background

- 現在 `MainLayout.vue` が円形コンテナ（`__zasso-page-container`）、スピナー、ロゴを保持しており、`IndexPage.vue` は空のページ
- これにより別のページ（例： `/settings`）を追加しても円形が消えず、レイアウトが固定されてしまう
- `__zasso-page-container` という名前は「全ページで使うコンテナ」と読めるが、実態は IndexPage 専用のビジュアル
- クラス名を `__zasso-index-container` に変更することで、所有権と用途を明確にする

## Scope

1. `fe/src/pages/IndexPage.vue` に円形コンテナのテンプレート＋ロジックを移植
2. `fe/src/layouts/MainLayout.vue` から円形コンテナを削除し、最小限の `q-layout` にする
3. `fe/src/css/app.scss` のクラス名を `__zasso-page-container` → `__zasso-index-container` に改名し、ネスト構造を整理
4. ビルド確認

## Non-scope

- TitleBar コンポーネント — 既に App.vue にあり、本チケットでは触れない
- MainLayout そのものの削除 — レイアウトシェルとして残す
- 円形のデザイン・寸法・アニメーション・色の変更 — 一切行わない

## Investigation

### 現在のファイル構成

**`fe/src/layouts/MainLayout.vue`（現状: 行1-90）**
```
<q-layout>
  <q-page-container                              ← ✅ このブロックを移動する
    :class="['__zasso-page-container',           ← 改名: __zasso-index-container
             mainStore.isVoiceActive ? 'puyon' : '',
             !mainStore.isVoiceActive ? '__zasso-page-container-off' : '']"  ← 改名
  >
    <q-spinner v-if="mainStore.isVoiceActive" .../>
    <img :src="logoWhiteSrc" .../>
    <router-view />                              ← これだけは MainLayout に残す
  </q-page-container>
</q-layout>

<script>
import { getCurrentEdition } from "src/utils/some";
import { useMainStore } from "src/stores/main-store";
const mainStore = useMainStore();
const { logo_img_white_src: logoWhiteSrc } = getCurrentEdition();
</script>
```

**`fe/src/pages/IndexPage.vue`（現状: 行1-5）**
```html
<q-page class="__zasso-page"></q-page>
<script setup lang="ts"></script>
```
→ ここに円形コンテナ全体を移す。`__zasso-page` の基底スタイル（`width: 100%; height: 100%`）は残す。

**`fe/src/css/app.scss`（現状: 行117-176）**
```
.__zasso {
    &-page {                           ← __zasso-page は残す（q-page のベーススタイル）
        &-container {                  ← __zasso-page-container → &-index-container に改名
            &-off { }                  ← → &-index-container-off に改名
            ...全スタイル...
        }
        width: 100%;
        height: 100%;
    }
}
```

### クラス名変更対応

| 現在のクラス | 新しいクラス | 理由 |
|---|---|---|
| `__zasso-page-container` | `__zasso-index-container` | IndexPage 専用であることを明確化 |
| `__zasso-page-container-off` | `__zasso-index-container-off` | 上記に同じ |

### SCSS ネスト構造の変更

現在 `&-page { &-container { ... } }` は `.‗zasso-page-container` を生成している。
これを独立させ `&-index-container { }` として `&-page` の兄弟にする：

```scss
.__zasso {
    &-page {
        width: 100%;       // q-page のベーススタイル → 残す
        height: 100%;
    }

    // IndexPage 専用の円形コンテナ（旧 __zasso-page-container）
    &-index-container {
        &-off { }
        ...全スタイル...
    }
}
```

これにより生成される CSS:
- `.__zasso-page { width: 100%; height: 100%; }` — q-page ベース（変わらず）
- `.__zasso-index-container { ... }` — 独立したクラス（旧 .__zasso-page-container と同じ内容）
- `.__zasso-index-container-off { ... }` — 同上

### 移動後の MainLayout.vue

```
<q-layout>
  <q-page-container>     ← Quasar 標準のレイアウト要素のみ
    <router-view />      ← 各ページをレンダリング
  </q-page-container>
</q-layout>

<script setup lang="ts">
// 何も import 不要。IndexPage が自分で store を参照する
</script>
```

### 移動後の IndexPage.vue

```
<q-page class="__zasso-page">
  <div :class="['__zasso-index-container', ...]">
    <q-spinner v-if="mainStore.isVoiceActive" .../>
    <img :src="logoWhiteSrc" .../>
  </div>
</q-page>

<script setup lang="ts">
// isVoiceActive の参照、logoWhiteSrc の取得をここで行う
</script>
```

### ビルド時の考慮点

- `__zasso-page-container-off` の参照は MainLayout.vue のみ → IndexPage.vue に移る
- `.puyon` クラスは独立したグローバルCSSなので改名不要、参照先が変わるだけ
- `$PAGE_CONTAINER_SIZE` などの SCSS 変数は app.scss のトップレベルで定義済み → 参照元が変わるだけ

## Test Plan

### ユニットテスト計画

TypeScript/Vue の単体テストは現在のプロジェクトで未導入。ビルド確認＋目視確認で代用する。

### ユニットテスト不可能な項目（例外）

- **理由1**: プロジェクトにフロントエンドのテストフレームワーク未導入
- **理由2**: 移動はテンプレートとロジックの再配置のみであり、新規ロジックはゼロ

## Boy Scout Rule — 翻訳可能性計画

- **MainLayout.vue**: 円形コンテナを削除後は純粋なレイアウトシェルになる。責務が明確になるため翻訳可能性が向上する
- **IndexPage.vue**: 円形コンテナのロジック（`isVoiceActive` 参照）とビューが同一ファイルに集約される。`logoWhiteSrc` という変数名は「白ロゴの画像ソース」と読めるため翻訳可能性を満たす
- **app.scss**: `&-index-container` とすることで「__zasso-index-container という独立したクラス」であることが SCSS のネストからも明確になる

## Acceptance Criteria

- [ ] IndexPage を開いたときに円形コンテナ（グラデーション＋スピナー＋ロゴ）が従来と同じ位置・大きさ・色で表示される
- [ ] q-toggle で `isVoiceActive` を変更したとき、スピナー表示と puyon アニメーションが従来通り動作する
- [ ] 新しいページ（例: `/test`）をルーターに追加しても円形コンテナが表示されない
- [ ] `__zasso-page-container` / `__zasso-page-container-off` の文字列がコードベースに残っていない
- [ ] `pnpm quasar build` が成功する

## Notes

### 成果物

- 計画: context/0006-indexpagevue/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0006-indexpagevue/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0006-indexpagevue/review.md（未作成、/review-ticket 全チェック通過後に作成）
