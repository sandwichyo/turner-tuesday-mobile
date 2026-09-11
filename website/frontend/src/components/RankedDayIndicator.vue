<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRankedDay } from "../composables/useRankedDay";

const { mounted, active, remainingLabel, statusLabel, windowLabel } = useRankedDay();

/**
 * daisyUI's dropdown opens on `:focus-within`, which never closes reliably on
 * touch devices — a tap outside does not always blur the trigger. The popover
 * is therefore driven by state: the button toggles it, and a tap outside, the
 * Escape key or the close button dismiss it.
 */
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function close(): void {
  open.value = false;
}

function onPointerDown(event: PointerEvent): void {
  if (!open.value) return;

  const target = event.target;
  if (target instanceof Node && root.value?.contains(target)) return;

  close();
}

function onKeydown(event: KeyboardEvent): void {
  if ("Escape" === event.key) close();
}

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <!-- Rendered client-side only; the countdown depends on the current clock.
       Sits below the install hint (z-40), which covers it until dismissed. -->
  <div
    v-if="mounted"
    ref="root"
    class="fixed bottom-4 end-4 z-30 mb-[env(safe-area-inset-bottom)]"
  >
    <button
      type="button"
      class="btn h-12 min-h-12 rounded-full border-base-300 bg-base-100 shadow-lg"
      :class="active ? 'gap-2 px-4' : 'w-12 px-0'"
      :title="statusLabel"
      :aria-label="statusLabel"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="relative flex h-2.5 w-2.5">
        <span
          v-if="active"
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"
        />
        <span
          class="relative inline-flex h-2.5 w-2.5 rounded-full"
          :class="active ? 'bg-success' : 'bg-error'"
        />
      </span>
      <span v-if="active" class="text-xs font-medium text-success">Ranked Day</span>
    </button>

    <!-- Opens upwards and right-aligned; the max-width keeps it on screen on
         the narrowest phones. -->
    <div
      v-if="open"
      class="ranked-day-popover card card-compact absolute bottom-full end-0 mb-2 w-72 max-w-[calc(100vw-2rem)] border border-base-300 bg-base-100 shadow-xl"
    >
      <div class="card-body gap-1">
        <div class="flex items-start justify-between gap-2">
          <div class="text-xs uppercase tracking-wide text-base-content/50">
            Slippi Free Ranked Day
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-circle -me-1 -mt-1 shrink-0"
            title="Schließen"
            aria-label="Schließen"
            @click="close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          class="font-medium tabular-nums"
          :class="active ? 'text-success' : 'text-base-content'"
        >
          {{ active ? `Läuft noch ${remainingLabel}` : `Startet in ${remainingLabel}` }}
        </div>
        <div class="text-xs text-base-content/60">{{ windowLabel }}</div>
        <div class="mt-1 text-xs text-base-content/40">
          Ranked ist alle 4 Tage für 24 Stunden für alle frei.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranked-day-popover {
  animation: ranked-day-popover-in 150ms ease-out both;
}

@keyframes ranked-day-popover-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ranked-day-popover {
    animation: none;
  }
}
</style>
