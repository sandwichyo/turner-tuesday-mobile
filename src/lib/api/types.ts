/**
 * Lesbare Namen für die generierten Schema-Typen.
 *
 * schema.ts wird aus openapi/melee-v2.yaml erzeugt (`npm run gen:api`) und darf
 * nicht von Hand geändert werden. Alles andere importiert aus dieser Datei,
 * damit `components["schemas"]["PowerRankingRow"]` nicht durch die App wandert.
 */
import type { components } from "./schema";

type S = components["schemas"];

export type Meta = S["Meta"];
export type Pagination = S["Pagination"];
export type Problem = S["Problem"];
export type VersionInfo = S["VersionInfo"];

export type Series = S["Series"];
export type SeriesDetail = S["SeriesDetail"];

export type EventSummary = S["EventSummary"];
export type EventDetail = S["EventDetail"];
export type Standing = S["Standing"];
export type MeleeSet = S["Set"];
export type SetCharacterPick = S["SetCharacterPick"];
export type EventCharacterUsage = S["EventCharacterUsage"];

export type Character = S["Character"];
export type RankingDescriptor = S["RankingDescriptor"];

/**
 * Die beiden Tabellen haben in v2 verschiedene Formen: die Quartalswertung
 * sortiert nach Ø Platzierung, das Power Ranking nach `score`.
 */
export type QuarterlyRankingTable = S["QuarterlyRankingTable"];
export type QuarterlyRankingSection = S["QuarterlyRankingSection"];
export type QuarterlyRankingRow = S["QuarterlyRankingRow"];

export type PowerRankingTable = S["PowerRankingTable"];
export type PowerRankingSection = S["PowerRankingSection"];
export type PowerRankingRow = S["PowerRankingRow"];
export type PowerRankingEvent = S["PowerRankingEvent"];

export type PlayerSummary = S["PlayerSummary"];
export type PlayerDetail = S["PlayerDetail"];
export type RankedDay = S["RankedDay"];

/** Die beiden Ranglisten. Bereiche kennt in v2 nur noch die Quartalswertung. */
export type RankingType = "quarterly" | "power";
export type RankingScope = "qualified" | "all";

/** Jede Antwort der API ist `{data, meta}`; Fehler sind problem+json. */
export type Envelope<T> = {
  data: T;
  meta: Meta & { pagination?: Pagination };
};
