<template>
  <div
    data-tauri-drag-region
    :class="[
      '__zasso-title-bar',
      isTitleBarExpanded ? '__zasso-title-bar-expanded' : '',
    ]"
  >
    <q-toggle
      dense
      color="white"
      v-model="mainStore.isVoiceActive"
      style="margin-left: 8px; margin-top: 5px; float: left"
    />
    <q-btn
      v-if="mainStore.isVoiceActive"
      dense
      flat
      round
      color="white"
      :icon="isTitleBarExpanded ? 'circle' : 'smartphone'"
      class="relative-position"
      style="
        float: right;
        font-size: 11px;
        width: 24px;
        height: 24px;
        top: 2px;
        right: 3px;
      "
      @click="onClickExpandToggleBtn"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  WINDOW_WIDTH_COLLAPSED,
  WINDOW_HEIGHT_COLLAPSED,
  WINDOW_WIDTH_EXPANDED,
  WINDOW_HEIGHT_EXPANDED,
} from "src/configs/settings";
import { useRouter } from "vue-router";
import { URL } from "src/router/routes";
import { useMainStore } from "src/stores/main-store";
import { sleep } from "src/utils/some";

const mainStore = useMainStore();
const router = useRouter();

/** タイトルバーが展開状態か（store が唯一の情報源） */
const isTitleBarExpanded = computed(() => mainStore.isWindowExpanded);

/** タイトルバーの width トランジション時間（app.scss の &-title-bar transition と同期） */
const TITLE_BAR_TRANSITION_MS = 300;

/** 閉じる処理を共有する */
async function collapseWindow() {
  try {
    const win = getCurrentWindow();
    mainStore.setIsWindowExpanded(false);
    await sleep(TITLE_BAR_TRANSITION_MS);
    await router.push(URL.INDEX);
    await win.setSize(
      new LogicalSize(WINDOW_WIDTH_COLLAPSED, WINDOW_HEIGHT_COLLAPSED),
    );
  } catch (error) {
    console.error("Failed to collapse window via voice toggle:", error);
  }
}

// isVoiceActive が false になったら自動で閉じる
watch(
  () => mainStore.isVoiceActive,
  (active) => {
    if (!active && isTitleBarExpanded.value) {
      collapseWindow();
    }
  },
);

const onClickExpandToggleBtn = async () => {
  try {
    const win = getCurrentWindow();
    if (isTitleBarExpanded.value) {
      await collapseWindow();
    } else {
      // 開く: ウィンドウサイズを拡大して円形コンテナをフェードアウトさせた後、
      // DummyAppPage へ遷移する
      await win.setSize(
        new LogicalSize(WINDOW_WIDTH_EXPANDED, WINDOW_HEIGHT_EXPANDED),
      );
      mainStore.setIsWindowExpanded(true);
      await sleep(TITLE_BAR_TRANSITION_MS);
      await router.push(URL.APP);
    }
  } catch (error) {
    console.error("Failed to resize window:", error);
  }
};
</script>
