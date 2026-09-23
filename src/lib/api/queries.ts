/**
 * React-Query-Hooks über apiGet. Query-Keys spiegeln den Pfad, damit sich
 * einzelne Ressourcen gezielt invalidieren lassen.
 */
import { useQuery } from "@tanstack/react-query";

import { useSeries } from "@/lib/series";

import { ApiError, apiGet, endpoints } from "./client";
import { fetchUpcomingEvent, type UpcomingEvent } from "./upcoming";
import type {
  EventDetail,
  RankingDescriptor,
  EventSummary,
  Meta,
  PlayerDetail,
  PlayerSummary,
  PowerRankingTable,
  QuarterlyRankingTable,
  RankedDay,
  RankingScope,
  RankingType,
} from "./types";

/**
 * Ein 404 ist eine Antwort, keine Störung — erneutes Fragen ändert daran
 * nichts. Alles ab 500 und Netzwerkabbrüche dürfen es nochmal versuchen.
 */
function retry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && !error.isRetryable) {
    return false;
  }

  return failureCount < 2;
}

/**
 * Der Katalog der Ranglisten: Beschriftungen, Bereiche und Regeln beider
 * Tabellen in einem Aufruf. Eine Tabelle selbst kennt nur den Bereich, den man
 * abgefragt hat — für die Umschalter braucht es aber alle Beschriftungen.
 *
 * Wie jede Ressource unter einer Reihe: der Slug steckt im Query-Key, sonst
 * zeigte der Umschalter nach dem Wechsel noch die Bereiche der vorigen.
 */
export function useRankingDescriptors() {
  const { series } = useSeries();

  return useQuery<RankingDescriptor[], ApiError>({
    queryKey: ["rankings", series.slug],
    queryFn: ({ signal }) =>
      apiGet<RankingDescriptor[]>(endpoints.rankings(series.slug), { signal }).then(
        (envelope) => envelope.data,
      ),
    // Ändert sich nur mit einem Deploy, nicht mit den Daten.
    staleTime: 60 * 60 * 1000,
    retry,
  });
}

/**
 * Die Umschalter einer Rangliste samt Vorgabe, in der Reihenfolge der API. Das
 * Power Ranking führt in v2 keine Bereiche mehr — dort bleibt die Liste leer.
 */
export function useScopes(type: RankingType) {
  const { data } = useRankingDescriptors();
  const descriptor = data?.find((entry) => entry.type === type);

  return {
    options: (descriptor?.scopes ?? []).map((scope) => ({
      key: scope.scope ?? "",
      label: scope.label ?? "",
    })),
    // Welche Wertungen eine Reihe führt, entscheidet /admin: ohne die
    // „6+ Teilnehmer"-Tabelle wäre `qualified` ein 404.
    defaultScope: descriptor?.defaultScope ?? undefined,
  };
}

/** Die Landing-Page-Tabelle: nach Ø Platzierung, aufgeteilt nach Quartalen. */
export function useQuarterlyRanking(scope: RankingScope | undefined) {
  const { series } = useSeries();

  return useQuery<QuarterlyRankingTable, ApiError>({
    queryKey: ["ranking", "quarterly", series.slug, scope ?? "default"],
    queryFn: ({ signal }) =>
      apiGet<QuarterlyRankingTable>(endpoints.quarterlyRanking(series.slug), {
        query: { scope },
        signal,
      }).then((envelope) => envelope.data),
    retry,
  });
}

/**
 * Power Ranking v2: jedes Event zählt, gewichtet danach, wie stark sein Feld
 * besetzt war, sortiert nach `score` (500 = Ligadurchschnitt). Kein Bereich,
 * keine Mindestteilnahmen, keine Mindestgröße.
 */
export function usePowerRanking() {
  const { series } = useSeries();

  return useQuery<PowerRankingTable, ApiError>({
    queryKey: ["ranking", "power", series.slug],
    queryFn: ({ signal }) =>
      apiGet<PowerRankingTable>(endpoints.powerRanking(series.slug), { signal }).then(
        (envelope) => envelope.data,
      ),
    retry,
  });
}

export function useEvents(limit = 50) {
  const { series } = useSeries();

  return useQuery<EventSummary[], ApiError>({
    queryKey: ["events", series.slug, limit],
    queryFn: ({ signal }) =>
      apiGet<EventSummary[]>(endpoints.events(series.slug), {
        query: { limit },
        signal,
      }).then((envelope) => envelope.data),
    retry,
  });
}

export function useEvent(eventId: number | undefined) {
  const { series } = useSeries();

  return useQuery<EventDetail, ApiError>({
    queryKey: ["event", series.slug, eventId],
    enabled: eventId !== undefined,
    queryFn: ({ signal }) =>
      apiGet<EventDetail>(endpoints.event(series.slug, eventId!), { signal }).then(
        (envelope) => envelope.data,
      ),
    retry,
  });
}

export function usePlayers(search?: string) {
  const { series } = useSeries();

  return useQuery<PlayerSummary[], ApiError>({
    queryKey: ["players", series.slug, search ?? ""],
    queryFn: ({ signal }) =>
      apiGet<PlayerSummary[]>(endpoints.players(series.slug), {
        query: { q: search || undefined },
        signal,
      }).then((envelope) => envelope.data),
    retry,
  });
}

export function usePlayer(playerId: string | undefined) {
  const { series } = useSeries();

  return useQuery<PlayerDetail, ApiError>({
    queryKey: ["player", series.slug, playerId],
    enabled: playerId !== undefined,
    queryFn: ({ signal }) =>
      apiGet<PlayerDetail>(endpoints.player(series.slug, playerId!), { signal }).then(
        (envelope) => envelope.data,
      ),
    retry,
  });
}

export function useRankedDay() {
  return useQuery<RankedDay, ApiError>({
    queryKey: ["ranked-day"],
    queryFn: ({ signal }) =>
      apiGet<RankedDay>(endpoints.rankedDay(), { signal }).then(
        (envelope) => envelope.data,
      ),
    // Der Countdown läuft mit der Uhr, deshalb hat dieser Endpunkt bewusst
    // keinen Validator und nur ein kurzes max-age.
    staleTime: 60_000,
    retry,
  });
}

/**
 * Der Anmeldestand des nächsten Turniers — die einzige Zahl der App, die nicht
 * aus /api/v2 kommt. Warum, steht in upcoming.ts.
 *
 * Anders als die importierten Daten bewegt sie sich unter der Woche, aber
 * langsam: ein Turner Tuesday füllt sich über Tage, nicht über Minuten. Die
 * fünf Minuten halten den 30-KB-Abruf entsprechend selten — beim Start des
 * Screens ist er trotzdem immer frisch.
 */
export function useUpcomingEvent() {
  const { series } = useSeries();

  return useQuery<UpcomingEvent | null, ApiError>({
    queryKey: ["upcoming-event", series.slug],
    queryFn: ({ signal }) => fetchUpcomingEvent(series.websitePath, { signal }),
    staleTime: 5 * 60 * 1000,
    retry,
  });
}

/**
 * Der billige Frischetest: `meta.dataVersion` ändert sich genau dann, wenn sich
 * die ausgelieferten Daten oder die deployte Version geändert haben.
 */
export function useDataVersion() {
  return useQuery<Meta, ApiError>({
    queryKey: ["meta"],
    queryFn: ({ signal }) =>
      apiGet<{ eventCount: number; playerCount: number }>(endpoints.meta(), {
        signal,
      }).then((envelope) => envelope.meta as Meta),
    retry,
  });
}
