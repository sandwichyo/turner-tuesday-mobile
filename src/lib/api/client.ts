/**
 * HTTP-Zugriff auf die MeleeImNorden-API (read-only, unauthentifiziert).
 *
 * Zwei Eigenheiten des Vertrags bildet der Client direkt ab:
 *
 * - **Umschlag.** Erfolge sind `{data, meta}`, Fehler sind problem+json und
 *   eben *nicht* eingepackt. Unterschieden wird am Statuscode, nicht am Body.
 * - **Validatoren.** Jede Datenantwort trägt ein ETag. Wir legen es samt Body
 *   ab und schicken es als `If-None-Match` mit; ein 304 kommt ohne Body zurück
 *   und wird aus dem Cache bedient. Das spart auf Mobilfunk die Nutzlast, nicht
 *   den Roundtrip — den spart `meta.dataVersion` (siehe useDataVersion).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import type { Envelope, Problem } from "./types";

const DEFAULT_BASE_URL = "https://melee.sandwichyo.com";

export const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  DEFAULT_BASE_URL;

/** Die Version, auf die sich diese App festlegt. Siehe /api/versions. */
export const API_VERSION = "v1";

const CACHE_PREFIX = "api-cache:";

/**
 * Ein Fehler, den die API selbst beschrieben hat. `problem` ist gefüllt, wenn
 * der Server RFC-9457 geliefert hat — bei Netzwerkabbrüchen bleibt es leer.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly problem?: Problem;

  constructor(message: string, status: number, problem?: Problem) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  /** Ob ein erneuter Versuch überhaupt Sinn ergibt. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

type CacheEntry = { etag: string; body: string };

async function readCache(key: string): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  } catch {
    // Ein kaputter oder voller Cache darf den Request nicht verhindern.
    return null;
  }
}

async function writeCache(key: string, entry: CacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // dito — der Abruf war erfolgreich, nur das Ablegen nicht.
  }
}

/**
 * Ein GET auf die API. `path` ist absolut ab dem Host, z. B. "/api/v1/events".
 */
export async function apiGet<T>(
  path: string,
  options: { signal?: AbortSignal; query?: Record<string, string | number | undefined> } = {},
): Promise<Envelope<T>> {
  const url = new URL(path, API_BASE_URL);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const cacheKey = url.pathname + url.search;
  const cached = await readCache(cacheKey);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (cached) {
    headers["If-None-Match"] = cached.etag;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers, signal: options.signal });
  } catch (cause) {
    throw new ApiError(
      "Keine Verbindung zur API.",
      0,
      undefined,
    );
  }

  if (response.status === 304 && cached) {
    return JSON.parse(cached.body) as Envelope<T>;
  }

  if (!response.ok) {
    let problem: Problem | undefined;
    try {
      problem = (await response.json()) as Problem;
    } catch {
      // Kein problem+json — dann bleibt nur der Statuscode.
    }

    throw new ApiError(
      problem?.title ?? `API antwortete mit ${response.status}.`,
      response.status,
      problem,
    );
  }

  const body = await response.text();
  const etag = response.headers.get("ETag");
  if (etag) {
    await writeCache(cacheKey, { etag, body });
  }

  return JSON.parse(body) as Envelope<T>;
}

/** Pfad-Helfer, damit die Versionsvorsilbe an genau einer Stelle steht. */
export const endpoints = {
  versions: () => "/api/versions",
  meta: () => `/api/${API_VERSION}/meta`,
  events: () => `/api/${API_VERSION}/events`,
  event: (eventId: number) => `/api/${API_VERSION}/events/${eventId}`,
  rankings: () => `/api/${API_VERSION}/rankings`,
  ranking: (type: string) => `/api/${API_VERSION}/rankings/${type}`,
  players: () => `/api/${API_VERSION}/players`,
  player: (playerId: string) =>
    `/api/${API_VERSION}/players/${encodeURIComponent(playerId)}`,
  rankedDay: () => `/api/${API_VERSION}/ranked-day`,
} as const;
