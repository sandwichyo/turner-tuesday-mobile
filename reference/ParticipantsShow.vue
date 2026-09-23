<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Head, Link } from "@inertiajs/vue3";
import {
  CategoryScale,
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  type TooltipItem,
  Tooltip,
} from "chart.js";
import { Line } from "vue-chartjs";
import { useTenant } from "../../composables/useTenant";
import TimeRangeSlider, {
  type TimeRange,
} from "../../components/TimeRangeSlider.vue";
import {
  type CharacterRenderBox,
  getCharacterImageUrl,
  getCharacterRenderBox,
  getCharacterStyle,
  getStockIconUrl,
} from "../../lib/characters";

const { tenant, url } = useTenant();

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
);

type PlayerSummary = {
  playerId: string;
  displayName: string;
  attendances: number;
  averagePlacement: number;
  bestPlacement: number;
};

type PlacementPoint = {
  eventId: number;
  eventName: string;
  tournamentName: string;
  label: string;
  startAt: number | null;
  numEntrants: number | null;
  placement: number;
};

type H2hOpponent = {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  totalSets: number;
  winRate: number;
};

type H2hSummary = {
  wins: number;
  losses: number;
};

type H2hTimelineEntry = {
  eventId: number;
  label: string;
  startAt: number | null;
  opponents: {
    playerId: string;
    displayName: string;
    wins: number;
    losses: number;
  }[];
};

type CharacterStat = {
  characterId: number;
  characterName: string;
  count: number;
  percentage: number;
};

type CharacterTimelineEntry = {
  eventId: number;
  label: string;
  startAt: number | null;
  characters: { characterId: number; characterName: string; count: number }[];
};

const props = defineProps<{
  player: PlayerSummary | null;
  placements?: PlacementPoint[];
  h2h?: {
    summary: H2hSummary;
    opponents: H2hOpponent[];
    timeline?: H2hTimelineEntry[];
  };
  characters?: {
    totalSelections: number;
    top: CharacterStat[];
    timeline?: CharacterTimelineEntry[];
  };
  error?: string | null;
}>();

const placements = computed(() => props.placements ?? []);
const h2hSummary = computed(() => props.h2h?.summary ?? { wins: 0, losses: 0 });
const h2hOpponents = computed(() => props.h2h?.opponents ?? []);
const h2hTimeline = computed<H2hTimelineEntry[]>(
  () => props.h2h?.timeline ?? [],
);
const characterSelections = computed(() => props.characters?.top ?? []);
const totalCharacterSelections = computed(
  () => props.characters?.totalSelections ?? 0,
);
const characterTimeline = computed<CharacterTimelineEntry[]>(
  () => props.characters?.timeline ?? [],
);

// --- Zeitraum-Regler ---
// Beide Bereiche der Seite lassen sich unabhaengig voneinander eingrenzen. Die
// Regler liefern `null`, solange der volle Bereich gewaehlt ist ("Gesamt") —
// dann bleibt das vom Server gerechnete Aggregat stehen.
function eventRangeLabels(
  entries: { startAt: number | null; label: string }[],
): string[] {
  return entries.map((entry) => formatDate(entry.startAt) || entry.label || "Event");
}

const characterRange = ref<TimeRange | null>(null);
const characterRangeLabels = computed(() =>
  eventRangeLabels(characterTimeline.value),
);

const h2hRange = ref<TimeRange | null>(null);
const h2hRangeLabels = computed(() => eventRangeLabels(h2hTimeline.value));

// Die Charakterstatistik des gewaehlten Zeitraums.
const rangedCharacters = computed<{ total: number; top: CharacterStat[] }>(
  () => {
    const range = characterRange.value;

    if (range === null || characterTimeline.value.length === 0) {
      return {
        total: totalCharacterSelections.value,
        top: characterSelections.value,
      };
    }

    const counts = new Map<string, CharacterStat>();
    let total = 0;

    for (const entry of characterTimeline.value.slice(
      range.from,
      range.to + 1,
    )) {
      for (const character of entry.characters) {
        const existing = counts.get(character.characterName);
        if (existing) {
          existing.count += character.count;
          existing.characterId = Math.min(
            existing.characterId,
            character.characterId,
          );
        } else {
          counts.set(character.characterName, {
            characterId: character.characterId,
            characterName: character.characterName,
            count: character.count,
            percentage: 0,
          });
        }
        total += character.count;
      }
    }

    const top = [...counts.values()]
      .map((character) => ({
        ...character,
        percentage:
          total > 0 ? Math.round((character.count / total) * 1000) / 10 : 0,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.characterName.localeCompare(right.characterName),
      );

    return { total, top };
  },
);

// Die H2H-Bilanz des gewaehlten Zeitraums. Reihenfolge und Rundung folgen dem
// Server (RankingCalculator), damit "Gesamt" und ein voll aufgezogener Regler
// dieselbe Liste ergeben.
const rangedH2h = computed<{
  summary: H2hSummary;
  opponents: H2hOpponent[];
}>(() => {
  const range = h2hRange.value;

  if (range === null || h2hTimeline.value.length === 0) {
    return { summary: h2hSummary.value, opponents: h2hOpponents.value };
  }

  const byOpponent = new Map<string, H2hOpponent>();
  let wins = 0;
  let losses = 0;

  for (const entry of h2hTimeline.value.slice(range.from, range.to + 1)) {
    for (const opponent of entry.opponents) {
      let existing = byOpponent.get(opponent.playerId);
      if (!existing) {
        // Aelteste Schreibweise gewinnt — wie beim Server, der den Namen beim
        // ersten Zusammentreffen festhaelt.
        existing = {
          playerId: opponent.playerId,
          displayName: opponent.displayName,
          wins: 0,
          losses: 0,
          totalSets: 0,
          winRate: 0,
        };
        byOpponent.set(opponent.playerId, existing);
      }
      existing.wins += opponent.wins;
      existing.losses += opponent.losses;
      wins += opponent.wins;
      losses += opponent.losses;
    }
  }

  const opponents = [...byOpponent.values()]
    .map((opponent) => {
      const totalSets = opponent.wins + opponent.losses;
      return {
        ...opponent,
        totalSets,
        winRate:
          totalSets > 0 ? Math.round((opponent.wins / totalSets) * 1000) / 10 : 0,
      };
    })
    .sort(
      (left, right) =>
        right.totalSets - left.totalSets ||
        right.wins - left.wins ||
        left.losses - right.losses ||
        left.displayName.localeCompare(right.displayName, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
    );

  return { summary: { wins, losses }, opponents };
});

// --- Charakter-Lineup ---
// Die Charaktere stehen nebeneinander auf einer gemeinsamen Standlinie, der
// meistgespielte gibt mit voller Hoehe die Richtlinie vor. Die Wurzel staucht
// das Verhaeltnis: streng linear faellt ein Charakter mit 5 % Anteil auf ein
// Zwanzigstel zusammen und ist nicht mehr zu erkennen.
const LINEUP_LIMIT = 5;

type LineupEntry = CharacterStat & {
  scale: number;
  imageUrl: string | null;
  iconUrl: string | null;
  box: CharacterRenderBox;
  style: { background: string; color: string };
  offset: number;
  depth: number;
};

const lineup = computed<LineupEntry[]>(() => {
  const top = rangedCharacters.value.top.slice(0, LINEUP_LIMIT);
  const maxCount = top[0]?.count ?? 0;

  return top.map((character, index) => ({
    ...character,
    scale: maxCount > 0 ? Math.sqrt(character.count / maxCount) : 1,
    imageUrl: getCharacterImageUrl(character.characterName),
    iconUrl: getStockIconUrl(character.characterName),
    box: getCharacterRenderBox(character.characterName),
    style: getCharacterStyle(character.characterName),
    // Jeder zweite steht eine Spur tiefer, die hinteren rutschen zusaetzlich
    // nach unten — das erzeugt die versetzte Staffelung.
    offset: (index % 2 === 0 ? 0 : 5) + index * 1.5,
    // Nach hinten leicht abdunkeln, damit die Reihenfolge auch ohne Zahlen lesbar ist.
    depth: Math.max(0.62, 1 - index * 0.11),
  }));
});

type CharacterChip = CharacterStat & { iconUrl: string | null };

// Unter der Buehne stehen alle Charaktere, nicht nur die fuenf gezeichneten.
const characterChips = computed<CharacterChip[]>(() =>
  rangedCharacters.value.top.map((character) => ({
    ...character,
    iconUrl: getStockIconUrl(character.characterName),
  })),
);

const bestPlacement = computed(() => {
  if (placements.value.length === 0) return 0;
  return placements.value.reduce(
    (best, entry) => Math.min(best, entry.placement),
    Number.POSITIVE_INFINITY,
  );
});

const worstPlacement = computed(() => {
  if (placements.value.length === 0) return 0;
  return placements.value.reduce(
    (max, entry) => Math.max(max, entry.placement),
    Number.NEGATIVE_INFINITY,
  );
});

// --- Chart-Ausschnitt: standardmaessig nur die juengsten Events ---
// `placements` ist chronologisch aufsteigend sortiert, die letzten Eintraege
// sind also die aktuellsten. Der Regler erlaubt es, den Ausschnitt bis auf
// alle teilgenommenen Events zu erweitern.
const DEFAULT_CHART_POINTS = 6;
const MIN_CHART_POINTS = 2;

const chartPointCount = ref(DEFAULT_CHART_POINTS);

const maxChartPoints = computed(() => placements.value.length);
const canAdjustChartRange = computed(
  () => maxChartPoints.value > MIN_CHART_POINTS,
);

// Beim Wechsel auf einen anderen Spieler (bzw. neuen Daten) wieder auf die
// Standardanzahl zurueckfallen und auf die vorhandenen Events begrenzen.
watch(
  placements,
  (entries) => {
    chartPointCount.value = Math.min(
      DEFAULT_CHART_POINTS,
      Math.max(1, entries.length),
    );
  },
  { immediate: true },
);

const visiblePlacements = computed<PlacementPoint[]>(() => {
  const count = Math.min(
    Math.max(1, chartPointCount.value),
    placements.value.length,
  );
  return placements.value.slice(placements.value.length - count);
});

const visibleBestPlacement = computed(() => {
  if (visiblePlacements.value.length === 0) return 0;
  return visiblePlacements.value.reduce(
    (best, entry) => Math.min(best, entry.placement),
    Number.POSITIVE_INFINITY,
  );
});

const visibleWorstPlacement = computed(() => {
  if (visiblePlacements.value.length === 0) return 0;
  return visiblePlacements.value.reduce(
    (max, entry) => Math.max(max, entry.placement),
    Number.NEGATIVE_INFINITY,
  );
});

const chartData = computed<ChartData<"line">>(() => ({
  labels: visiblePlacements.value.map(
    (e) => e.tournamentName || e.label || e.eventName,
  ),
  datasets: [
    {
      label: "Placement",
      data: visiblePlacements.value.map((e) => e.placement),
      borderColor: "#89b4fa",
      backgroundColor: "rgba(137, 180, 250, 0.18)",
      pointBackgroundColor: "#cba6f7",
      pointBorderColor: "#1e1e2e",
      pointHoverBackgroundColor: "#f5c2e7",
      pointHoverBorderColor: "#1e1e2e",
      tension: 0.25,
      fill: false,
    },
  ],
}));

const chartOptions = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(30, 30, 46, 0.95)",
      titleColor: "#cdd6f4",
      bodyColor: "#bac2de",
      borderColor: "#45475a",
      borderWidth: 1,
      callbacks: {
        title(items: TooltipItem<"line">[]) {
          const item = visiblePlacements.value[items[0]?.dataIndex ?? 0];
          return item ? item.label : "";
        },
        label(context: TooltipItem<"line">) {
          const item = visiblePlacements.value[context.dataIndex];
          const placement = context.parsed.y ?? item?.placement ?? 0;
          const entrants = item?.numEntrants ? ` / ${item.numEntrants}` : "";
          return `Placement: ${placement}${entrants}`;
        },
      },
    },
  },
  scales: {
    y: {
      reverse: true,
      min: Math.max(0, visibleBestPlacement.value - 1),
      max: visibleWorstPlacement.value + 1,
      grid: { color: "rgba(108, 112, 134, 0.35)" },
      border: { color: "rgba(108, 112, 134, 0.5)" },
      ticks: { color: "#bac2de", precision: 0, stepSize: 1 },
      title: { display: true, text: "Platzierung", color: "#cdd6f4" },
    },
    x: {
      grid: { color: "rgba(108, 112, 134, 0.2)" },
      border: { color: "rgba(108, 112, 134, 0.5)" },
      ticks: { display: false },
    },
  },
}));

const PAGE_SIZE = 10;

// Kompakte Seitenauswahl: erste/letzte Seite plus ein Fenster um die aktuelle
// Seite (analog zur Event-Tabelle im Homescreen). "…" markiert ausgelassene
// Seitenbereiche.
function buildVisiblePages(total: number, current: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// --- Event-Liste: Sortierung (neuestes zuerst), Suche & Pagination ---
// Der Chart nutzt weiterhin die chronologische `placements`-Reihenfolge; nur die
// Tabelle wird umgekehrt sortiert. Events ohne Zeitstempel wandern ans Ende.
const sortedPlacements = computed<PlacementPoint[]>(() =>
  [...placements.value].sort(
    (a, b) => (b.startAt ?? -Infinity) - (a.startAt ?? -Infinity),
  ),
);

const placementQuery = ref("");
const placementPage = ref(1);

const filteredPlacements = computed<PlacementPoint[]>(() => {
  const query = placementQuery.value.trim().toLowerCase();
  if (!query) return sortedPlacements.value;
  return sortedPlacements.value.filter((entry) =>
    `${entry.tournamentName} ${entry.eventName}`.toLowerCase().includes(query),
  );
});

const placementPageCount = computed(() =>
  Math.max(1, Math.ceil(filteredPlacements.value.length / PAGE_SIZE)),
);

const pagedPlacements = computed(() => {
  const start = (placementPage.value - 1) * PAGE_SIZE;
  return filteredPlacements.value.slice(start, start + PAGE_SIZE);
});

const placementVisiblePages = computed(() =>
  buildVisiblePages(placementPageCount.value, placementPage.value),
);

watch(placementQuery, () => {
  placementPage.value = 1;
});
watch(placementPageCount, (count) => {
  if (placementPage.value > count) placementPage.value = count;
});

// --- H2H-Gegner: Suche & Pagination ---
const h2hQuery = ref("");
const h2hPage = ref(1);

const filteredOpponents = computed<H2hOpponent[]>(() => {
  const query = h2hQuery.value.trim().toLowerCase();
  if (!query) return rangedH2h.value.opponents;
  return rangedH2h.value.opponents.filter((opponent) =>
    opponent.displayName.toLowerCase().includes(query),
  );
});

const h2hPageCount = computed(() =>
  Math.max(1, Math.ceil(filteredOpponents.value.length / PAGE_SIZE)),
);

const pagedOpponents = computed(() => {
  const start = (h2hPage.value - 1) * PAGE_SIZE;
  return filteredOpponents.value.slice(start, start + PAGE_SIZE);
});

const h2hVisiblePages = computed(() =>
  buildVisiblePages(h2hPageCount.value, h2hPage.value),
);

// Suche wie Zeitraum aendern die Trefferliste — beides springt auf Seite 1.
watch([h2hQuery, h2hRange], () => {
  h2hPage.value = 1;
});
watch(h2hPageCount, (count) => {
  if (h2hPage.value > count) h2hPage.value = count;
});

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleDateString();
}

function formatWinRate(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
</script>

<template>
  <Head
    :title="
      player
        ? `${player.displayName} · ${tenant.label}`
        : `Teilnehmer · ${tenant.label}`
    "
  />

  <main class="container mx-auto space-y-4 p-4 sm:space-y-6 sm:p-6">
    <section class="card bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div
          class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
        >
          <div class="space-y-2">
            <Link class="btn btn-ghost btn-sm -ml-3" :href="url()">
              ← Zurück zur Übersicht
            </Link>
            <div>
              <h1 class="text-3xl font-bold">
                {{ player?.displayName ?? "Spieler" }}
              </h1>
              <p class="text-base-content/70">
                Platzierungshistorie über Events der Reihe {{ tenant.label }}.
              </p>
            </div>
          </div>
        </div>

        <div v-if="error" class="alert alert-error shadow-sm">
          <span>{{ error }}</span>
        </div>

        <template v-else-if="player">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">
                Teilnahmen
              </div>
              <div class="mt-1 text-xl font-semibold">
                {{ player.attendances }}
              </div>
            </div>
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">
                Durchschnittliche Platzierung
              </div>
              <div class="mt-1 text-xl font-semibold">
                {{ formatAverage(player.averagePlacement) }}
              </div>
            </div>
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">
                Beste / Schlechteste Platzierung
              </div>
              <div class="mt-1 text-xl font-semibold">
                {{ bestPlacement }} / {{ worstPlacement }}
              </div>
            </div>
          </div>

          <div class="rounded-2xl bg-base-100">
            <div
              class="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
            >
              <h2 class="text-lg font-semibold">
                Platzierungen über die Zeit
              </h2>
              <div
                v-if="canAdjustChartRange"
                class="flex w-full flex-col gap-1 sm:w-auto sm:items-end"
              >
                <label
                  class="text-sm text-base-content/60"
                  for="chart-range"
                >
                  Letzte {{ visiblePlacements.length }} von
                  {{ placements.length }} Events
                </label>
                <input
                  id="chart-range"
                  v-model.number="chartPointCount"
                  type="range"
                  class="range range-primary range-xs w-full sm:w-56"
                  :min="MIN_CHART_POINTS"
                  :max="maxChartPoints"
                  step="1"
                />
              </div>
              <span v-else class="text-sm text-base-content/60">
                {{ placements.length }} Events
              </span>
            </div>
            <div class="h-80 w-full rounded-xl bg-base-200/50 p-3 sm:h-96">
              <Line :data="chartData" :options="chartOptions" />
            </div>
          </div>

          <div class="rounded-2xl bg-base-100">
            <div
              class="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
            >
              <h2 class="text-lg font-semibold">Events</h2>
              <label class="form-control w-full sm:max-w-xs">
                <input
                  v-model="placementQuery"
                  type="text"
                  autocomplete="off"
                  class="input input-bordered input-sm w-full"
                  placeholder="Event suchen …"
                />
              </label>
            </div>

            <div
              v-if="filteredPlacements.length > 0"
              class="max-w-full overflow-x-auto"
            >
              <table class="table table-zebra w-full">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Platzierung</th>
                    <th>Anz. d. Teilnehmer</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in pagedPlacements" :key="entry.eventId">
                    <td>
                      <span
                        v-if="entry.placement === 1"
                        class="mr-1 text-sm leading-none"
                        title="Turniersieg"
                        aria-label="Turniersieg"
                      >
                        👑
                      </span>
                      <Link
                        class="link link-hover link-primary font-medium"
                        :href="url(`/events/${entry.eventId}`)"
                      >
                        {{ entry.tournamentName }}
                      </Link>
                      <div class="text-xs text-base-content/60">
                        <template v-if="entry.eventName !== entry.tournamentName">
                          {{ entry.eventName }}
                        </template>
                        <template v-if="entry.startAt">
                          <span v-if="entry.eventName !== entry.tournamentName">
                            ·
                          </span>
                          {{ formatDate(entry.startAt) }}
                        </template>
                      </div>
                    </td>
                    <td class="font-semibold">{{ entry.placement }}</td>
                    <td>{{ entry.numEntrants ?? "n/a" }}</td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="placementPageCount > 1"
                class="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
              >
                <span class="text-sm text-base-content/60">
                  Seite {{ placementPage }} von {{ placementPageCount }}
                </span>
                <div class="join shrink-0">
                  <button
                    type="button"
                    class="btn btn-sm join-item"
                    :disabled="placementPage <= 1"
                    @click="placementPage--"
                  >
                    «
                  </button>
                  <template v-for="(page, index) in placementVisiblePages">
                    <button
                      v-if="page !== '…'"
                      :key="page"
                      type="button"
                      class="btn btn-sm join-item"
                      :class="{ 'btn-active': page === placementPage }"
                      @click="placementPage = page"
                    >
                      {{ page }}
                    </button>
                    <span
                      v-else
                      :key="`gap-${index}`"
                      class="btn btn-sm join-item btn-disabled no-animation pointer-events-none"
                    >
                      …
                    </span>
                  </template>
                  <button
                    type="button"
                    class="btn btn-sm join-item"
                    :disabled="placementPage >= placementPageCount"
                    @click="placementPage++"
                  >
                    »
                  </button>
                </div>
              </div>
            </div>

            <div
              v-else
              class="rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/60"
            >
              Keine Events gefunden.
            </div>
          </div>

          <div class="rounded-2xl bg-base-100">
            <div class="mb-3 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">
                  Meist gespielte Charaktere
                </h2>
                <span class="text-sm text-base-content/60">
                  {{ rangedCharacters.total }} Games
                </span>
              </div>

              <TimeRangeSlider
                v-model="characterRange"
                :labels="characterRangeLabels"
              />
            </div>
            <template v-if="lineup.length > 0">
              <div class="character-stage rounded-xl bg-base-200">
                <div class="character-row">
                  <div
                    v-for="(character, index) in lineup"
                    :key="character.characterName"
                    class="character-figure"
                    :style="{
                      '--scale': character.scale,
                      '--offset': `${character.offset}px`,
                      '--depth': character.depth,
                      '--layer': lineup.length - index,
                      '--box-x': character.box.x,
                      '--box-y': character.box.y,
                      '--box-width': character.box.width,
                      '--box-height': character.box.height,
                    }"
                  >
                    <span
                      class="character-badge"
                      :style="{
                        background: character.style.background,
                        color: character.style.color,
                      }"
                    >
                      {{ formatWinRate(character.percentage) }}%
                    </span>
                    <img
                      v-if="character.imageUrl"
                      :src="character.imageUrl"
                      class="character-render"
                      :alt="character.characterName"
                      :title="`${character.characterName} · ${character.count} mal gewählt`"
                      loading="lazy"
                      decoding="async"
                    />
                    <span
                      v-else
                      class="character-render character-placeholder"
                      :style="{ background: character.style.background }"
                      :title="`${character.characterName} · ${character.count} mal gewählt`"
                    ></span>
                  </div>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <span
                  v-for="(character, index) in characterChips"
                  :key="character.characterName"
                  class="inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-sm"
                  :class="
                    index === 0
                      ? 'bg-secondary/10 ring-1 ring-secondary'
                      : 'bg-base-200'
                  "
                >
                  <img
                    v-if="character.iconUrl"
                    :src="character.iconUrl"
                    class="h-5 w-5 shrink-0 object-contain"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <span class="font-semibold">{{ character.characterName }}</span>
                  <span class="text-base-content/60">
                    {{ character.count }}× · {{ formatWinRate(character.percentage) }}%
                  </span>
                </span>
              </div>
            </template>
            <div
              v-else
              class="rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/60"
            >
              {{
                characterRange === null
                  ? "Keine Charakterinformationen hinterlegt."
                  : "Im gewählten Zeitraum wurde kein Charakter gespielt."
              }}
            </div>
          </div>

          <div class="rounded-2xl bg-base-100">
            <div class="mb-3 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">H2H</h2>
                <span class="text-sm text-base-content/60">
                  {{ rangedH2h.summary.wins }} - {{ rangedH2h.summary.losses }}
                </span>
              </div>

              <TimeRangeSlider v-model="h2hRange" :labels="h2hRangeLabels" />
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div class="rounded-xl bg-base-200 p-4">
                <div class="text-xs uppercase text-base-content/50">
                  Gewonnen
                </div>
                <div class="mt-1 text-xl font-semibold">
                  {{ rangedH2h.summary.wins }}
                </div>
              </div>
              <div class="rounded-xl bg-base-200 p-4">
                <div class="text-xs uppercase text-base-content/50">
                  Verloren
                </div>
                <div class="mt-1 text-xl font-semibold">
                  {{ rangedH2h.summary.losses }}
                </div>
              </div>
              <div
                class="rounded-xl bg-base-200 p-4 sm:col-span-2 lg:col-span-1"
              >
                <div class="text-xs uppercase text-base-content/50">
                  Gewinnrate
                </div>
                <div class="mt-1 text-xl font-semibold">
                  {{
                    formatWinRate(
                      rangedH2h.summary.wins + rangedH2h.summary.losses > 0
                        ? (rangedH2h.summary.wins /
                            (rangedH2h.summary.wins +
                              rangedH2h.summary.losses)) *
                            100
                        : 0,
                    )
                  }}%
                </div>
              </div>
            </div>
            <div v-if="rangedH2h.opponents.length > 0" class="mt-4">
              <label class="form-control mb-3 w-full sm:max-w-xs">
                <input
                  v-model="h2hQuery"
                  type="text"
                  autocomplete="off"
                  class="input input-bordered input-sm w-full"
                  placeholder="Gegner suchen …"
                />
              </label>

              <div
                v-if="filteredOpponents.length > 0"
                class="max-w-full overflow-x-auto"
              >
                <table class="table table-zebra w-full">
                  <thead>
                    <tr>
                      <th>Gegner</th>
                      <th>Bilanz</th>
                      <th>Sets</th>
                      <th>Gewinnrate</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="opponent in pagedOpponents"
                      :key="opponent.playerId"
                    >
                      <td>
                        <Link
                          class="link link-hover link-primary break-words"
                          :href="url(`/participants/${encodeURIComponent(opponent.playerId)}`)"
                        >
                          {{ opponent.displayName }}
                        </Link>
                      </td>
                      <td class="font-semibold">
                        {{ opponent.wins }} - {{ opponent.losses }}
                      </td>
                      <td>{{ opponent.totalSets }}</td>
                      <td>{{ formatWinRate(opponent.winRate) }}%</td>
                    </tr>
                  </tbody>
                </table>

                <div
                  v-if="h2hPageCount > 1"
                  class="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
                >
                  <span class="text-sm text-base-content/60">
                    Seite {{ h2hPage }} von {{ h2hPageCount }}
                  </span>
                  <div class="join shrink-0">
                    <button
                      type="button"
                      class="btn btn-sm join-item"
                      :disabled="h2hPage <= 1"
                      @click="h2hPage--"
                    >
                      «
                    </button>
                    <template v-for="(page, index) in h2hVisiblePages">
                      <button
                        v-if="page !== '…'"
                        :key="page"
                        type="button"
                        class="btn btn-sm join-item"
                        :class="{ 'btn-active': page === h2hPage }"
                        @click="h2hPage = page"
                      >
                        {{ page }}
                      </button>
                      <span
                        v-else
                        :key="`gap-${index}`"
                        class="btn btn-sm join-item btn-disabled no-animation pointer-events-none"
                      >
                        …
                      </span>
                    </template>
                    <button
                      type="button"
                      class="btn btn-sm join-item"
                      :disabled="h2hPage >= h2hPageCount"
                      @click="h2hPage++"
                    >
                      »
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/60"
              >
                Kein Gegner gefunden.
              </div>
            </div>
            <div
              v-else
              class="mt-4 rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/60"
            >
              {{
                h2hRange === null
                  ? "Noch keine H2H Daten verfügbar."
                  : "Im gewählten Zeitraum wurde kein Set gespielt."
              }}
            </div>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>

<style scoped>
/*
 * Charakter-Lineup: die Figuren stehen auf einer gemeinsamen Linie am unteren
 * Rand der Buehne und ueberlappen sich leicht. Alle Groessen leiten sich aus
 * `--row-height` ab, damit die Reihe auf kleinen Displays einfach schrumpft.
 *
 * `--box-*` ist der sichtbare Bildinhalt des Renders (siehe
 * CHARACTER_RENDER_BOXES). Das Bild wird so skaliert und verschoben, dass genau
 * dieser Ausschnitt die Figur fuellt — sonst schwebt Jigglypuff ueber der Linie,
 * waehrend Fox darauf steht.
 */
.character-stage {
  --row-height: 210px;
  position: relative;
  height: calc(var(--row-height) + 52px);
  overflow: hidden;
}

.character-row {
  position: absolute;
  inset: 0;
  bottom: 26px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-inline: 12px;
}

.character-figure {
  --image-height: calc(var(--scale) * var(--row-height) / var(--box-height));
  --image-width: calc(var(--image-height) * 2 / 3);
  --figure-width: calc(var(--image-width) * var(--box-width));
  position: relative;
  z-index: var(--layer);
  flex: 0 0 auto;
  width: var(--figure-width);
  height: calc(var(--scale) * var(--row-height));
  margin-left: calc(var(--figure-width) * -0.2);
  transform: translateY(var(--offset));
  transition: transform 150ms ease;
}

.character-figure:first-child {
  margin-left: 0;
}

/* Schattenellipse am Boden, damit die Figur nicht in der Luft klebt. */
.character-figure::before {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 12%;
  right: 12%;
  height: calc(var(--scale) * 14px);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  filter: blur(5px);
}

.character-render {
  position: absolute;
  left: calc(var(--box-x) * var(--image-width) * -1);
  bottom: calc((1 - var(--box-y) - var(--box-height)) * var(--image-height) * -1);
  width: var(--image-width);
  height: var(--image-height);
  max-width: none;
  object-fit: contain;
  opacity: var(--depth);
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.35));
  transition: opacity 150ms ease;
}

/* Charakter ohne Render: eingefaerbte Saeule in der Charakterfarbe. */
.character-placeholder {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  border-radius: 0.5rem 0.5rem 0 0;
}

.character-badge {
  position: absolute;
  bottom: calc(100% - 2px);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

/* Hover hebt einen Charakter aus der Reihe und dimmt die uebrigen. */
.character-row:hover .character-render {
  opacity: calc(var(--depth) * 0.7);
}

.character-figure:hover {
  z-index: 60;
  transform: translateY(calc(var(--offset) - 6px));
}

.character-figure:hover .character-render {
  opacity: 1;
}

@media (max-width: 768px) {
  .character-stage {
    --row-height: 150px;
  }

  .character-figure {
    margin-left: calc(var(--figure-width) * -0.24);
  }
}

@media (max-width: 420px) {
  .character-stage {
    --row-height: 120px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .character-figure,
  .character-render {
    transition: none;
  }
}
</style>
