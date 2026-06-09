<template>
  <div
    class="__zasso-page-frame"
    :class="{
      '__zasso-page-frame-entering': animationState === 'entering',
      '__zasso-page-frame-leaving': animationState === 'leaving',
    }"
  >
    <div class="__zasso-page-frame-inner">
      <WaterRipple />
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useMainStore } from "src/stores/main-store";
import WaterRipple from "src/components/effects/WaterRipple.vue";

type AnimationState = "entering" | "idle" | "leaving";

const mainStore = useMainStore();

const animationState = ref<AnimationState>("entering");

// ── Enter: マウント直後に entering → idle へ遷移し CSS transition で拡大 ──
onMounted(() => {
  requestAnimationFrame(() => {
    animationState.value = "idle";
  });
});

// ── Exit: isWindowExpanded が false になったら即座に leaving へ ──
// TitleBar の setIsWindowExpanded(false) → sleep(300) の間でアニメーション完了
watch(
  () => mainStore.isWindowExpanded,
  (expanded) => {
    if (!expanded && animationState.value === "idle") {
      animationState.value = "leaving";
    }
  },
);

// ── Exit: ルートガード（ストア watch が間に合わなかった場合の安全網） ──
onBeforeRouteLeave((_to, _from, next) => {
  if (animationState.value === "leaving") {
    next();
  } else {
    animationState.value = "leaving";
    setTimeout(() => next(), 300);
  }
});
</script>
