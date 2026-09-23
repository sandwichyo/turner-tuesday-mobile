/**
 * Charakter- und H2H-Statistik über einen Ausschnitt der Timeline.
 *
 * Die API liefert beides doppelt: einmal als fertiges Aggregat über alle Events
 * und einmal je Event (`characters.timeline`, `headToHead.timeline`). Der
 * Zeitraum-Regler der Spieler-Detail-Ansicht greift auf die Timeline zu und
 * rechnet den Ausschnitt hier nach — portiert aus `rangedCharacters` und
 * `rangedH2h` in frontend/src/pages/Participants/Show.vue.
 *
 * Reihenfolge und Rundung folgen dem Server (RankingCalculator), damit ein voll
 * aufgezogener Regler dieselbe Liste ergibt wie das Aggregat. Genau das prüft
 * player-range.check.ts.
 *
 * `null` als Bereich heißt „alles" — dann wird gar nicht gerechnet, sondern das
 * Aggregat durchgereicht.
 */
import type { Character, PlayerDetail } from "./api/types";

export type TimeRange = { from: number; to: number };

type Head2Head = NonNullable<PlayerDetail["headToHead"]>;
export type Opponent = NonNullable<Head2Head["opponents"]>[number];
type H2hTimeline = NonNullable<Head2Head["timeline"]>;
type CharacterTimeline = NonNullable<NonNullable<PlayerDetail["characters"]>["timeline"]>;

/** Ein Anteil in Prozent, auf eine Nachkommastelle — wie der Server rundet. */
function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function within<T>(entries: T[], range: TimeRange | null): T[] {
  return range === null ? entries : entries.slice(range.from, range.to + 1);
}

export function charactersInRange(
  timeline: CharacterTimeline,
  range: TimeRange | null,
  fallback: { total: number; top: Character[] },
): { total: number; top: Character[] } {
  if (range === null || timeline.length === 0) return fallback;

  const counts = new Map<string, Character>();
  let total = 0;

  for (const entry of within(timeline, range)) {
    for (const character of entry.characters ?? []) {
      const name = character.characterName ?? "";
      const existing = counts.get(name);

      if (existing) {
        existing.count = (existing.count ?? 0) + (character.count ?? 0);
      } else {
        counts.set(name, {
          characterId: character.characterId,
          characterName: name,
          count: character.count ?? 0,
          percentage: 0,
        });
      }

      total += character.count ?? 0;
    }
  }

  const top = [...counts.values()]
    .map((character) => ({ ...character, percentage: share(character.count ?? 0, total) }))
    .sort(
      (left, right) =>
        (right.count ?? 0) - (left.count ?? 0) ||
        (left.characterName ?? "").localeCompare(right.characterName ?? ""),
    );

  return { total, top };
}

export function h2hInRange(
  timeline: H2hTimeline,
  range: TimeRange | null,
  fallback: { wins: number; losses: number; opponents: Opponent[] },
): { wins: number; losses: number; opponents: Opponent[] } {
  if (range === null || timeline.length === 0) return fallback;

  const byOpponent = new Map<string, Opponent>();
  let wins = 0;
  let losses = 0;

  for (const entry of within(timeline, range)) {
    for (const opponent of entry.opponents ?? []) {
      const id = opponent.playerId ?? "";
      let existing = byOpponent.get(id);

      if (!existing) {
        // Älteste Schreibweise gewinnt — wie beim Server, der den Namen beim
        // ersten Zusammentreffen festhält.
        existing = {
          playerId: id,
          displayName: opponent.displayName,
          wins: 0,
          losses: 0,
          totalSets: 0,
          winRate: 0,
        };
        byOpponent.set(id, existing);
      }

      existing.wins = (existing.wins ?? 0) + (opponent.wins ?? 0);
      existing.losses = (existing.losses ?? 0) + (opponent.losses ?? 0);
      wins += opponent.wins ?? 0;
      losses += opponent.losses ?? 0;
    }
  }

  const opponents = [...byOpponent.values()]
    .map((opponent) => {
      const totalSets = (opponent.wins ?? 0) + (opponent.losses ?? 0);

      return { ...opponent, totalSets, winRate: share(opponent.wins ?? 0, totalSets) };
    })
    .sort(
      (left, right) =>
        (right.totalSets ?? 0) - (left.totalSets ?? 0) ||
        (right.wins ?? 0) - (left.wins ?? 0) ||
        (left.losses ?? 0) - (right.losses ?? 0) ||
        (left.displayName ?? "").localeCompare(right.displayName ?? "", undefined, {
          sensitivity: "base",
          numeric: true,
        }),
    );

  return { wins, losses, opponents };
}
