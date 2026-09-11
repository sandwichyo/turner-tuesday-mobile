/**
 * Gruppiert die Sets eines Events zurück in die Runden des Brackets.
 *
 * Portiert aus backend/src/Service/Event/EventDetailBuilder.php. Im Web macht
 * das der Controller, die API liefert unter /api/v1/events/{id} aber ein
 * flaches `sets[]` — also muss es hier passieren.
 *
 * Zwei Anpassungen gegenüber der PHP-Fassung:
 *
 * - Das Feld heißt in der API `phase`, intern hieß es `phaseName`.
 * - `sortOrder` gibt es in der API nicht. Der Vertrag sagt zu, die Sets „in the
 *   bracket order start.gg played them" zu liefern — der Array-Index tritt
 *   deshalb an seine Stelle. Er wird genauso verwendet: als Reihenfolge
 *   innerhalb einer Runde und als Stichentscheid zwischen sonst gleichrangigen
 *   Runden.
 *
 * Die Runden kommen in der Reihenfolge heraus, in der die Seite sie von oben
 * nach unten liest — das letzte Set des Turniers zuerst, die Pools zuletzt.
 * Winners und Losers desselben Schritts teilen sich einen `stage`, worüber sie
 * die Seite nebeneinander stellt.
 */
import type { MeleeSet, SetCharacterPick } from "./api/types";

const UNKNOWN_ROUND_LABEL = "Weitere Sets";

/**
 * Die benannten Schritte eines Brackets, von oben nach unten. Winners und
 * Losers eines Schritts teilen den Stage-Schlüssel — das ist es, was sie in
 * eine Zeile paart.
 */
const STAGE_RANKS: Record<string, number> = {
  "grand-final-reset": 0,
  "grand-final": 1,
  final: 2,
  "semi-final": 3,
  "quarter-final": 4,
};

/** Nummerierte Bracket-Runden ("Winners Round 2"), späteste zuerst. */
const RANK_BRACKET_ROUND = 5;
/** Alles, was start.gg benannt hat und wir nicht wiedererkennen. */
const RANK_OTHER = 6;
/** Pools ("Round 1"), unterhalb des Brackets, höchste Runde zuerst. */
const RANK_POOLS = 7;
/** Sets ganz ohne Runde. */
const RANK_UNKNOWN = 8;

/** Winners über Losers, wann immer beide Seiten in derselben Zeile sitzen. */
const BRACKET_ORDER: Record<BracketSide, number> = { winners: 0, losers: 1, other: 2 };

export type BracketSide = "winners" | "losers" | "other";

export type SetSide = {
  playerId: string;
  displayName: string;
  score: number | null;
  characters: { characterId: number; characterName: string; games: number }[];
};

export type SetView = {
  setId: number;
  round: number | null;
  roundText: string | null;
  phase: string | null;
  sortOrder: number;
  displayScore: string | null;
  games: number;
  winner: SetSide;
  loser: SetSide;
};

export type BracketRound = {
  key: string;
  label: string;
  phase: string | null;
  bracket: BracketSide;
  stage: string;
  sets: SetView[];
};

/** Eine Zeile der Bracket-Ansicht: eine Runde, oder Winners und Losers eines Schritts. */
export type BracketRow = {
  key: string;
  rounds: BracketRound[];
};

export type EventTotals = { sets: number; games: number; players: number };

type Placement = { stage: string; rank: number; tiebreak: number; pools: boolean };

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed !== "" ? trimmed : null;
}

/** Kleingeschrieben, Satzzeichen raus — "Semi-Final" und "Semi Final" sind ein Name. */
function normalizeRoundText(roundText: string): string {
  return roundText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPoolsPhase(phase: string | null): boolean {
  return phase !== null && phase.toLowerCase().includes("pool");
}

/** Welche Hälfte eines Double-Elimination-Brackets eine Runde betrifft. */
function bracketSide(round: number | null): BracketSide {
  if (round === null || round === 0) return "other";

  return round > 0 ? "winners" : "losers";
}

/**
 * Wo eine Runde auf der Seite hingehört. `rank` und `tiebreak` sortieren die
 * Runden vom Grand Final hinunter zu den Pools; `stage` teilen sich die
 * Winners- und die Losers-Runde desselben Bracket-Schritts.
 */
function placeRound(phase: string | null, roundText: string | null, sortOrder: number): Placement {
  if (roundText === null) {
    return { stage: `unknown|${phase ?? ""}`, rank: RANK_UNKNOWN, tiebreak: sortOrder, pools: false };
  }

  // "Winners Semi-Final" und "Losers Semi-Final" sind derselbe Schritt des
  // Brackets, deshalb fällt die Seite weg, bevor der Schritt benannt wird.
  let text = normalizeRoundText(roundText);
  let side: string | null = null;

  const sideMatch = /^(winners|losers)(?: bracket)? (.+)$/.exec(text);
  if (sideMatch) {
    side = sideMatch[1];
    text = sideMatch[2];
  }

  const stage = ((): string | null => {
    switch (text) {
      case "grand final reset":
        return "grand-final-reset";
      case "grand final":
        return "grand-final";
      case "final":
      case "finals":
        return "final";
      case "semi final":
      case "semi finals":
      case "semis":
        return "semi-final";
      case "quarter final":
      case "quarter finals":
      case "quarters":
        return "quarter-final";
      default:
        return null;
    }
  })();

  if (stage !== null) {
    return { stage, rank: STAGE_RANKS[stage], tiebreak: 0, pools: false };
  }

  const roundMatch = /^round (\d+)$/.exec(text);
  const round = roundMatch ? Number(roundMatch[1]) : null;

  // Ein blankes "Round 3" ist eine Pool; erst eine Seite macht daraus eine
  // Bracket-Runde.
  if (side === null && (round !== null || isPoolsPhase(phase))) {
    return {
      stage: `pools|${phase ?? ""}|${roundText}`,
      rank: RANK_POOLS,
      tiebreak: round !== null ? -round : sortOrder,
      pools: true,
    };
  }

  if (round !== null) {
    return { stage: `round-${round}`, rank: RANK_BRACKET_ROUND, tiebreak: -round, pools: false };
  }

  return {
    stage: `other|${phase ?? ""}|${roundText}`,
    rank: RANK_OTHER,
    tiebreak: sortOrder,
    pools: false,
  };
}

function side(
  playerId: string,
  displayName: string,
  score: number | null,
  charactersByPlayer: Record<string, SetSide["characters"]>,
): SetSide {
  return {
    playerId,
    displayName: displayName !== "" ? displayName : "Unknown player",
    score,
    characters: charactersByPlayer[playerId] ?? [],
  };
}

function buildSet(set: MeleeSet, sortOrder: number): SetView {
  const charactersByPlayer: Record<string, SetSide["characters"]> = {};

  for (const pick of (set.characters ?? []) as SetCharacterPick[]) {
    const playerId = String(pick.playerId ?? "");
    (charactersByPlayer[playerId] ??= []).push({
      characterId: pick.characterId ?? 0,
      characterName: pick.characterName ?? "",
      games: pick.games ?? 0,
    });
  }

  const winnerScore = typeof set.winnerScore === "number" ? set.winnerScore : null;
  const loserScore = typeof set.loserScore === "number" ? set.loserScore : null;

  return {
    setId: set.setId ?? 0,
    round: typeof set.round === "number" ? set.round : null,
    roundText: nullableString(set.roundText),
    phase: nullableString(set.phase),
    sortOrder,
    displayScore: nullableString(set.displayScore),
    games: winnerScore !== null && loserScore !== null ? winnerScore + loserScore : 0,
    winner: side(
      String(set.winnerPlayerId ?? ""),
      String(set.winnerName ?? ""),
      winnerScore,
      charactersByPlayer,
    ),
    loser: side(
      String(set.loserPlayerId ?? ""),
      String(set.loserName ?? ""),
      loserScore,
      charactersByPlayer,
    ),
  };
}

/** Vergleich über [rank, tiebreak, Bracket-Seite, Reihenfolge] — wie das `<=>` der PHP-Fassung. */
function compareRounds(
  left: BracketRound & { rank: number; tiebreak: number; order: number },
  right: BracketRound & { rank: number; tiebreak: number; order: number },
): number {
  return (
    left.rank - right.rank ||
    left.tiebreak - right.tiebreak ||
    BRACKET_ORDER[left.bracket] - BRACKET_ORDER[right.bracket] ||
    left.order - right.order
  );
}

/** Die Sets eines Events in seine Runden gruppiert, samt Summen. */
export function buildBracket(sets: MeleeSet[], playerCount: number): {
  rounds: BracketRound[];
  totals: EventTotals;
} {
  type Group = BracketRound & { rank: number; tiebreak: number; order: number };

  const groups = new Map<string, Group>();
  let games = 0;

  sets.forEach((set, index) => {
    const view = buildSet(set, index);
    games += view.games;

    const key = `${view.phase ?? ""}|${view.roundText ?? ""}`;
    let group = groups.get(key);

    if (!group) {
      const place = placeRound(view.phase, view.roundText, view.sortOrder);

      group = {
        key,
        label: view.roundText ?? UNKNOWN_ROUND_LABEL,
        phase: view.phase,
        // Eine Pool hat keine Winners- oder Losers-Seite, was start.gg' s
        // Rundennummer auch sagen mag.
        bracket: place.pools ? "other" : bracketSide(view.round),
        stage: place.stage,
        rank: place.rank,
        tiebreak: place.tiebreak,
        order: view.sortOrder,
        sets: [],
      };
      groups.set(key, group);
    }

    // Innerhalb einer Runde entscheidet die Reihenfolge der API; das früheste
    // Set entscheidet außerdem, wo zwei sonst gleichrangige Runden sitzen.
    group.order = Math.min(group.order, view.sortOrder);
    group.sets.push(view);
  });

  const rounds = [...groups.values()].sort(compareRounds).map((group) => ({
    key: group.key,
    label: group.label,
    phase: group.phase,
    bracket: group.bracket,
    stage: group.stage,
    sets: [...group.sets].sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return { rounds, totals: { sets: sets.length, games, players: playerCount } };
}

/**
 * Winners und Losers desselben Bracket-Schritts teilen sich eine Zeile. Der
 * Sortierung folgend steht Winners dabei immer zuerst — und damit auf dem
 * Telefon oben.
 */
export function toBracketRows(rounds: BracketRound[]): BracketRow[] {
  const rows: BracketRow[] = [];

  for (const round of rounds) {
    const open = rows[rows.length - 1];
    const partner = open?.rounds.length === 1 ? open.rounds[0] : null;
    const pairable =
      partner !== null &&
      partner.stage === round.stage &&
      partner.bracket === "winners" &&
      round.bracket === "losers";

    if (pairable && open) {
      open.rounds.push(round);
    } else {
      rows.push({ key: round.key, rounds: [round] });
    }
  }

  return rows;
}
