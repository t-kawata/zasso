<template>
  <q-layout>
    <div data-tauri-drag-region class="__zasso-title-bar">
      <q-toggle
        dense
        color="white"
        v-model="ACTIVE"
        style="margin-left: 5px; margin-top: 5px"
      />
    </div>
    <q-page-container
      :class="[
        '__zasso-page-container',
        ACTIVE ? 'puyon' : '',
        !ACTIVE ? '__zasso-page-container-off' : '',
      ]"
    >
      <!-- <q-spinner-puff
        v-if="ACTIVE"
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
        v-if="ACTIVE"
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
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { getCurrentEdition } from "src/utils/some";

const ACTIVE = ref(true);
const { logo_img_white_src: logoWhiteSrc } = getCurrentEdition();
</script>
