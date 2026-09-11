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

type CharacterStat = {
  characterId: number;
  characterName: string;
  count: number;
  percentage: number;
};

const props = defineProps<{
  player: PlayerSummary | null;
  placements?: PlacementPoint[];
  h2h?: { summary: H2hSummary; opponents: H2hOpponent[] };
  characters?: { totalSelections: number; top: CharacterStat[] };
  error?: string | null;
}>();

const placements = computed(() => props.placements ?? []);
const h2hSummary = computed(() => props.h2h?.summary ?? { wins: 0, losses: 0 });
const h2hOpponents = computed(() => props.h2h?.opponents ?? []);
const characterSelections = computed(() => props.characters?.top ?? []);
const totalCharacterSelections = computed(
  () => props.characters?.totalSelections ?? 0,
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

const chartData = computed<ChartData<"line">>(() => ({
  labels: placements.value.map((e) => e.tournamentName || e.label || e.eventName),
  datasets: [
    {
      label: "Placement",
      data: placements.value.map((e) => e.placement),
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
          const item = placements.value[items[0]?.dataIndex ?? 0];
          return item ? item.label : "";
        },
        label(context: TooltipItem<"line">) {
          const item = placements.value[context.dataIndex];
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
      min: Math.max(0, bestPlacement.value - 1),
      max: worstPlacement.value + 1,
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
  if (!query) return h2hOpponents.value;
  return h2hOpponents.value.filter((opponent) =>
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

watch(h2hQuery, () => {
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
        ? `${player.displayName} · Turner Tuesdays`
        : 'Teilnehmer · Turner Tuesdays'
    "
  />

  <main class="container mx-auto space-y-4 p-4 sm:space-y-6 sm:p-6">
    <section class="card bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div
          class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
        >
          <div class="space-y-2">
            <Link class="btn btn-ghost btn-sm -ml-3" href="/">
              ← Zurück zur Übersicht
            </Link>
            <div>
              <h1 class="text-3xl font-bold">
                {{ player?.displayName ?? "Spieler" }}
              </h1>
              <p class="text-base-content/70">
                Platzierungshistorie über Turner Tuesday Events.
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
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-lg font-semibold">
                Platzierungen über die Zeit
              </h2>
              <span class="text-sm text-base-content/60">
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
                      <Link
                        class="link link-hover link-primary font-medium"
                        :href="`/events/${entry.eventId}`"
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
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-lg font-semibold">Meist gespielte Charaktere</h2>
              <span class="text-sm text-base-content/60">
                {{ totalCharacterSelections }} Games
              </span>
            </div>
            <div
              v-if="characterSelections.length > 0"
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <div
                v-for="character in characterSelections"
                :key="character.characterId"
                class="rounded-xl bg-base-200 p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-lg font-semibold">
                      {{ character.characterName }}
                    </div>
                    <div class="text-sm text-base-content/60">
                      {{ character.count }} mal gewählt
                    </div>
                  </div>
                  <div class="badge badge-secondary badge-outline">
                    {{ formatWinRate(character.percentage) }}%
                  </div>
                </div>
                <progress
                  class="progress progress-secondary mt-4 w-full"
                  :value="character.percentage"
                  max="100"
                />
              </div>
            </div>
            <div
              v-else
              class="rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/60"
            >
              Keine Charakterinformationen hinterlegt.
            </div>
          </div>

          <div class="rounded-2xl bg-base-100">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-lg font-semibold">H2H</h2>
              <span class="text-sm text-base-content/60">
                {{ h2hSummary.wins }} - {{ h2hSummary.losses }}
              </span>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div class="rounded-xl bg-base-200 p-4">
                <div class="text-xs uppercase text-base-content/50">
                  Gewonnen
                </div>
                <div class="mt-1 text-xl font-semibold">
                  {{ h2hSummary.wins }}
                </div>
              </div>
              <div class="rounded-xl bg-base-200 p-4">
                <div class="text-xs uppercase text-base-content/50">
                  Verloren
                </div>
                <div class="mt-1 text-xl font-semibold">
                  {{ h2hSummary.losses }}
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
                      h2hSummary.wins + h2hSummary.losses > 0
                        ? (h2hSummary.wins /
                            (h2hSummary.wins + h2hSummary.losses)) *
                            100
                        : 0,
                    )
                  }}%
                </div>
              </div>
            </div>
            <div v-if="h2hOpponents.length > 0" class="mt-4">
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
                          :href="`/participants/${encodeURIComponent(opponent.playerId)}`"
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
              Noch keine H2H Daten verfügbar.
            </div>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>
