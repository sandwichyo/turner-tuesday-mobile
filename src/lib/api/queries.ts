/**
 * React-Query-Hooks über apiGet. Query-Keys spiegeln den Pfad, damit sich
 * einzelne Ressourcen gezielt invalidieren lassen.
 */
import { useQuery } from "@tanstack/react-query";

import { ApiError, apiGet, endpoints } from "./client";
import type {
  EventDetail,
  RankingDescriptor,
  EventSummary,
  Meta,
  PlayerDetail,
  PlayerSummary,
  RankedDay,
  RankingScope,
  RankingTable,
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
 * Der Index der Ranglisten: Beschriftungen und Regeln beider Bereiche in einem
 * Aufruf. Die Tabellen selbst kennen nur den Bereich, den man abgefragt hat —
 * für die Umschalter braucht es aber beide Beschriftungen.
 */
export function useRankingDescriptors() {
  return useQuery<RankingDescriptor[], ApiError>({
    queryKey: ["rankings"],
    queryFn: ({ signal }) =>
      apiGet<RankingDescriptor[]>(endpoints.rankings(), { signal }).then(
        (envelope) => envelope.data,
      ),
    // Ändert sich nur mit einem Deploy, nicht mit den Daten.
    staleTime: 60 * 60 * 1000,
    retry,
  });
}

/** Die Umschalter-Beschriftungen einer Rangliste, in der Reihenfolge der API. */
export function useScopeOptions(type: RankingType) {
  const { data } = useRankingDescriptors();
  const descriptor = data?.find((entry) => entry.type === type);

  return (descriptor?.scopes ?? []).map((scope) => ({
    key: scope.scope ?? "",
    label: scope.label ?? "",
  }));
}

export function useRanking(type: RankingType, scope: RankingScope) {
  return useQuery<RankingTable, ApiError>({
    queryKey: ["ranking", type, scope],
    queryFn: ({ signal }) =>
      apiGet<RankingTable>(endpoints.ranking(type), {
        query: { scope },
        signal,
      }).then((envelope) => envelope.data),
    retry,
  });
}

export function useEvents(limit = 50) {
  return useQuery<EventSummary[], ApiError>({
    queryKey: ["events", limit],
    queryFn: ({ signal }) =>
      apiGet<EventSummary[]>(endpoints.events(), {
        query: { limit },
        signal,
      }).then((envelope) => envelope.data),
    retry,
  });
}

export function useEvent(eventId: number | undefined) {
  return useQuery<EventDetail, ApiError>({
    queryKey: ["event", eventId],
    enabled: eventId !== undefined,
    queryFn: ({ signal }) =>
      apiGet<EventDetail>(endpoints.event(eventId!), { signal }).then(
        (envelope) => envelope.data,
      ),
    retry,
  });
}

export function usePlayers(search?: string) {
  return useQuery<PlayerSummary[], ApiError>({
    queryKey: ["players", search ?? ""],
    queryFn: ({ signal }) =>
      apiGet<PlayerSummary[]>(endpoints.players(), {
        query: { q: search || undefined },
        signal,
      }).then((envelope) => envelope.data),
    retry,
  });
}

export function usePlayer(playerId: string | undefined) {
  return useQuery<PlayerDetail, ApiError>({
    queryKey: ["player", playerId],
    enabled: playerId !== undefined,
    queryFn: ({ signal }) =>
      apiGet<PlayerDetail>(endpoints.player(playerId!), { signal }).then(
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
