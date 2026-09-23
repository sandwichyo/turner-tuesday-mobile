/**
 * Selbstprüfung für player-range.ts.
 *
 *   node --experimental-strip-types src/lib/player-range.check.ts
 *
 * Die Aussage, die zählt: ein voll aufgezogener Regler muss dasselbe ergeben
 * wie das Aggregat des Servers. Deshalb prüft der Lauf nicht gegen selbst
 * ausgedachte Zahlen, sondern holt einen echten Spieler von der API und
 * rechnet dessen Timeline über den vollen Bereich nach — stimmen Summen,
 * Reihenfolge und Rundung nicht mit `characters.top` und `headToHead`
 * überein, ist die Portierung falsch.
 *
 * Ohne Netz bricht der Lauf mit einem Hinweis ab, statt Erfolg zu melden.
 */
import assert from "node:assert/strict";

import { charactersInRange, h2hInRange } from "./player-range.ts";

const BASE = process.env.API_BASE_URL ?? "https://melee.sandwichyo.com";
const SERIES = "turner-tuesday";

async function get(path: string) {
  const response = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  assert.equal(response.status, 200, `${path} antwortete mit ${response.status}`);

  return (await response.json()).data;
}

// Der Spieler mit den meisten Teilnahmen hat die längste Timeline — und damit
// die meisten Gelegenheiten, dass Summe oder Sortierung auseinanderlaufen.
const roster = await get(`/api/v2/series/${SERIES}/players?sort=attendances&limit=1`);
const player = await get(
  `/api/v2/series/${SERIES}/players/${encodeURIComponent(roster[0].playerId)}`,
);

const characterTimeline = player.characters?.timeline ?? [];
const h2hTimeline = player.headToHead?.timeline ?? [];
assert.ok(characterTimeline.length > 1, "Timeline zu kurz für einen sinnvollen Vergleich");
assert.ok(h2hTimeline.length > 1, "H2H-Timeline zu kurz für einen sinnvollen Vergleich");

const empty = { total: 0, top: [] };
const characters = charactersInRange(
  characterTimeline,
  { from: 0, to: characterTimeline.length - 1 },
  empty,
);

assert.deepEqual(
  characters.total,
  player.characters.totalSelections,
  "Summe der Charakterwahlen weicht vom Aggregat ab",
);
assert.deepEqual(
  characters.top.map((c) => [c.characterName, c.count, c.percentage]),
  player.characters.top.map((c) => [c.characterName, c.count, c.percentage]),
  "Charakterliste weicht vom Aggregat ab",
);

const h2h = h2hInRange(
  h2hTimeline,
  { from: 0, to: h2hTimeline.length - 1 },
  { wins: 0, losses: 0, opponents: [] },
);

assert.deepEqual(
  [h2h.wins, h2h.losses],
  [player.headToHead.summary.wins, player.headToHead.summary.losses],
  "H2H-Bilanz weicht vom Aggregat ab",
);
assert.deepEqual(
  h2h.opponents.map((o) => [o.playerId, o.wins, o.losses, o.totalSets, o.winRate]),
  player.headToHead.opponents.map((o) => [o.playerId, o.wins, o.losses, o.totalSets, o.winRate]),
  "Gegnerliste weicht vom Aggregat ab",
);

// Ein echter Ausschnitt darf nie mehr enthalten als das Ganze.
const half = h2hInRange(
  h2hTimeline,
  { from: 0, to: Math.floor((h2hTimeline.length - 1) / 2) },
  { wins: 0, losses: 0, opponents: [] },
);
assert.ok(half.wins <= h2h.wins && half.losses <= h2h.losses, "Ausschnitt größer als das Ganze");

// `null` rechnet nicht, sondern reicht durch.
assert.equal(charactersInRange(characterTimeline, null, empty), empty);

console.log(
  `ok — ${player.displayName}: ${characters.top.length} Charaktere, ${h2h.opponents.length} Gegner,`,
  `${h2h.wins}-${h2h.losses} Sets über ${h2hTimeline.length} Events`,
);
