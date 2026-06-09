<template>
  <q-page class="__zasso-page">
    <div
      :class="[
        '__zasso-index-container',
        mainStore.isVoiceActive ? 'puyon' : '',
        !mainStore.isVoiceActive ? '__zasso-index-container-off' : '',
        mainStore.isWindowExpanded || isEntering ? '__zasso-index-container-hidden' : '',
      ]"
    >
      <!-- <q-spinner-puff
        v-if="mainStore.isVoiceActive"
        color="white"
        size="7em"
        style="
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          margin: auto;
          opacity: 0.8;
        "
      /> -->
      <q-spinner
        v-if="mainStore.isVoiceActive"
        color="white"
        size="8.6em"
        :thickness="1"
        style="
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          margin: auto;
          opacity: 0.5;
        "
      />
      <img
        :src="logoWhiteSrc"
        style="
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          width: 78px;
          height: 78px;
          margin: auto;
          opacity: 0.8;
        "
      />
      <!-- <q-spinner-bars
        color="white"
        size="4em"
        style="
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          margin: auto;
          opacity: 0.8;
        "
      /> -->
      <!-- <q-spinner-grid
        color="white"
        size="4em"
        style="
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          margin: auto;
          opacity: 0.8;
        "
      /> -->
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getCurrentEdition } from "src/utils/some";
import { useMainStore } from "src/stores/main-store";

const mainStore = useMainStore();
const { logo_img_white_src: logoWhiteSrc } = getCurrentEdition();

/** マウント直後の 1 フレームだけ円形を非表示にし、CSS transition を確実に発火させる */
const isEntering = ref(true);
onMounted(() => {
  requestAnimationFrame(() => {
    isEntering.value = false;
  });
});
</script>
