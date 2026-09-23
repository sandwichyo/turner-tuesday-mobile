/**
 * Der Anmeldestand des nächsten Turniers einer Reihe.
 *
 * **Diese Zahl steht in keiner API-Version.** Die Event-Liste einer Reihe führt
 * nur importierte, bereits gespielte Events; ein Turnier taucht dort erst auf,
 * wenn es Ergebnisse hat. Die laufenden Anmeldungen liegen live bei start.gg
 * und werden serverseitig vom Web-Frontend geholt (UpcomingEventProvider).
 *
 * Hier wird genau dort angezapft: ein GET auf die Startseite der Reihe
 * (`/turner-tuesday` und so fort) mit dem Header `X-Inertia: true` liefert
 * statt der HTML-Seite deren Props als JSON, darin `upcomingEvent` in der
 * Form, die reference/Home.vue beschreibt.
 *
 * Das ist **kein zugesicherter Vertrag** — anders als /api/v2 darf sich das
 * jederzeit ändern, und mit der Abschaltung des alten Web-Frontends fällt es
 * ganz weg. Daraus folgt, wie diese Datei gebaut ist:
 *
 * - Der Zugriff steht isoliert hier und nicht in client.ts. Wenn die API den
 *   Endpunkt eines Tages selbst anbietet, wird genau diese Datei ersetzt; der
 *   Rest der App kennt nur `fetchUpcomingEvent` und den Typ darunter.
 * - Jede unerwartete Form ist ein `null`, kein Fehler: die Zahl ist ein Zusatz
 *   am Aufruf-Button. Fehlt sie, fehlt sie — der Screen steht trotzdem.
 * - Was sonst noch in der Antwort steht (Events, Ranglisten, Platzierungen),
 *   bleibt ungenutzt. Diese Daten kommen aus der versionierten API, und zwei
 *   Quellen für dieselbe Sache wären eine zu viel.
 *
 * Kostenpunkt: die Antwort trägt immer die vollständigen Props der Startseite,
 * rund 30 KB. Inertias Partial Reloads greifen nicht — das Backend berechnet
 * alle Props unbedingt —, und ein `X-Inertia-Version`-Header würde nach jedem
 * Deploy der Website ein 409 auslösen. Deshalb wird der Abruf selten gemacht
 * (siehe `useUpcomingEvent`), statt ihn kleiner rechnen zu wollen.
 */
import { ApiError, API_BASE_URL } from "./client";

export type UpcomingEvent = {
  eventId: number;
  name: string;
  tournamentName: string;
  /** Turnier- und Event-Name zusammen, wie `EventSummary.label` der API. */
  label: string;
  /** ISO-8601 wie überall sonst in der App; die Quelle liefert Unix-Sekunden. */
  startAt: string | null;
  numEntrants: number;
  /** Sitzplatzlimit; `null`, wenn das Turnier ohne Limit läuft. */
  capacity: number | null;
  startggUrl: string | null;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Aus dem Rohwert wird nur etwas, wenn Id und Anmeldezahl stimmen — ohne die
 * beiden gäbe es nichts anzuzeigen. Alles andere darf fehlen.
 */
function parse(raw: unknown): UpcomingEvent | null {
  if (raw === null || typeof raw !== "object") return null;

  const value = raw as Record<string, unknown>;

  const eventId = asNumber(value.eventId);
  const numEntrants = asNumber(value.numEntrants);
  if (eventId === null || numEntrants === null) return null;

  const name = asText(value.name) ?? "Melee 1VS1";
  const tournamentName = asText(value.tournamentName) ?? name;
  const startAtSeconds = asNumber(value.startAt);

  return {
    eventId,
    name,
    tournamentName,
    label: asText(value.label) ?? `${tournamentName} · ${name}`,
    startAt: startAtSeconds === null ? null : new Date(startAtSeconds * 1000).toISOString(),
    numEntrants,
    capacity: asNumber(value.capacity),
    startggUrl: asText(value.startggUrl),
  };
}

/**
 * `null`, wenn kein Turnier ansteht — oder wenn die Quelle etwas anderes
 * liefert als erwartet. Nur ein abgebrochener Abruf wird zum Fehler, damit
 * React Query ihn wiederholen kann.
 */
export async function fetchUpcomingEvent(
  websitePath: string,
  options: { signal?: AbortSignal } = {},
): Promise<UpcomingEvent | null> {
  let response: Response;
  try {
    response = await fetch(new URL(websitePath, API_BASE_URL).toString(), {
      headers: {
        Accept: "application/json",
        "X-Inertia": "true",
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: options.signal,
    });
  } catch {
    throw new ApiError("Keine Verbindung zur Website.", 0);
  }

  // Kein 404-Sonderfall: liefert die Seite etwas anderes als die Props, ist die
  // Zahl eben nicht zu haben — ein Fehlerzustand wäre hier zu viel Aufhebens.
  if (!response.ok) return null;

  try {
    const page = (await response.json()) as { props?: { upcomingEvent?: unknown } };

    return parse(page?.props?.upcomingEvent);
  } catch {
    return null;
  }
}
