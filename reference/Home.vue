<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Head, Link, router } from "@inertiajs/vue3";
import logoUrl from "../../public/web-app-manifest-512x512.png";
import startggLogoUrl from "../../public/startgg-logo.svg";

type EventOption = {
  eventId: number;
  eventName: string;
  eventSlug: string;
  tournamentId: number | null;
  tournamentName: string;
  tournamentSlug: string;
  startAt: number | null;
  numEntrants: number | null;
  label: string;
};

/** Das nächste, noch nicht gespielte Turner Tuesday — direkt von start.gg,
 * siehe UpcomingEventProvider. `null`, wenn keins ansteht oder start.gg gerade
 * nicht erreichbar ist. */
type UpcomingEvent = {
  eventId: number;
  name: string;
  tournamentName: string;
  label: string;
  startAt: number;
  numEntrants: number;
  /** Sitzplatzlimit aus TURNER_TUESDAY_CAPACITY; null, wenn ohne Limit. */
  capacity: number | null;
  startggUrl: string | null;
};

type StandingRow = {
  placement: number;
  // Placement re-ranked among the stored players (best = 1, next = 2, …),
  // with ties on the absolute placement kept equal. Provided by the backend
  // (EventDataProvider::groupStandings) and shown as the running number.
  rankPlacement: number;
  playerId: string;
  displayName: string;
  entrantName: string;
};

type SelectedEvent = {
  eventId: number;
  eventName: string;
  eventSlug: string;
  tournamentName: string;
  tournamentSlug: string;
  startAt: number | null;
  numEntrants: number | null;
  standings: StandingRow[];
};

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

type RankingGroup = {
  label: string;
  minimumEntrants: number | null;
  minimumAttendances: number;
  eventsConsidered: number;
  rows: AggregateRow[];
  periods: {
    key: string;
    label: string;
    eventsConsidered: number;
    rows: AggregateRow[];
  }[];
};

const props = defineProps<{
  events: EventOption[];
  selectedEvent: SelectedEvent | null;
  rankings: { qualified: RankingGroup; all: RankingGroup } | null;
  upcomingEvent?: UpcomingEvent | null;
  error?: string | null;
}>();

const activeRankingTab = ref<"qualified" | "all">("qualified");
const activePeriodTab = ref<string>(
  defaultPeriodKey(props.rankings?.qualified ?? null),
);
const loading = ref(false);

const selectedEventId = ref<number | null>(
  props.selectedEvent?.eventId ?? null,
);

// --- Event-Suche mit Autocomplete ---
const searchQuery = ref("");
const showSuggestions = ref(false);
const highlightedIndex = ref(-1);
const searchContainer = ref<HTMLElement | null>(null);
const suggestionList = ref<HTMLElement | null>(null);

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());

const filteredEvents = computed<EventOption[]>(() => {
  const query = normalizedQuery.value;
  if (!query) return props.events;
  return props.events.filter((event) =>
    `${event.label} ${event.eventName} ${event.tournamentName}`
      .toLowerCase()
      .includes(query),
  );
});

const selectedEventLabel = computed(
  () =>
    props.events.find((event) => event.eventId === selectedEventId.value)
      ?.label ?? "Event suchen …",
);

function selectEvent(event: EventOption): void {
  selectedEventId.value = event.eventId;
  searchQuery.value = "";
  showSuggestions.value = false;
  highlightedIndex.value = -1;
  onEventChange();
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    showSuggestions.value = true;
    highlightedIndex.value = Math.min(
      highlightedIndex.value + 1,
      filteredEvents.value.length - 1,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const match =
      filteredEvents.value[highlightedIndex.value] ?? filteredEvents.value[0];
    if (match) selectEvent(match);
  } else if (event.key === "Escape") {
    showSuggestions.value = false;
  }
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (
    searchContainer.value &&
    !searchContainer.value.contains(event.target as Node)
  ) {
    showSuggestions.value = false;
  }
}

watch(highlightedIndex, (index) => {
  if (index < 0 || !suggestionList.value) return;
  const item = suggestionList.value.children[index] as HTMLElement | undefined;
  item?.scrollIntoView({ block: "nearest" });
});

onMounted(() =>
  document.addEventListener("pointerdown", onDocumentPointerDown),
);
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", onDocumentPointerDown),
);

const activeRanking = computed<RankingGroup | null>(() => {
  if (!props.rankings) return null;
  return props.rankings[activeRankingTab.value];
});

const rankingPeriods = computed(() => {
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

const activePeriod = computed(() => {
  if (rankingPeriods.value.length === 0) return null;
  return (
    rankingPeriods.value.find((p) => p.key === activePeriodTab.value) ??
    rankingPeriods.value[0]
  );
});

// Das dem aktiven Quartal unmittelbar vorausgehende Quartal. Die Perioden sind
// vom Backend absteigend sortiert (neuestes zuerst) und "Gesamt" steht immer an
// erster Stelle, daher ist der nächste Eintrag in der Liste stets das ältere
// Quartal. Wird für den "vorheriges Quartal"-Button in der Leer-Ansicht genutzt.
const previousPeriod = computed(() => {
  const periods = rankingPeriods.value;
  const index = periods.findIndex((p) => p.key === activePeriod.value?.key);
  if (index === -1) return null;
  const previous = periods[index + 1];
  return previous && previous.key !== "overall" ? previous : null;
});

const PAGE_SIZE = 10;

// Kompakte Seitenauswahl: erste/letzte Seite plus ein Fenster um die aktuelle
// Seite, damit die Buttons in den schmalen Karten-Spalten nicht zusammengequetscht
// werden. "…" markiert ausgelassene Seitenbereiche.
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

// --- Ranking-Pagination ---
const currentPage = ref(1);

const pageCount = computed(() =>
  Math.max(1, Math.ceil((activePeriod.value?.rows.length ?? 0) / PAGE_SIZE)),
);

const pagedRows = computed(() => {
  const rows = activePeriod.value?.rows ?? [];
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
});

const visiblePages = computed(() =>
  buildVisiblePages(pageCount.value, currentPage.value),
);

// Reset to the first page whenever the shown ranking/period changes, and keep
// the current page within bounds if the active period has fewer rows.
watch([activeRankingTab, activePeriodTab], () => {
  currentPage.value = 1;
});
watch(pageCount, (count) => {
  if (currentPage.value > count) currentPage.value = count;
});

// --- Event-Standings-Pagination (analog zur Ranking-Tabelle) ---
const eventPage = ref(1);

const eventStandings = computed<StandingRow[]>(
  () => props.selectedEvent?.standings ?? [],
);

const eventPageCount = computed(() =>
  Math.max(1, Math.ceil(eventStandings.value.length / PAGE_SIZE)),
);

const pagedStandings = computed(() => {
  const start = (eventPage.value - 1) * PAGE_SIZE;
  return eventStandings.value.slice(start, start + PAGE_SIZE);
});

const eventVisiblePages = computed(() =>
  buildVisiblePages(eventPageCount.value, eventPage.value),
);

// Reset to the first page when another event is selected, and keep the current
// page within bounds if the selected event has fewer standings.
watch(selectedEventId, () => {
  eventPage.value = 1;
});
watch(eventPageCount, (count) => {
  if (eventPage.value > count) eventPage.value = count;
});

function defaultPeriodKey(
  group: { periods: { key: string }[] } | null | undefined,
): string {
  if (!group || group.periods.length === 0) return "overall";
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const current = `${now.getFullYear()}-Q${quarter}`;
  return group.periods.some((p) => p.key === current)
    ? current
    : group.periods[0].key;
}

function onEventChange(): void {
  if (!selectedEventId.value) return;
  loading.value = true;
  router.get(
    "/",
    { eventId: String(selectedEventId.value) },
    {
      preserveState: true,
      preserveScroll: true,
      onFinish: () => {
        loading.value = false;
      },
    },
  );
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp * 1000).toLocaleDateString();
}

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/* Ampel für die Anmeldungen. Benutzt dieselben daisyUI-Farbrollen wie die
 * Legende im Power Ranking (success / warning / error), damit beide Seiten
 * dasselbe Vokabular sprechen und beide Themes automatisch passen. */
const SIGNUPS_CALM_MAX = 2;
const SEATS_LEFT_CRITICAL_MAX = 1;

function seatsLeftOf(event: UpcomingEvent): number | null {
  return event.capacity === null
    ? null
    : Math.max(0, event.capacity - event.numEntrants);
}

const signupTone = computed<string>(() => {
  const event = props.upcomingEvent;
  if (!event) return "";

  const seatsLeft = seatsLeftOf(event);
  // Ohne Limit gibt es nichts zu ampeln — dann bleibt die Zahl neutral.
  if (seatsLeft === null) return "";

  // Rot zuerst: bei einem sehr kleinen Limit wäre ein Event mit zwei
  // Anmeldungen sonst grün, obwohl nur noch ein Platz frei ist.
  if (seatsLeft <= SEATS_LEFT_CRITICAL_MAX) return "text-error";
  if (event.numEntrants <= SIGNUPS_CALM_MAX) return "text-success";
  return "text-warning";
});

/** Ausgeschriebene Fassung für Screenreader und als Tooltip — Farbe allein
 *  darf die Information "es wird eng" nicht tragen. */
const signupLabel = computed<string>(() => {
  const event = props.upcomingEvent;
  if (!event) return "";

  const when = formatTimestamp(event.startAt);
  const seatsLeft = seatsLeftOf(event);

  if (seatsLeft === null) {
    return `${event.numEntrants} Anmeldungen für ${event.label} am ${when}`;
  }

  const seats =
    seatsLeft === 0
      ? "ausgebucht"
      : seatsLeft === 1
        ? "nur noch 1 Platz frei"
        : `noch ${seatsLeft} Plätze frei`;

  return `${event.numEntrants} von ${event.capacity} Plätzen belegt, ${seats} — ${event.label} am ${when}`;
});

function getRankIcon(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}
</script>

<template>
  <Head title="Turner Tuesdays" />

  <main class="container mx-auto space-y-4 p-4 sm:space-y-6 sm:p-6">
    <section class="hero rounded-2xl bg-base-100 shadow-xl">
      <div
        class="hero-content w-full flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="flex max-w-2xl items-center gap-4">
          <img
            :src="logoUrl"
            alt=""
            class="h-14 w-14 shrink-0 rounded-xl shadow-md"
          />
          <h1 class="text-4xl font-bold">Turner Overview</h1>
        </div>
        <!-- Anmeldestand direkt am CTA: die Zahl ist der Grund, den Button
             zu drücken (oder eben nicht). Mobil steht sie über dem vollbreiten
             Button, ab lg daneben in der Hero-Zeile. -->
        <div
          class="flex w-full flex-col items-start gap-2 lg:w-auto lg:flex-row lg:items-center lg:gap-4"
        >
          <p
            v-if="upcomingEvent"
            class="flex items-baseline gap-1.5 text-sm"
            :title="signupLabel"
          >
            <span aria-hidden="true" class="text-base-content/60">
              Anmeldungen
            </span>
            <span
              aria-hidden="true"
              class="text-base font-semibold tabular-nums"
              :class="signupTone"
            >
              {{ upcomingEvent.numEntrants
              }}<template v-if="upcomingEvent.capacity !== null"
                >/{{ upcomingEvent.capacity }}</template
              >
            </span>
            <span class="sr-only">{{ signupLabel }}</span>
          </p>
          <a
            href="https://start.gg/whv"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-startgg gap-2 self-stretch sm:btn-md lg:self-auto"
          >
            Jetzt teilnehmen
            <img
              :src="startggLogoUrl"
              alt="start.gg"
              class="h-5 w-5"
            />
          </a>
        </div>
      </div>
    </section>

    <div v-if="error" class="alert alert-error shadow">
      <span>
        {{ error }} Besuche
        <Link class="link link-primary" href="/admin">/admin</Link>
        falls die start.gg Genehmigung Aufmerksamkeit benötigt.
      </span>
    </div>

    <section
      class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      <div class="card min-w-0 bg-base-100 shadow-xl">
        <div class="card-body gap-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="card-title">Wähle ein Event aus</h2>
            </div>
            <span v-if="loading" class="loading loading-spinner loading-md" />
          </div>

          <label class="form-control w-full">
            <div class="label">
              <span class="label-text">Event suchen</span>
            </div>
            <div ref="searchContainer" class="relative">
              <input
                v-model="searchQuery"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="showSuggestions"
                autocomplete="off"
                class="input input-bordered w-full"
                :placeholder="selectedEventLabel"
                :disabled="loading || events.length === 0"
                @focus="showSuggestions = true"
                @input="
                  showSuggestions = true;
                  highlightedIndex = 0;
                "
                @keydown="onSearchKeydown"
              />
              <ul
                v-if="showSuggestions && filteredEvents.length > 0"
                ref="suggestionList"
                class="menu absolute z-20 mt-1 max-h-72 w-full flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
              >
                <li v-for="(event, index) in filteredEvents" :key="event.eventId">
                  <button
                    type="button"
                    class="flex items-start justify-between gap-2"
                    :class="index === highlightedIndex ? 'bg-base-300' : ''"
                    @click="selectEvent(event)"
                    @mouseenter="highlightedIndex = index"
                  >
                    <span class="flex flex-col items-start">
                      <span
                        :class="
                          event.eventId === selectedEventId ? 'font-semibold' : ''
                        "
                      >
                        {{ event.label }}
                      </span>
                      <span class="text-xs text-base-content/60">
                        {{ formatTimestamp(event.startAt) }}
                        <template v-if="event.numEntrants">
                          · {{ event.numEntrants }} Teilnehmer
                        </template>
                      </span>
                    </span>
                    <span
                      v-if="event.eventId === selectedEventId"
                      class="text-primary"
                    >
                      ✓
                    </span>
                  </button>
                </li>
              </ul>
              <div
                v-else-if="showSuggestions && normalizedQuery"
                class="absolute z-20 mt-1 w-full rounded-box border border-base-300 bg-base-100 p-4 text-sm text-base-content/60 shadow-lg"
              >
                Kein Event gefunden.
              </div>
            </div>
          </label>

          <div
            v-if="selectedEvent"
            class="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">Datum</div>
              <div class="mt-1 font-medium">
                {{ formatTimestamp(selectedEvent.startAt) }}
              </div>
            </div>
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">
                Teilnehmer
              </div>
              <div class="mt-1 font-medium">
                {{ selectedEvent.numEntrants ?? "n/a" }}
              </div>
            </div>
          </div>

          <Link
            v-if="selectedEvent"
            class="btn btn-primary btn-sm self-start"
            :href="`/events/${selectedEvent.eventId}`"
          >
            Turnierverlauf ansehen →
          </Link>

          <div v-if="selectedEvent" class="max-w-full overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th title="Laufende Nummer der Tabelle">
                    #
                  </th>
                  <th>Spieler</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="standing in pagedStandings"
                  :key="`${selectedEvent.eventId}-${standing.playerId}`"
                >
                  <td class="font-semibold">
                    {{ standing.rankPlacement }}
                    <span v-if="standing.rankPlacement <= 3" class="ml-2">
                      {{ getRankIcon(standing.rankPlacement) }}
                    </span>
                  </td>
                  <td>
                    <Link
                      class="link link-hover link-primary"
                      :href="`/participants/${encodeURIComponent(standing.playerId)}`"
                    >
                      {{ standing.displayName }}
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              v-if="eventPageCount > 1"
              class="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
            >
              <span class="text-sm text-base-content/60">
                Seite {{ eventPage }} von {{ eventPageCount }}
              </span>
              <div class="join shrink-0">
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  :disabled="eventPage <= 1"
                  @click="eventPage--"
                >
                  «
                </button>
                <template v-for="(page, index) in eventVisiblePages">
                  <button
                    v-if="page !== '…'"
                    :key="page"
                    type="button"
                    class="btn btn-sm join-item"
                    :class="{ 'btn-active': page === eventPage }"
                    @click="eventPage = page"
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
                  :disabled="eventPage >= eventPageCount"
                  @click="eventPage++"
                >
                  »
                </button>
              </div>
            </div>
          </div>

          <div
            v-else-if="!loading"
            class="rounded-xl border border-dashed border-base-300 p-8 text-sm text-base-content/60"
          >
            Aktuell ist kein Event verfügbar.
          </div>
        </div>
      </div>

      <div class="card min-w-0 bg-base-100 shadow-xl">
        <div class="card-body min-w-0">
          <div class="space-y-1">
            <h2 class="card-title">Ranking</h2>
            <p class="text-sm text-base-content/70">
              Sortiert nach durchschnittlicher Platzierung. Bei Gleichstand wird
              zunächst H2H berücksichtigt und dann die Anzahl teilgenommener
              Events.
            </p>
          </div>

          <div v-if="rankings" class="flex flex-wrap gap-2 self-start">
            <button
              type="button"
              class="btn btn-sm"
              :class="
                activeRankingTab === 'qualified' ? 'btn-primary' : 'btn-ghost'
              "
              @click="
                activeRankingTab = 'qualified';
                activePeriodTab = defaultPeriodKey(rankings.qualified);
              "
            >
              {{ rankings.qualified.label }}
            </button>
            <button
              type="button"
              class="btn btn-sm"
              :class="activeRankingTab === 'all' ? 'btn-primary' : 'btn-ghost'"
              @click="
                activeRankingTab = 'all';
                activePeriodTab = defaultPeriodKey(rankings.all);
              "
            >
              {{ rankings.all.label }}
            </button>
          </div>

          <div
            v-if="rankingPeriods.length > 0"
            class="flex flex-wrap gap-2 self-start"
          >
            <button
              v-for="period in rankingPeriods"
              :key="period.key"
              type="button"
              class="btn btn-sm"
              :class="
                activePeriodTab === period.key ? 'btn-secondary' : 'btn-ghost'
              "
              @click="activePeriodTab = period.key"
            >
              {{ period.label }}
            </button>
          </div>

          <div v-if="activeRanking" class="text-sm text-base-content/70">
            <span>
              Berücksichtigt werden
              {{
                activePeriod?.eventsConsidered ?? activeRanking.eventsConsidered
              }}
              Events
            </span>
            <span v-if="activeRanking.minimumEntrants !== null">
              mit mindestens {{ activeRanking.minimumEntrants }} Teilnehmern.
            </span>
            <span v-else>.</span>
            <span>
              Spieler benötigen mindestens
              {{ activeRanking.minimumAttendances }}
              Teilnahmen in dieser Kategorie.
            </span>
          </div>

          <div
            v-if="activePeriod && activePeriod.rows.length > 0"
            class="max-w-full overflow-x-auto"
          >
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Spieler [Anz. d. Teilnahmen]</th>
                  <th>Durchschnittliche Platzierung</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="player in pagedRows" :key="player.playerId">
                  <td class="font-semibold">
                    {{ player.rank }}
                    <span v-if="player.rank <= 3" class="ml-2">
                      {{ getRankIcon(player.rank) }}
                    </span>
                  </td>
                  <td>
                    <div class="flex items-center gap-2">
                      <Link
                        class="link link-hover link-primary break-words"
                        :href="`/participants/${encodeURIComponent(player.playerId)}`"
                      >
                        {{ player.displayName }}
                      </Link>
                      <span
                        class="badge badge-neutral badge-sm shrink-0 font-semibold tabular-nums"
                        title="Anzahl der Teilnahmen"
                      >
                        {{ player.attendances }}
                      </span>
                    </div>
                  </td>
                  <td>{{ formatAverage(player.averagePlacement) }}</td>
                </tr>
              </tbody>
            </table>

            <div
              v-if="pageCount > 1"
              class="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
            >
              <span class="text-sm text-base-content/60">
                Seite {{ currentPage }} von {{ pageCount }}
              </span>
              <div class="join shrink-0">
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  :disabled="currentPage <= 1"
                  @click="currentPage--"
                >
                  «
                </button>
                <template v-for="(page, index) in visiblePages">
                  <button
                    v-if="page !== '…'"
                    :key="page"
                    type="button"
                    class="btn btn-sm join-item"
                    :class="{ 'btn-active': page === currentPage }"
                    @click="currentPage = page"
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
                  :disabled="currentPage >= pageCount"
                  @click="currentPage++"
                >
                  »
                </button>
              </div>
            </div>
          </div>

          <div
            v-else-if="!loading"
            class="flex flex-col items-start gap-4 rounded-xl border border-dashed border-base-300 p-8 text-sm text-base-content/60"
          >
            <span>Noch kein Ranking verfügbar.</span>
            <button
              v-if="previousPeriod"
              type="button"
              class="btn btn-sm btn-secondary"
              @click="activePeriodTab = previousPeriod.key"
            >
              {{ previousPeriod.label }} anzeigen
            </button>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
td {
  min-width: 5rem;
}

/* start.gg-Button
 * Das offizielle Logo ist mehrfarbig (Blau/Pink), daher ein neutraler Button,
 * auf dem die Markenfarben in beiden Themes gut zur Geltung kommen:
 *   Light-Theme: dunkler Button, helle Schrift
 *   Dark-Theme:  weißer Button, dunkle Schrift
 */
.btn-startgg {
  background-color: #1b1f2a;
  border-color: #1b1f2a;
  color: #fff;
}

.btn-startgg:hover,
.btn-startgg:focus-visible {
  background-color: #2a3040;
  border-color: #2a3040;
}

@media (prefers-color-scheme: dark) {
  .btn-startgg {
    background-color: #ffffff;
    border-color: #ffffff;
    color: #1b1f2a;
  }

  .btn-startgg:hover,
  .btn-startgg:focus-visible {
    background-color: #e6e6e6;
    border-color: #e6e6e6;
  }
}
</style>
