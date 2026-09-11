/**
 * Der Platzierungsverlauf aus Participants/Show.vue.
 *
 * Im Web zeichnet das chart.js; hier reicht react-native-svg — es ist eine
 * Linie mit Punkten. Übernommen sind die Eigenheiten, die die Aussage tragen:
 * die **umgekehrte** y-Achse (Platz 1 oben), der Bereich von `bestes − 1` bis
 * `schlechtestes + 1` und ganzzahlige Schritte, weil es halbe Plätze nicht gibt.
 *
 * Die x-Achse bleibt wie im Original unbeschriftet — bei 20+ Events überlappen
 * die Turniernamen ohnehin. Ein Tipp auf einen Punkt zeigt das Event darunter.
 */
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

const LINE_COLOR = "#89b4fa";
const POINT_COLOR = "#cba6f7";
const GRID_COLOR = "rgba(108, 112, 134, 0.35)";
const LABEL_COLOR = "rgb(122 130 144)";
const HEIGHT = 240;
const PADDING = { top: 12, right: 12, bottom: 12, left: 28 };

export type PlacementPoint = {
  eventId: number;
  label: string;
  placement: number;
  numEntrants?: number | null;
};

export function PlacementChart({ points }: { points: PlacementPoint[] }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <View className="rounded-xl border border-dashed border-base-300 p-6">
        <Text className="text-sm text-base-muted">Keine Platzierungen hinterlegt.</Text>
      </View>
    );
  }

  const best = Math.min(...points.map((point) => point.placement));
  const worst = Math.max(...points.map((point) => point.placement));
  const min = Math.max(0, best - 1);
  const max = worst + 1;

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  /** x gleichmäßig verteilt; ein einzelner Punkt sitzt mittig statt am Rand. */
  const xOf = (index: number): number =>
    points.length === 1
      ? PADDING.left + plotWidth / 2
      : PADDING.left + (index / (points.length - 1)) * plotWidth;

  /** y umgekehrt: der kleinere Platz ist der bessere und gehört nach oben. */
  const yOf = (placement: number): number =>
    PADDING.top + ((placement - min) / (max - min || 1)) * plotHeight;

  // Ganzzahlige Gitterlinien, aber nie mehr als acht — sonst wird es ein Raster.
  const step = Math.max(1, Math.ceil((max - min) / 8));
  const ticks: number[] = [];
  for (let value = Math.ceil(min); value <= max; value += step) ticks.push(value);

  const polyline = points.map((point, index) => `${xOf(index)},${yOf(point.placement)}`).join(" ");
  const active = selected !== null ? points[selected] : null;

  return (
    <View className="gap-2">
      <Text className="text-xs text-base-muted">Platzierung (1 = bester Platz)</Text>

      <View
        className="rounded-xl bg-base-200/50 p-3"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width - 24)}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((tick) => (
              <React.Fragment key={tick}>
                <Line
                  x1={PADDING.left}
                  y1={yOf(tick)}
                  x2={width - PADDING.right}
                  y2={yOf(tick)}
                  stroke={GRID_COLOR}
                  strokeWidth={1}
                />
                {/* Platz 0 gibt es nicht — die Linie bleibt, die Zahl entfällt. */}
                {tick >= 1 ? (
                  <SvgText
                    x={PADDING.left - 6}
                    y={yOf(tick) + 3}
                    fontSize={9}
                    fill={LABEL_COLOR}
                    textAnchor="end"
                  >
                    {String(tick)}
                  </SvgText>
                ) : null}
              </React.Fragment>
            ))}

            <Polyline points={polyline} fill="none" stroke={LINE_COLOR} strokeWidth={2} />

            {points.map((point, index) => (
              <Circle
                key={point.eventId}
                cx={xOf(index)}
                cy={yOf(point.placement)}
                r={selected === index ? 6 : 4}
                fill={POINT_COLOR}
                stroke={LINE_COLOR}
                strokeWidth={1}
              />
            ))}
          </Svg>
        ) : null}

      </View>

      {/* Ersatz für den Tooltip: eine Reihe antippbarer Punkte unter dem Diagramm. */}
      <View className="flex-row flex-wrap gap-1">
        {points.map((point, index) => (
          <Pressable
            key={point.eventId}
            onPress={() => setSelected(selected === index ? null : index)}
            accessibilityRole="button"
            accessibilityLabel={`${point.label}, Platz ${point.placement}`}
            className={`h-6 w-6 items-center justify-center rounded ${
              selected === index ? "bg-primary" : "bg-base-200"
            }`}
          >
            <Text
              className={`text-[10px] ${
                selected === index ? "text-primary-content" : "text-base-muted"
              }`}
            >
              {point.placement}
            </Text>
          </Pressable>
        ))}
      </View>

      {active ? (
        <Text className="text-sm text-base-muted">
          {active.label} — Platz {active.placement}
          {active.numEntrants ? ` / ${active.numEntrants}` : ""}
        </Text>
      ) : null}
    </View>
  );
}
