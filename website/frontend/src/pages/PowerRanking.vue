<script setup lang="ts">
import { computed, ref } from "vue";
import { Head, Link } from "@inertiajs/vue3";
import logoUrl from "../../public/web-app-manifest-512x512.png";
import { getCharacterImageUrl, getCharacterStyle } from "../lib/characters";

type TopCharacter = {
  characterId: number;
  characterName: string;
  count: number;
  percentage: number;
};

type AggregateRow = {
  rank: number;
  playerId: string;
  displayName: string;
  attendances: number;
  averagePlacement: number;
  topCharacter: TopCharacter | null;
};

type RankingPeriod = {
  key: string;
  label: string;
  eventsConsidered: number;
  rows: AggregateRow[];
};

type RankingGroup = {
  label: string;
  minimumEntrants: number | null;
  minimumAttendances: number;
  nonAttendancePenalty: number;
  eventsConsidered: number;
  rows: AggregateRow[];
  periods: RankingPeriod[];
};

// Player-specific alternate costume renders. Keyed by the stable start.gg
// player id so the override survives display-name changes. `character` is the
// character the costume belongs to — the override only applies when it is the
// player's dominant character (Sheik/Zelda share one render, which
// getCharacterImageUrl normalises).
const PLAYER_IMAGE_OVERRIDES: Record<
  string,
  { character: string; image: string }
> = {
  "player:4840191": {
    character: "Falco",
    image: "Falco_Standard_4_Render.webp",
  }, // Meadow
  "player:232047": {
    character: "Falco",
    image: "Falco_Standard_2_Render.webp",
  }, // Labig
  "player:4727713": {
    character: "Sheik",
    image: "Zelda_Standard_and_Sheik_Standard_2_Render.webp",
  }, // DaddyFox
  "player:581484": {
    character: "Jigglypuff",
    image: "Jigglypuff_Standard_4_Render.webp",
  }, // StyleStocks
  "player:281090": {
    character: "Samus",
    image: "Samus_Standard_5_Render.webp",
  }, // schnitte
  "player:1594961": {
    character: "Ice Climbers",
    image: "Ice_Climbers_Standard_2_Render.webp",
  }, // wuerger
  "player:4191763": {
    character: "Marth",
    image: "Marth_Standard_2_Render.webp",
  }, // sandboxxyo (currently "sandwichyo")
  "player:5306262": {
    character: "Marth",
    image: "Marth_Standard_4_Render.webp",
  }, // Skog
  "player:5474068": {
    character: "Sheik",
    image: "Zelda_Standard_and_Sheik_Standard_2_Render.webp",
  }, //carottensuppe
};

function getPlayerImageUrl(player: AggregateRow): string | null {
  const defaultUrl = getCharacterImageUrl(player.topCharacter?.characterName);
  const override = PLAYER_IMAGE_OVERRIDES[player.playerId];
  if (
    override &&
    defaultUrl !== null &&
    defaultUrl === getCharacterImageUrl(override.character)
  ) {
    return `/characters/${override.image}`;
  }
  return defaultUrl;
}

function getRankBorderClass(rank: number): string {
  if (rank === 1)
    return "border-yellow-400 shadow-yellow-400/30 shadow-lg ring-1 ring-yellow-400/40";
  if (rank === 2) return "border-slate-400 shadow-slate-400/20 shadow-md";
  if (rank === 3) return "border-amber-600 shadow-amber-600/20 shadow-md";
  return "border-base-300";
}

function getRankNumberClass(rank: number): string {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-amber-600";
  return "text-base-content/40";
}

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPenalty(value: number): string {
  return value.toFixed(2);
}

function getMissedBadgeClass(missed: number): string {
  if (missed <= 0) return "badge-success";
  if (missed <= 5) return "badge-warning";
  return "badge-error";
}

function currentHalfYearKey(): string {
  const now = new Date();
  const half = now.getMonth() < 6 ? 1 : 2;
  return `${now.getFullYear()}-H${half}`;
}

function defaultPeriodKey(
  group: { periods: RankingPeriod[] } | null | undefined,
): string {
  if (!group || group.periods.length === 0) return "overall";
  const current = currentHalfYearKey();
  return group.periods.some((p) => p.key === current)
    ? current
    : group.periods[0].key;
}

const props = defineProps<{
  rankings: { qualified: RankingGroup; all: RankingGroup } | null;
  error?: string | null;
}>();

const activeTab = ref<"qualified" | "all">("qualified");
const activePeriodKey = ref<string>(
  defaultPeriodKey(props.rankings?.qualified ?? null),
);

const activeRanking = computed<RankingGroup | null>(() => {
  if (!props.rankings) return null;
  return props.rankings[activeTab.value];
});

const allPeriods = computed<RankingPeriod[]>(() => {
  if (!activeRanking.value) return [];
  return [
    {
      key: "overall",
      label: "Gesamt",
      eventsConsidered: activeRanking.value.eventsConsidered,
      rows: activeRanking.value.rows,
    },
    ...activeRanking.value.periods,
  ];
});

const activePeriod = computed<RankingPeriod | null>(() => {
  if (allPeriods.value.length === 0) return null;
  return (
    allPeriods.value.find((p) => p.key === activePeriodKey.value) ??
    allPeriods.value[1] ??
    allPeriods.value[0]
  );
});

// Das dem aktiven Zeitraum unmittelbar vorausgehende Power-Ranking. Die
// Perioden kommen vom Backend absteigend sortiert (neuestes zuerst) und
// "Gesamt" steht immer an erster Stelle, daher ist der nächste Listeneintrag
// stets der ältere Zeitraum. Wird für den Button in der Leer-Ansicht genutzt.
const previousPeriod = computed<RankingPeriod | null>(() => {
  const index = allPeriods.value.findIndex(
    (p) => p.key === activePeriod.value?.key,
  );
  if (index === -1) return null;
  const previous = allPeriods.value[index + 1];
  return previous && previous.key !== "overall" ? previous : null;
});

function missedEventsFor(player: AggregateRow): number {
  const events = activePeriod.value?.eventsConsidered ?? 0;
  return Math.max(0, events - player.attendances);
}

function switchTab(tab: "qualified" | "all"): void {
  activeTab.value = tab;
  activePeriodKey.value = defaultPeriodKey(props.rankings?.[tab]);
}
</script>

<template>
  <Head title="Power Ranking · Turner Tuesdays" />

  <main class="container mx-auto space-y-6 p-4 sm:p-6">
    <section class="hero rounded-2xl bg-base-100 shadow-xl">
      <div
        class="hero-content w-full flex-col items-start gap-1 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="flex items-center gap-4">
          <img
            :src="logoUrl"
            alt=""
            class="h-14 w-14 shrink-0 rounded-xl shadow-md"
          />
          <div>
            <h1 class="text-4xl font-bold">Power Ranking</h1>
            <p class="text-base-content/60">Turner Tuesday Series</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="error" class="alert alert-error shadow">
      <span>{{ error }}</span>
    </div>

    <template v-if="rankings">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm"
          :class="activeTab === 'qualified' ? 'btn-primary' : 'btn-ghost'"
          @click="switchTab('qualified')"
        >
          {{ rankings.qualified.label }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="activeTab === 'all' ? 'btn-primary' : 'btn-ghost'"
          @click="switchTab('all')"
        >
          {{ rankings.all.label }}
        </button>
      </div>

      <div v-if="allPeriods.length > 1" class="flex flex-wrap gap-2">
        <button
          v-for="period in allPeriods"
          :key="period.key"
          type="button"
          class="btn btn-sm"
          :class="
            activePeriodKey === period.key ? 'btn-secondary' : 'btn-ghost'
          "
          @click="activePeriodKey = period.key"
        >
          {{ period.label }}
        </button>
      </div>

      <p
        v-if="activePeriod && activeRanking"
        class="text-sm text-base-content/60"
      >
        {{ activePeriod.eventsConsidered }} Events berücksichtigt
        <template v-if="activeRanking.minimumEntrants !== null">
          · mind. {{ activeRanking.minimumEntrants }} Teilnehmer pro Event
        </template>
        · mind. {{ activeRanking.minimumAttendances }} Teilnahmen pro Spieler
        <template v-if="activeRanking.nonAttendancePenalty > 0">
          <span class="text-warning">
            +{{ formatPenalty(activeRanking.nonAttendancePenalty) }}
            auf den Schnitt je Nicht-Teilnahme
          </span>
        </template>
      </p>

      <div
        v-if="activePeriod && activeRanking"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-base-content/60"
      >
        <span class="inline-flex items-center gap-1.5">
          <span class="badge badge-success badge-sm"></span>
          Keine Events verpasst
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="badge badge-warning badge-sm"></span>
          1–5 Events verpasst
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="badge badge-error badge-sm"></span>
          Über 5 Events verpasst
        </span>
      </div>
    </template>

    <div
      v-if="activePeriod && activePeriod.rows.length > 0"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <Link
        v-for="player in activePeriod.rows"
        :key="player.playerId"
        :href="`/participants/${encodeURIComponent(player.playerId)}`"
        class="card group relative overflow-hidden border-2 bg-base-100 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl"
        :class="getRankBorderClass(player.rank)"
      >
        <img
          v-if="getPlayerImageUrl(player)"
          :src="getPlayerImageUrl(player) || ''"
          class="pointer-events-none absolute bottom-0 right-0 h-32 w-auto select-none object-contain opacity-40 transition-opacity duration-150 group-hover:opacity-100"
          aria-hidden="true"
          alt=""
        />
        <div class="card-body relative z-[1] gap-3 p-5">
          <div class="flex items-center gap-2">
            <span
              class="text-3xl font-black leading-none"
              :class="getRankNumberClass(player.rank)"
            >
              #{{ player.rank }}
            </span>
          </div>

          <div
            class="truncate text-xl font-bold group-hover:text-primary transition-colors"
          >
            {{ player.displayName }}
          </div>

          <div>
            <span
              v-if="player.topCharacter"
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
              :style="{
                background: getCharacterStyle(player.topCharacter.characterName)
                  .background,
                color: getCharacterStyle(player.topCharacter.characterName)
                  .color,
              }"
            >
              {{ player.topCharacter.characterName }}
              <span class="text-xs opacity-75">
                {{ player.topCharacter.percentage }}%
              </span>
            </span>
            <span v-else class="badge badge-ghost">–</span>
          </div>

          <div
            class="mt-auto flex items-center justify-between pt-1 text-sm text-base-content/60"
          >
            <span
              class="inline-flex items-center gap-1.5"
              title="Durchschnittliche Platzierung"
            >
              {{ formatAverage(player.averagePlacement) }}
              <span
                class="badge badge-xs h-2.5 w-2.5 rounded-full p-0"
                :class="getMissedBadgeClass(missedEventsFor(player))"
                :title="`${missedEventsFor(player)} Events verpasst`"
              ></span>
            </span>
            <span title="Anzahl Events">{{ player.attendances }} Events</span>
          </div>
        </div>
      </Link>
    </div>

    <div
      v-else-if="rankings"
      class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-base-300 p-10 text-center text-sm text-base-content/60"
    >
      <span>Keine Daten für diesen Zeitraum verfügbar.</span>
      <button
        v-if="previousPeriod"
        type="button"
        class="btn btn-sm btn-secondary"
        @click="activePeriodKey = previousPeriod.key"
      >
        {{ previousPeriod.label }} anzeigen
      </button>
    </div>
  </main>
</template>
