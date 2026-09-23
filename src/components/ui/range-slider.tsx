/**
 * Zwei-Griff-Regler über eine chronologisch aufsteigende Liste von Rasten (ein
 * Label je Event) — portiert aus frontend/src/components/TimeRangeSlider.vue.
 *
 * Wie dort arbeitet er mit **Indizes** statt mit Datumswerten: so liegt jedes
 * Event auf einer eigenen Raste und eine lange Turnierpause frisst keinen
 * Reglerweg. `null` heißt „voller Bereich" — dann bleibt das vom Server
 * gerechnete Aggregat stehen, statt es aus der Timeline nachzurechnen.
 *
 * Das Web legt zwei native `input[type=range]` deckungsgleich übereinander und
 * behält so die Bedienung des Browsers. Nativ gibt es nichts zu erben, also
 * zieht ein `PanResponder` den jeweils näheren Griff — keine neue Abhängigkeit,
 * und bei dreißig Rasten braucht es dafür auch keinen Worklet-Thread.
 */
import { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";

// Der Typ gehört zur Auswertung, nicht zum Regler — dort liegt auch die
// Selbstprüfung, die ohne React laufen können muss.
import type { TimeRange } from "@/lib/player-range";

const TRACK_HEIGHT = 6;
const THUMB_SIZE = 22;

export function RangeSlider({
  labels,
  value,
  onChange,
  title = "Zeitraum",
  unit = "Events",
}: {
  /** Ein Label je Raste, ältestes zuerst. */
  labels: string[];
  value: TimeRange | null;
  onChange: (range: TimeRange | null) => void;
  title?: string;
  unit?: string;
}) {
  const [width, setWidth] = useState(0);
  const maxIndex = Math.max(0, labels.length - 1);

  const range = value ?? { from: 0, to: maxIndex };

  // Der PanResponder wird einmal gebaut und liest den aktuellen Stand aus der
  // Ref — sonst zöge er mit jedem Finger-Tick eine neue Instanz nach sich.
  const state = useRef({ range, maxIndex, width, onChange });
  state.current = { range, maxIndex, width, onChange };

  const dragging = useRef<"from" | "to" | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const index = toIndex(event.nativeEvent.locationX, state.current);
          const { from, to } = state.current.range;

          // Der nähere Griff folgt dem Finger; bei Gleichstand der, in dessen
          // Richtung gezogen wird.
          dragging.current =
            Math.abs(index - from) === Math.abs(index - to)
              ? index < from
                ? "from"
                : "to"
              : Math.abs(index - from) < Math.abs(index - to)
                ? "from"
                : "to";

          apply(index, dragging.current, state.current);
        },
        onPanResponderMove: (event) => {
          if (!dragging.current) return;

          apply(toIndex(event.nativeEvent.locationX, state.current), dragging.current, state.current);
        },
        onPanResponderRelease: () => {
          dragging.current = null;
        },
        onPanResponderTerminate: () => {
          dragging.current = null;
        },
      }),
    [],
  );

  // Bei nur einer Raste gibt es nichts einzugrenzen — dann bleibt der Regler weg.
  if (maxIndex === 0) return null;

  const full = value === null;
  const summary = full ? "Gesamt" : `${range.to - range.from + 1} von ${labels.length} ${unit}`;
  const track = Math.max(0, width - THUMB_SIZE);
  const xOf = (index: number) => (maxIndex === 0 ? 0 : (index / maxIndex) * track);

  return (
    <View className="gap-1 rounded-xl bg-base-200/60 px-4 py-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm text-base-muted">{title}</Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-sm font-medium text-base-content">{summary}</Text>
          {full ? null : (
            <Pressable onPress={() => onChange(null)} accessibilityRole="button" hitSlop={8}>
              <Text className="text-sm text-primary">Zurücksetzen</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View
        className="justify-center"
        style={{ height: THUMB_SIZE + 10 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View
          className="absolute rounded-full bg-base-300"
          style={{ left: THUMB_SIZE / 2, right: THUMB_SIZE / 2, height: TRACK_HEIGHT }}
        />
        <View
          className="absolute rounded-full bg-primary"
          style={{
            left: THUMB_SIZE / 2 + xOf(range.from),
            width: Math.max(0, xOf(range.to) - xOf(range.from)),
            height: TRACK_HEIGHT,
          }}
        />

        {(["from", "to"] as const).map((handle) => (
          <View
            key={handle}
            accessibilityRole="adjustable"
            accessibilityLabel={`${title} ${handle === "from" ? "von" : "bis"}`}
            accessibilityValue={{ text: labels[range[handle]] ?? "–" }}
            className="absolute rounded-full border-2 border-primary bg-base-100"
            style={{ left: xOf(range[handle]), width: THUMB_SIZE, height: THUMB_SIZE }}
          />
        ))}
      </View>

      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-xs text-base-muted">von {labels[range.from] ?? "–"}</Text>
        <Text className="text-xs text-base-muted">bis {labels[range.to] ?? "–"}</Text>
      </View>
    </View>
  );
}

type SliderState = {
  range: TimeRange;
  maxIndex: number;
  width: number;
  onChange: (range: TimeRange | null) => void;
};

function toIndex(x: number, { maxIndex, width }: SliderState): number {
  const track = Math.max(1, width - THUMB_SIZE);

  return Math.round(Math.min(1, Math.max(0, (x - THUMB_SIZE / 2) / track)) * maxIndex);
}

/**
 * Überkreuzen sich die Griffe, werden sie getauscht statt am jeweils anderen zu
 * klemmen — wie im Web. Der volle Bereich meldet `null` zurück, damit „Gesamt"
 * und ein voll aufgezogener Regler dieselbe Liste ergeben.
 */
function apply(index: number, handle: "from" | "to", state: SliderState): void {
  const next = handle === "from" ? { ...state.range, from: index } : { ...state.range, to: index };
  const ordered = next.from <= next.to ? next : { from: next.to, to: next.from };

  state.onChange(ordered.from === 0 && ordered.to === state.maxIndex ? null : ordered);
}
