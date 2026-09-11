/**
 * Lesbare Namen für die generierten Schema-Typen.
 *
 * schema.ts wird aus openapi/melee-v1.yaml erzeugt (`npm run gen:api`) und darf
 * nicht von Hand geändert werden. Alles andere importiert aus dieser Datei,
 * damit `components["schemas"]["RankingRow"]` nicht durch die App wandert.
 */
import type { components } from "./schema";

type S = components["schemas"];

export type Meta = S["Meta"];
export type Pagination = S["Pagination"];
export type Problem = S["Problem"];
export type VersionInfo = S["VersionInfo"];

export type EventSummary = S["EventSummary"];
export type EventDetail = S["EventDetail"];
export type Standing = S["Standing"];
export type MeleeSet = S["Set"];
export type SetCharacterPick = S["SetCharacterPick"];
export type EventCharacterUsage = S["EventCharacterUsage"];

export type Character = S["Character"];
export type RankingDescriptor = S["RankingDescriptor"];
export type RankingTable = S["RankingTable"];
export type RankingSection = S["RankingSection"];
export type RankingPeriod = S["RankingPeriod"];
export type RankingRow = S["RankingRow"];

export type PlayerSummary = S["PlayerSummary"];
export type PlayerDetail = S["PlayerDetail"];
export type RankedDay = S["RankedDay"];

/** Die beiden Ranglisten und ihre Auswahl — v1 kennt genau diese Werte. */
export type RankingType = "quarterly" | "power";
export type RankingScope = "qualified" | "all";

/** Jede Antwort der API ist `{data, meta}`; Fehler sind problem+json. */
export type Envelope<T> = {
  data: T;
  meta: Meta & { pagination?: Pagination };
};
