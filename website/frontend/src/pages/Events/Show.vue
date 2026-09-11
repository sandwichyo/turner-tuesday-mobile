<script setup lang="ts">
import { computed, ref } from "vue";
import { Head, Link } from "@inertiajs/vue3";
import startggLogoUrl from "../../../public/startgg-logo.svg";
import { getCharacterStyle, getStockIconUrl } from "../../lib/characters";

type EventInfo = {
  eventId: number;
  eventName: string;
  eventSlug: string;
  tournamentName: string;
  tournamentSlug: string;
  startAt: number | null;
  numEntrants: number | null;
  label: string;
  startggUrl: string | null;
};

type CharacterPick = {
  characterId: number;
  characterName: string;
  games: number;
};

type SetSide = {
  playerId: string;
  displayName: string;
  score: number | null;
  characters: CharacterPick[];
};

type SetView = {
  setId: number;
  round: number | null;
  roundText: string | null;
  phaseName: string | null;
  sortOrder: number;
  displayScore: string | null;
  games: number;
  winner: SetSide;
  loser: SetSide;
};

type BracketRound = {
  key: string;
  label: string;
  phase: string | null;
  bracket: "winners" | "losers" | "other";
  stage: string;
  sets: SetView[];
};

/** Eine Zeile der Bracket-Ansicht: eine Runde, oder Winners und Losers eines Schritts. */
type BracketRow = {
  key: string;
  rounds: BracketRound[];
};

type StandingRow = {
  placement: number;
  rankPlacement: number;
  playerId: string;
  displayName: string;
};

const props = defineProps<{
  event: EventInfo | null;
  standings?: StandingRow[];
  rounds?: BracketRound[];
  totals?: { sets: number; games: number; players: number };
  error?: string | null;
}>();

const standings = computed(() => props.standings ?? []);
const rounds = computed(() => props.rounds ?? []);
const totals = computed(
  () => props.totals ?? { sets: 0, games: 0, players: 0 },
);

// Ein Spielername filtert den ganzen Baum auf dessen Sets — der schnellste Weg,
// den Weg eines Spielers durch das Turnier zu verfolgen.
const playerQuery = ref("");

const filteredRounds = computed<BracketRound[]>(() => {
  const query = playerQuery.value.trim().toLowerCase();
  if (!query) return rounds.value;

  return rounds.value
    .map((round) => ({
      ...round,
      sets: round.sets.filter(
        (set) =>
          set.winner.displayName.toLowerCase().includes(query) ||
          set.loser.displayName.toLowerCase().includes(query),
      ),
    }))
    .filter((round) => round.sets.length > 0);
});

const visibleSetCount = computed(() =>
  filteredRounds.value.reduce((sum, round) => sum + round.sets.length, 0),
);

// Winners und Losers desselben Bracket-Schritts (z. B. Winners Final und Losers
// Final) teilen sich eine Zeile: auf dem Desktop nebeneinander, auf dem Handy
// untereinander. Der Backend-Sortierung folgend steht Winners dabei immer
// zuerst — und damit mobil oben.
const bracketRows = computed<BracketRow[]>(() => {
  const rows: BracketRow[] = [];

  for (const round of filteredRounds.value) {
    const open = rows[rows.length - 1];
    const partner = open?.rounds.length === 1 ? open.rounds[0] : null;
    const pairable =
      partner !== null &&
      partner.stage === round.stage &&
      partner.bracket === "winners" &&
      round.bracket === "losers";

    if (pairable) {
      open.rounds.push(round);
    } else {
      rows.push({ key: round.key, rounds: [round] });
    }
  }

  return rows;
});

/** Sieger zuerst — so liest sich jede Karte wie eine Ergebniszeile. */
function sidesOf(set: SetView): (SetSide & { won: boolean })[] {
  return [
    { ...set.winner, won: true },
    { ...set.loser, won: false },
  ];
}

function characterStyle(name: string): Record<string, string> {
  const style = getCharacterStyle(name);
  return { backgroundColor: style.background, color: style.color };
}

/** Stock icon of a pick — `null` for a name we have no icon for. */
function stockIcon(name: string): string | null {
  return getStockIconUrl(name);
}

function characterLabel(character: CharacterPick): string {
  return character.games > 1
    ? `${character.characterName} ×${character.games}`
    : character.characterName;
}

function bracketLabel(bracket: BracketRound["bracket"]): string {
  if (bracket === "winners") return "Winners";
  if (bracket === "losers") return "Losers";
  return "";
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp * 1000).toLocaleDateString();
}

function getRankIcon(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}
</script>

<template>
  <Head
    :title="
      event ? `${event.label} · Turner Tuesdays` : 'Event · Turner Tuesdays'
    "
  />

  <main class="container mx-auto space-y-4 p-4 sm:space-y-6 sm:p-6">
    <section class="card bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div
          class="flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-center"
        >
          <div class="space-y-2">
            <Link class="btn btn-ghost btn-sm -ml-3" href="/">
              ← Zurück zur Übersicht
            </Link>
            <div>
              <h1 class="text-3xl font-bold">
                {{ event?.tournamentName ?? "Event" }}
              </h1>
              <p class="text-base-content/70">
                <template
                  v-if="event && event.eventName !== event.tournamentName"
                >
                  {{ event.eventName }} ·
                </template>
                Turnierverlauf und Endplatzierungen.
              </p>
            </div>
          </div>

          <a
            v-if="event?.startggUrl"
            :href="event.startggUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-startgg gap-2 self-stretch sm:btn-md lg:self-auto"
          >
            Auf start.gg ansehen
            <img :src="startggLogoUrl" alt="start.gg" class="h-5 w-5" />
          </a>
        </div>

        <div v-if="error" class="alert alert-error shadow-sm">
          <span>{{ error }}</span>
        </div>

        <template v-else-if="event">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">Datum</div>
              <div class="mt-1 font-medium">
                {{ formatTimestamp(event.startAt) }}
              </div>
            </div>
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">
                Teilnehmer
              </div>
              <div class="mt-1 font-medium">
                {{ event.numEntrants ?? totals.players }}
              </div>
            </div>
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">Sets</div>
              <div class="mt-1 font-medium">{{ totals.sets }}</div>
            </div>
            <div class="rounded-xl bg-base-200 p-4">
              <div class="text-xs uppercase text-base-content/50">Spiele</div>
              <div class="mt-1 font-medium">
                {{ totals.games > 0 ? totals.games : "n/a" }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section v-if="event" class="card bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div
          class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
        >
          <div>
            <h2 class="text-xl font-semibold">Turnierverlauf</h2>
            <p class="text-sm text-base-content/60">
              Jede Runde mit Ergebnis und den gewählten Charakteren.
            </p>
          </div>
          <label class="form-control w-full sm:max-w-xs">
            <input
              v-model="playerQuery"
              type="text"
              autocomplete="off"
              class="input input-bordered input-sm w-full"
              placeholder="Nach Spieler filtern …"
            />
          </label>
        </div>

        <div v-if="rounds.length === 0" class="alert">
          <span>
            Für dieses Event sind keine Sets gespeichert. Nach einem
            vollständigen Import erscheint hier der Turnierverlauf.
          </span>
        </div>

        <div
          v-else-if="visibleSetCount === 0"
          class="rounded-xl bg-base-200 p-6 text-center text-base-content/60"
        >
          Keine Sets für „{{ playerQuery }}“.
        </div>

        <div v-else class="space-y-6">
          <div
            v-for="row in bracketRows"
            :key="row.key"
            class="grid grid-cols-1 gap-6"
            :class="row.rounds.length > 1 ? 'lg:grid-cols-2' : ''"
          >
            <section
              v-for="round in row.rounds"
              :key="round.key"
              class="space-y-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-semibold">{{ round.label }}</h3>
                <span
                  v-if="round.bracket !== 'other'"
                  class="badge badge-sm"
                  :class="
                    round.bracket === 'winners' ? 'badge-success' : 'badge-warning'
                  "
                >
                  {{ bracketLabel(round.bracket) }}
                </span>
                <span v-if="round.phase" class="badge badge-ghost badge-sm">
                  {{ round.phase }}
                </span>
              </div>

              <div
                class="grid grid-cols-1 gap-3"
                :class="
                  row.rounds.length > 1
                    ? 'xl:grid-cols-2'
                    : 'lg:grid-cols-2 2xl:grid-cols-3'
                "
              >
                <article
                  v-for="set in round.sets"
                  :key="set.setId"
                  class="rounded-xl border border-base-300 bg-base-200/40 p-3"
                >
                  <div
                    v-if="set.winner.score === null && set.loser.score === null"
                    class="mb-2 truncate text-xs text-base-content/60"
                  >
                    {{ set.displayScore ?? "Ergebnis unbekannt" }}
                  </div>

                  <div class="space-y-1">
                    <div
                      v-for="side in sidesOf(set)"
                      :key="`${set.setId}-${side.playerId}`"
                      class="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5"
                      :class="side.won ? 'bg-success/10' : ''"
                    >
                      <div class="min-w-0 space-y-1">
                        <div class="flex items-center gap-2">
                          <span
                            v-if="side.won"
                            class="text-sm leading-none"
                            title="Sieger"
                            aria-label="Sieger"
                          >
                            👑
                          </span>
                          <Link
                            class="link link-hover truncate"
                            :class="
                              side.won
                                ? 'font-semibold'
                                : 'text-base-content/70'
                            "
                            :href="`/participants/${encodeURIComponent(side.playerId)}`"
                          >
                            {{ side.displayName }}
                          </Link>
                        </div>
                        <div
                          v-if="side.characters.length > 0"
                          class="flex flex-wrap items-center gap-1.5"
                        >
                          <span
                            v-for="character in side.characters"
                            :key="character.characterId"
                            class="flex items-center gap-1"
                            :title="characterLabel(character)"
                          >
                            <img
                              v-if="stockIcon(character.characterName)"
                              :src="stockIcon(character.characterName) ?? ''"
                              :alt="character.characterName"
                              class="h-5 w-5 shrink-0 object-contain"
                              loading="lazy"
                              decoding="async"
                            />
                            <span
                              v-else
                              class="badge badge-sm border-0"
                              :style="characterStyle(character.characterName)"
                            >
                              {{ character.characterName }}
                            </span>
                            <span
                              v-if="character.games > 1"
                              class="text-xs tabular-nums text-base-content/60"
                            >
                              ×{{ character.games }}
                            </span>
                          </span>
                        </div>
                      </div>
                      <span
                        class="shrink-0 font-mono text-lg"
                        :class="
                          side.won ? 'font-semibold' : 'text-base-content/60'
                        "
                      >
                        {{ side.score ?? "–" }}
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>

    <section v-if="event && standings.length > 0" class="card bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div>
          <h2 class="text-xl font-semibold">Endplatzierungen</h2>
          <p class="text-sm text-base-content/60">
            Platzierung wie auf start.gg, laufende Nummer über die gespeicherten
            Spieler.
          </p>
        </div>

        <div class="max-w-full overflow-x-auto">
          <table class="table table-zebra w-full">
            <thead>
              <tr>
                <th title="Laufende Nummer der Tabelle">#</th>
                <th>Spieler</th>
                <th>Platzierung</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="standing in standings"
                :key="`${event.eventId}-${standing.playerId}`"
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
                <td>{{ standing.placement }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* start.gg-Button — identisch zur Startseite: das Logo ist mehrfarbig, daher
 * ein neutraler Button, der in beiden Themes trägt. */
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
