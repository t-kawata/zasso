import type { RouteRecordRaw } from "vue-router";

/**
 * URL パス定数 — 全コンポーネントでハードコードを避けるための唯一の情報源
 */
export const URL = {
  INDEX: "/",
  APP: "/dummy",
} as const;

const routes: RouteRecordRaw[] = [
  {
    path: URL.INDEX,
    component: () => import("layouts/MainLayout.vue"),
    children: [
      // 子ルートの path は先頭の / を除いた値を指定する
      {
        path: URL.INDEX.slice(1),
        component: () => import("pages/IndexPage.vue"),
      },
      {
        path: URL.APP.slice(1),
        component: () => import("pages/DummyAppPage.vue"),
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: "/:catchAll(.*)*",
    component: () => import("pages/ErrorNotFound.vue"),
  },
];

export default routes;
