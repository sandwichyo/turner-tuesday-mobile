<script setup lang="ts">
import { computed } from "vue";
import { usePushSubscription } from "../composables/usePushSubscription";

const { supported, subscribed, busy, blocked, error, toggle } = usePushSubscription();

const label = computed(() => {
  if (blocked.value) return "Benachrichtigungen sind im Browser blockiert";
  return subscribed.value
    ? "Benachrichtigungen deaktivieren"
    : "Benachrichtigungen aktivieren";
});
</script>

<template>
  <button
    v-if="supported"
    type="button"
    class="btn btn-ghost btn-sm btn-circle"
    :class="{ 'text-primary': subscribed }"
    :disabled="busy || blocked"
    :aria-pressed="subscribed"
    :title="label"
    :aria-label="label"
    @click="toggle"
  >
    <span v-if="busy" class="loading loading-spinner loading-xs" />
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      class="h-5 w-5"
      viewBox="0 0 24 24"
      :fill="subscribed ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" />
      <line v-if="blocked" x1="3" y1="3" x2="21" y2="21" />
    </svg>
  </button>

  <!-- Top right, clear of the navbar (min-height 4rem), so it never collides
       with the install hint and the ranked day button in the bottom corner.
       daisyUI's .toast forces white-space: nowrap, which would clip a long
       message instead of wrapping it inside max-w-xs. -->
  <div v-if="error" class="toast toast-top toast-end top-16 z-50 whitespace-normal">
    <div class="alert alert-error max-w-xs shadow-lg">
      <span class="text-sm">{{ error }}</span>
      <button type="button" class="btn btn-ghost btn-xs" @click="error = null">OK</button>
    </div>
  </div>
</template>
