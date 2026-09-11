<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { usePwaInstall } from "../composables/usePwaInstall";

/** A dismissal is remembered across reloads so the hint never nags twice. */
const DISMISSED_KEY = "tt.install-hint.dismissed";

/** Let the page settle before sliding the card in. */
const APPEAR_DELAY_MS = 2000;

const { canInstall, isStandalone, isIos, install } = usePwaInstall();

const ready = ref(false);
const dismissed = ref(true);
const showIosHint = ref(false);
let appearTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  try {
    dismissed.value = window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private mode or storage disabled — still show it, just don't remember.
    dismissed.value = false;
  }

  appearTimer = setTimeout(() => {
    ready.value = true;
  }, APPEAR_DELAY_MS);
});

onBeforeUnmount(() => {
  if (appearTimer !== null) clearTimeout(appearTimer);
  appearTimer = null;
});

// Nothing to offer once the app runs standalone, and nothing to offer on a
// browser that can neither prompt nor be talked through the share sheet.
const visible = computed(
  () =>
    ready.value &&
    !dismissed.value &&
    !isStandalone.value &&
    (canInstall.value || isIos.value),
);

function dismiss(): void {
  dismissed.value = true;
  showIosHint.value = false;

  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Not remembering it beats breaking the click.
  }
}

async function installNow(): Promise<void> {
  // A declined dialog consumes the event, so the hint disappears either way;
  // only an actual install is worth remembering.
  if (await install()) dismiss();
}
</script>

<template>
  <!-- Full width above the thumb on phones, a compact card bottom-right from
       sm up. Stays below the error toast (z-50).

       The slide-in is a CSS animation rather than a <Transition>: dismissing
       while the card is still sliding in would interrupt the enter phase, and
       since enter-from and leave-to need the very same utilities here, Vue's
       class bookkeeping then leaves both applied and the card stuck at full
       opacity. Removal is immediate instead, which reads as responsive. -->
  <div
    v-if="visible"
    class="install-hint fixed inset-x-3 bottom-3 z-40 mb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-4 sm:end-4 sm:w-96"
    role="complementary"
    aria-label="App installieren"
  >
    <div class="card border border-base-300 bg-base-100 shadow-xl">
      <div class="card-body gap-3 p-4">
        <div class="flex items-start gap-3">
          <span class="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </span>

          <div class="min-w-0 flex-1">
            <p class="font-semibold leading-tight">App installieren</p>
            <p class="mt-1 text-sm text-base-content/70">
              Turner Tuesdays auf den Home-Bildschirm legen – startet wie eine
              App und kann dich benachrichtigen.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle -me-1 -mt-1 shrink-0"
            title="Hinweis ausblenden"
            aria-label="Hinweis ausblenden"
            @click="dismiss"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
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

        <div class="flex justify-end">
          <button
            v-if="canInstall"
            type="button"
            class="btn btn-primary btn-sm"
            @click="installNow"
          >
            Installieren
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary btn-sm"
            @click="showIosHint = true"
          >
            So geht's
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Only iOS ever opens this, so it is not shipped to anyone else. -->
  <div v-if="isIos" class="modal" :class="{ 'modal-open': showIosHint }" role="dialog">
    <div class="modal-box">
      <h3 class="text-lg font-bold">Zum Home-Bildschirm hinzufügen</h3>
      <ol class="mt-4 list-decimal space-y-2 ps-5 text-sm text-base-content/80">
        <li>In Safari unten auf <strong>Teilen</strong> tippen.</li>
        <li><strong>Zum Home-Bildschirm</strong> auswählen.</li>
        <li>Mit <strong>Hinzufügen</strong> bestätigen.</li>
      </ol>
      <p class="mt-4 text-sm text-base-content/60">
        Danach startet Turner Tuesdays wie eine App – und kann dir
        Benachrichtigungen schicken.
      </p>
      <div class="modal-action">
        <button type="button" class="btn btn-sm" @click="showIosHint = false">
          Verstanden
        </button>
      </div>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Schließen"
      @click="showIosHint = false"
    ></button>
  </div>
</template>

<style scoped>
.install-hint {
  animation: install-hint-in 300ms ease-out both;
}

@keyframes install-hint-in {
  from {
    opacity: 0;
    transform: translateY(1rem);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .install-hint {
    animation: none;
  }
}
</style>
