/**
 * Slippis „Free Ranked Day": alle vier Tage steht Ranked 24 Stunden lang allen
 * offen. Der Takt liegt fest und hängt an einem bekannten Fenster — deshalb
 * rechnet die App ihn selbst aus, statt den Countdown am Netz hängen zu lassen.
 *
 * Portiert aus reference/useRankedDay.ts, mit einem Unterschied: dort standen
 * Anker, Takt und Dauer als Konstanten im Code und mussten von Hand mit dem
 * Backend synchron gehalten werden. Hier sind sie nur der Notnagel — maßgeblich
 * ist `schedule` aus /api/v2/ranked-day, das genau dafür im Vertrag steht
 * („The `schedule` block is enough to keep counting down offline").
 */
import type { RankedDay } from "./api/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Der Takt in der Form, in der ihn die API beschreibt. */
export type RankedDaySchedule = {
  /** Beginn eines bekannten Fensters; alles Weitere zählt von hier. */
  anchorMs: number;
  cycleDays: number;
  durationHours: number;
};

/**
 * Der Takt, wie er seit 2024 gilt. Er greift, solange keine Antwort da ist oder
 * wenn sie ein Feld auslässt: beim ersten Start ohne Netz zählt die App damit
 * trotzdem richtig, statt gar nichts zu zeigen.
 */
export const FALLBACK_SCHEDULE: RankedDaySchedule = {
  anchorMs: Date.UTC(2024, 3, 15, 8, 0, 0), // 2024-04-15 08:00 UTC
  cycleDays: 4,
  durationHours: 24,
};

/** Jedes Feld der Antwort ist optional — und ein Takt von 0 Tagen teilt durch null. */
function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function scheduleFrom(data: RankedDay | undefined): RankedDaySchedule {
  const anchorMs = data?.schedule?.anchor ? Date.parse(data.schedule.anchor) : NaN;

  return {
    anchorMs: Number.isNaN(anchorMs) ? FALLBACK_SCHEDULE.anchorMs : anchorMs,
    cycleDays: positive(data?.schedule?.cycleDays, FALLBACK_SCHEDULE.cycleDays),
    durationHours: positive(data?.schedule?.durationHours, FALLBACK_SCHEDULE.durationHours),
  };
}

export type RankedDayWindow = {
  /** Ob gerade ein Fenster läuft. */
  active: boolean;
  /** Das laufende Fenster — oder das nächste, sobald das laufende vorbei ist. */
  startsAt: Date;
  endsAt: Date;
  /** Bis das laufende Fenster endet, sonst bis das nächste beginnt. */
  remainingMs: number;
};

export function evaluateRankedDay(
  nowMs: number,
  schedule: RankedDaySchedule = FALLBACK_SCHEDULE,
): RankedDayWindow {
  const cycleMs = schedule.cycleDays * DAY_MS;
  const durationMs = schedule.durationHours * HOUR_MS;

  // Math.floor, keine abschneidende Division: Momente vor dem Anker gehören in
  // das Fenster davor und nicht in das danach.
  const index = Math.floor((nowMs - schedule.anchorMs) / cycleMs);

  let start = schedule.anchorMs + index * cycleMs;
  const active = nowMs < start + durationMs;

  if (!active) start += cycleMs;

  const end = start + durationMs;

  return {
    active,
    startsAt: new Date(start),
    endsAt: new Date(end),
    remainingMs: Math.max(0, (active ? end : start) - nowMs),
  };
}

/**
 * Die nächsten Startzeitpunkte ab `nowMs`.
 *
 * Für die Erinnerungen: niemand ruft von außen an, also legt die App mehrere
 * Fenster auf einmal in die Warteschlange des Systems (lib/notifications.tsx).
 * Läuft gerade eines, liegt dessen Start in der Vergangenheit — gezählt wird
 * dann ab dem nächsten.
 */
export function upcomingStarts(
  nowMs: number,
  count: number,
  schedule: RankedDaySchedule = FALLBACK_SCHEDULE,
): Date[] {
  const cycleMs = schedule.cycleDays * DAY_MS;
  const current = evaluateRankedDay(nowMs, schedule);
  const first = current.startsAt.getTime() + (current.active ? cycleMs : 0);

  return Array.from({ length: count }, (_, index) => new Date(first + index * cycleMs));
}

/**
 * Um wie viel die Geräteuhr von der des Servers abweicht, in Millisekunden.
 *
 * Der Countdown läuft lokal — auf einer falsch gestellten Uhr zählt er also
 * zuverlässig das Falsche. Die Antwort trägt beides, was den Abgleich erlaubt:
 * die Grenze des Fensters und die Sekunden bis dahin. Ihre Differenz zu dem
 * Zeitpunkt, an dem die Antwort ankam, ist der Versatz.
 *
 * Unterhalb von TOLERANCE_MS bleibt er ungenutzt: Laufzeit und die
 * Sekundenauflösung von `secondsRemaining` erzeugen ein Rauschen von wenigen
 * Sekunden, und ein bei jedem Abruf leicht springender Countdown wäre schlechter
 * als eine um zwei Sekunden danebenliegende Anzeige.
 */
const TOLERANCE_MS = 30_000;

export function clockOffset(data: RankedDay | undefined, receivedAtMs: number): number {
  if (!data || typeof data.active !== "boolean" || data.secondsRemaining == null) return 0;
  if (!receivedAtMs) return 0;

  const boundary = data.active ? data.endsAt : data.startsAt;
  const boundaryMs = boundary ? Date.parse(boundary) : NaN;
  if (Number.isNaN(boundaryMs)) return 0;

  const offset = boundaryMs - data.secondsRemaining * 1000 - receivedAtMs;

  return Math.abs(offset) > TOLERANCE_MS ? offset : 0;
}

/**
 * „5 Std. 12 Min." — die größten zwei Einheiten, die noch etwas aussagen. Tage
 * tauchen nur beim Warten auf das nächste Fenster auf (die Lücke ist bis zu
 * drei Tage lang) und stehen im Dativ, den das „in …" davor verlangt.
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tagen"} ${hours} Std.`;
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  if (minutes > 0) return `${minutes} Min. ${seconds} Sek.`;

  return `${seconds} Sek.`;
}

function formatMoment(date: Date): string {
  return date.toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWindow(window: RankedDayWindow): string {
  return `${formatMoment(window.startsAt)} – ${formatMoment(window.endsAt)} Uhr`;
}

/** Ein Satz, der ohne weiteren Kontext trägt — für Screenreader und Tooltip. */
export function statusLabel(window: RankedDayWindow): string {
  const remaining = formatRemaining(window.remainingMs);

  return window.active
    ? `Ranked Day läuft noch ${remaining}`
    : `Ranked Day startet in ${remaining}`;
}
