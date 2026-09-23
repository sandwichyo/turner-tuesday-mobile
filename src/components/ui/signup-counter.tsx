/**
 * Der Anmeldestand am Aufruf-Button, portiert aus Home.vue: „Anmeldungen 7/8".
 *
 * Die Ampel benutzt dieselben Farbrollen wie die Legende im Power Ranking
 * (success / warning / error), damit beide Seiten dasselbe Vokabular sprechen.
 *
 * Eine Abweichung vom Web, und zwar eine notwendige: dort trägt ein `title`
 * die ausgeschriebene Fassung — „nur noch 1 Platz frei" —, damit die Farbe die
 * Information nicht allein tragen muss. Ein Tooltip existiert auf dem Handy
 * nicht. Der Hinweis steht deshalb sichtbar daneben, sobald es eng wird; der
 * ganze Satz geht wie im Web zusätzlich an den Screenreader.
 *
 * Woher die Zahl kommt und warum sie in keiner API-Version steht: upcoming.ts.
 */
import { Text, View } from "react-native";

import { useUpcomingEvent } from "@/lib/api/queries";
import type { UpcomingEvent } from "@/lib/api/upcoming";

/** Bis hierher ist ein Turnier entspannt leer. */
const SIGNUPS_CALM_MAX = 2;
/** Ab hier wird es knapp. */
const SEATS_LEFT_CRITICAL_MAX = 1;

function seatsLeftOf(event: UpcomingEvent): number | null {
  return event.capacity === null ? null : Math.max(0, event.capacity - event.numEntrants);
}

function toneOf(event: UpcomingEvent): string {
  const seatsLeft = seatsLeftOf(event);

  // Ohne Limit gibt es nichts zu ampeln — dann bleibt die Zahl neutral.
  if (seatsLeft === null) return "text-base-content";

  // Rot zuerst: bei einem sehr kleinen Limit wäre ein Turnier mit zwei
  // Anmeldungen sonst grün, obwohl nur noch ein Platz frei ist.
  if (seatsLeft <= SEATS_LEFT_CRITICAL_MAX) return "text-error";
  if (event.numEntrants <= SIGNUPS_CALM_MAX) return "text-success";

  return "text-warning";
}

/** „ausgebucht", „nur noch 1 Platz frei" — sonst nichts. */
function seatsHint(event: UpcomingEvent): string | null {
  const seatsLeft = seatsLeftOf(event);
  if (seatsLeft === null || seatsLeft > SEATS_LEFT_CRITICAL_MAX) return null;

  return seatsLeft === 0 ? "ausgebucht" : "nur noch 1 Platz frei";
}

function formatDay(iso: string | null): string {
  if (!iso) return "demnächst";

  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Der ganze Satz — für Screenreader, die die Ampel nicht sehen. */
function spokenLabel(event: UpcomingEvent): string {
  const when = formatDay(event.startAt);
  const seatsLeft = seatsLeftOf(event);

  if (seatsLeft === null) {
    return `${event.numEntrants} Anmeldungen für ${event.label} am ${when}`;
  }

  const seats =
    seatsLeft === 0
      ? "ausgebucht"
      : seatsLeft === 1
        ? "nur noch 1 Platz frei"
        : `noch ${seatsLeft} Plätze frei`;

  return `${event.numEntrants} von ${event.capacity} Plätzen belegt, ${seats} — ${event.label} am ${when}`;
}

export function SignupCounter() {
  const { data: event } = useUpcomingEvent();

  // Kein anstehendes Turnier, Quelle stumm oder Abruf gescheitert: Der Aufruf
  // zum Mitspielen gilt auch ohne Zahl, also steht hier dann einfach nichts.
  if (!event) return null;

  const hint = seatsHint(event);

  return (
    <View
      accessible
      accessibilityLabel={spokenLabel(event)}
      className="flex-row flex-wrap items-baseline gap-x-1.5"
    >
      <Text className="text-sm text-base-muted">Anmeldungen</Text>
      <Text
        className={`text-base font-semibold ${toneOf(event)}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {event.numEntrants}
        {event.capacity !== null ? `/${event.capacity}` : ""}
      </Text>
      {hint ? <Text className="text-sm text-error">· {hint}</Text> : null}
    </View>
  );
}
