import { defineStore, acceptHMRUpdate } from "pinia";

/**
 * メインストア — アプリケーション全体で共有する UI 状態
 */
export const useMainStore = defineStore("main", {
  state: () => ({
    /** アプリケーションのアクティブ状態（q-toggle にバインド） */
    isVoiceActive: true,
    /** ウィンドウ展開状態（true = 展開 / false = 折りたたみ） */
    isWindowExpanded: (() => {
      // リロード時に URL のハッシュから状態を復元する（TitleBar の onMounted より前に確定させる）
      if (typeof window !== "undefined") {
        const hash = window.location.hash;
        return hash !== "" && hash !== "#/" && hash !== "#";
      }
      return false;
    })(),
  }),

  getters: {},

  actions: {
    /** ウィンドウ展開状態を指定する（true = 展開 / false = 折りたたみ） */
    setIsWindowExpanded(expanded: boolean) {
      this.isWindowExpanded = expanded;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot));
}
