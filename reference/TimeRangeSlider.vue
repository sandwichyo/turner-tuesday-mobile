<script setup lang="ts">
import { computed, ref, watch } from "vue";

export type TimeRange = { from: number; to: number };

/**
 * Zwei-Griff-Regler ueber eine chronologisch aufsteigende Liste von Rasten
 * (ein Label je Event). Der Regler arbeitet bewusst mit Indizes statt mit
 * Datumswerten: so liegt jedes Event auf einer eigenen Raste und eine lange
 * Turnierpause frisst keinen Reglerweg.
 */
const props = withDefaults(
  defineProps<{
    labels: string[];
    title?: string;
    unit?: string;
  }>(),
  { title: "Zeitraum", unit: "Events" },
);

// `null` heisst "voller Bereich" — der Default, also "Gesamt". Damit muss die
// Seite keinen Anfangsbereich kennen und zeigt vor dem ersten Rendern des
// Reglers schon das Richtige an.
const range = defineModel<TimeRange | null>({ required: true });

// Rohwerte der beiden Inputs. Sie bleiben absichtlich unsortiert, damit der
// gezogene Griff nicht unter dem Finger wegspringt.
const rawFrom = ref(0);
const rawTo = ref(0);

const maxIndex = computed(() => Math.max(0, props.labels.length - 1));

// Bei nur einer Raste gibt es nichts einzugrenzen — dann bleibt der Regler weg.
const canAdjust = computed(() => maxIndex.value > 0);

// Ueberkreuzen sich die Griffe, werden sie getauscht statt am jeweils anderen
// zu klemmen.
const normalized = computed<TimeRange>(() => {
  const max = maxIndex.value;
  const from = Math.min(Math.max(0, rawFrom.value), max);
  const to = Math.min(Math.max(0, rawTo.value), max);

  return from <= to ? { from, to } : { from: to, to: from };
});

const isFull = computed(
  () =>
    props.labels.length === 0 ||
    (normalized.value.from === 0 && normalized.value.to === maxIndex.value),
);

function reset(): void {
  rawFrom.value = 0;
  rawTo.value = maxIndex.value;
}

// Neue Daten (anderer Spieler) fallen wieder auf "Gesamt" zurueck.
watch(() => props.labels, reset, { immediate: true });

watch(
  [normalized, isFull],
  ([value, full]) => {
    range.value = full ? null : value;
  },
  { immediate: true },
);

const summary = computed(() => {
  if (isFull.value) return "Gesamt";
  const { from, to } = normalized.value;
  return `${to - from + 1} von ${props.labels.length} ${props.unit}`;
});

const fromLabel = computed(() => props.labels[normalized.value.from] ?? "–");
const toLabel = computed(() => props.labels[normalized.value.to] ?? "–");

// Anteil des markierten Bereichs am Regler — faerbt die Schiene ein. Die Werte
// sind Verhaeltnisse (0–1); die halbe Griffbreite rechnet das CSS heraus, damit
// die Fuellung genau unter den Griffmitten endet.
const fillStyle = computed(() => {
  const max = maxIndex.value;
  const { from, to } = normalized.value;

  return {
    "--fill-start": max === 0 ? "0" : String(from / max),
    "--fill-end": max === 0 ? "0" : String(1 - to / max),
  };
});
</script>

<template>
  <div v-if="canAdjust" class="rounded-xl bg-base-200/60 px-4 py-3">
    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm text-base-content/60">{{ title }}</span>
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">{{ summary }}</span>
        <button
          v-if="!isFull"
          type="button"
          class="btn btn-ghost btn-xs"
          @click="reset"
        >
          Zurücksetzen
        </button>
      </div>
    </div>

    <div class="time-range">
      <div class="time-range-track"></div>
      <div class="time-range-fill" :style="fillStyle"></div>
      <input
        v-model.number="rawFrom"
        type="range"
        class="time-range-input"
        min="0"
        :max="maxIndex"
        step="1"
        :aria-label="`${title} von`"
        :aria-valuetext="fromLabel"
      />
      <input
        v-model.number="rawTo"
        type="range"
        class="time-range-input"
        min="0"
        :max="maxIndex"
        step="1"
        :aria-label="`${title} bis`"
        :aria-valuetext="toLabel"
      />
    </div>

    <div
      class="mt-1 flex items-center justify-between gap-2 text-xs text-base-content/50"
    >
      <span>von {{ fromLabel }}</span>
      <span>bis {{ toLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
/*
 * Zwei native Range-Inputs liegen deckungsgleich uebereinander, ihre Schienen
 * sind unsichtbar. Sichtbar ist nur die gemeinsame Schiene darunter — so bleibt
 * die Tastatur- und Touch-Bedienung des Browsers erhalten, ohne dass zwei
 * Regler doppelt gezeichnet werden.
 */
.time-range {
  --thumb-size: 1.125rem;
  --range-height: 1.5rem;
  position: relative;
  height: var(--range-height);
}

.time-range-track,
.time-range-fill {
  position: absolute;
  top: 50%;
  height: 0.375rem;
  border-radius: 999px;
  transform: translateY(-50%);
  pointer-events: none;
}

.time-range-track {
  left: 0;
  right: 0;
  background: var(--fallback-b3, oklch(var(--b3) / 1));
}

/*
 * Die Griffmitte wandert nur zwischen einer halben Griffbreite vom Rand und der
 * Gegenseite — genau diesen Weg bildet die Fuellung ab, sonst laeuft sie an den
 * Enden aus den Griffen heraus.
 */
.time-range-fill {
  left: calc(
    var(--thumb-size) / 2 + var(--fill-start, 0) * (100% - var(--thumb-size))
  );
  right: calc(
    var(--thumb-size) / 2 + var(--fill-end, 0) * (100% - var(--thumb-size))
  );
  min-width: 0.375rem;
  background: var(--fallback-p, oklch(var(--p) / 1));
}

.time-range-input {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  /* Nur die Griffe nehmen Eingaben an, sonst wuerde der obere Input den
     unteren komplett abdecken. */
  pointer-events: none;
}

.time-range-input::-webkit-slider-runnable-track {
  height: var(--range-height);
  background: transparent;
}

.time-range-input::-moz-range-track {
  height: var(--range-height);
  background: transparent;
}

.time-range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  pointer-events: auto;
  width: var(--thumb-size);
  height: var(--thumb-size);
  border-radius: 999px;
  border: 2px solid var(--fallback-b1, oklch(var(--b1) / 1));
  background: var(--fallback-p, oklch(var(--p) / 1));
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
  cursor: pointer;
  /*
   * WebKit setzt den Griff an die OBERKANTE der Schiene, nicht in ihre Mitte —
   * ohne diesen Versatz sitzen die Kreise sichtbar zu hoch ueber der Linie.
   * Firefox zentriert von sich aus, dort darf der Versatz nicht stehen.
   */
  margin-top: calc((var(--range-height) - var(--thumb-size)) / 2);
}

.time-range-input::-moz-range-thumb {
  pointer-events: auto;
  width: var(--thumb-size);
  height: var(--thumb-size);
  border-radius: 999px;
  border: 2px solid var(--fallback-b1, oklch(var(--b1) / 1));
  background: var(--fallback-p, oklch(var(--p) / 1));
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
  cursor: pointer;
}

.time-range-input:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--fallback-p, oklch(var(--p) / 1));
  outline-offset: 2px;
}

.time-range-input:focus-visible::-moz-range-thumb {
  outline: 2px solid var(--fallback-p, oklch(var(--p) / 1));
  outline-offset: 2px;
}
</style>
