<template>
  <div
    data-tauri-drag-region
    :class="[
      '__zasso-title-bar',
      mainStore.isWindowExpanded ? '__zasso-title-bar-expanded' : '',
    ]"
  >
    <q-toggle
      dense
      color="white"
      v-model="mainStore.isVoiceActive"
      style="margin-left: 8px; margin-top: 5px; float: left"
    />
    <q-btn
      dense
      flat
      round
      color="white"
      :icon="mainStore.isWindowExpanded ? 'circle' : 'smartphone'"
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
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  WINDOW_WIDTH_COLLAPSED,
  WINDOW_HEIGHT_COLLAPSED,
  WINDOW_WIDTH_EXPANDED,
  WINDOW_HEIGHT_EXPANDED,
} from "src/configs/settings";
import { useMainStore } from "src/stores/main-store";
import { sleep } from "src/utils/some";

const mainStore = useMainStore();

/** タイトルバーの width トランジション時間（app.scss の &-title-bar transition と同期） */
const TITLE_BAR_TRANSITION_MS = 300;

const onClickExpandToggleBtn = async () => {
  try {
    const win = getCurrentWindow();
    if (mainStore.isWindowExpanded) {
      // 閉じる: 先にタイトルバーを短くする CSS アニメーションを再生し、
      // 0.3s 後に実際のウィンドウサイズを縮小する
      mainStore.setIsWindowExpanded(false);
      await sleep(TITLE_BAR_TRANSITION_MS);
      await win.setSize(
        new LogicalSize(WINDOW_WIDTH_COLLAPSED, WINDOW_HEIGHT_COLLAPSED),
      );
    } else {
      // 開く: 即座にウィンドウサイズを拡大してから状態を変更する
      await win.setSize(
        new LogicalSize(WINDOW_WIDTH_EXPANDED, WINDOW_HEIGHT_EXPANDED),
      );
      mainStore.setIsWindowExpanded(true);
    }
  } catch (error) {
    console.error("Failed to resize window:", error);
  }
};
</script>
