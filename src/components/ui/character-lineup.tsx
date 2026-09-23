/**
 * Das Charakter-Lineup der Spieler-Detail-Seite — portiert aus dem
 * `.character-stage`-Block in frontend/src/pages/Participants/Show.vue.
 *
 * Die Figuren stehen nebeneinander auf einer gemeinsamen Standlinie und
 * überlappen sich leicht; der meistgespielte gibt mit voller Höhe die
 * Richtlinie vor. Die Wurzel staucht das Verhältnis: streng linear fiele ein
 * Charakter mit 5 % Anteil auf ein Zwanzigstel zusammen und wäre nicht mehr zu
 * erkennen.
 *
 * Zwei Abweichungen vom Web, beide erzwungen:
 *
 * - Das Web schachtelt die Renders in Figuren-Boxen und lässt sie bewusst
 *   überlaufen. Nativ schneidet Android Kinder am Rand des Elternteils ab,
 *   deshalb liegt hier jedes Bild direkt in der Bühne und seine Position ist
 *   ausgerechnet statt aus Flexbox und negativen Rändern gefallen.
 * - Kein Schlagschatten unter den Füßen: ohne `filter: blur()` wäre die Ellipse
 *   ein harter Fleck und damit schlechter als keiner.
 */
import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";

import { getCharacterImage, getCharacterRenderBox, getCharacterStyle } from "@/lib/characters";

export type LineupCharacter = {
  characterId?: number;
  characterName?: string;
  count?: number;
  percentage?: number;
};

/** Mehr als fünf Figuren werden auf einem Telefon zu Streichhölzern. */
const LIMIT = 5;

/** Die Standlinie liegt so weit über dem unteren Rand der Bühne. */
const FLOOR = 22;

/** Platz über der größten Figur für das Prozent-Schild. */
const HEADROOM = 26;

/** So weit rückt jede Figur unter ihre Vorgängerin. */
const OVERLAP = 0.24;

/** Bildseitenverhältnis der Renders (1000 × 1500). */
const IMAGE_RATIO = 2 / 3;

function formatShare(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function CharacterLineup({
  characters,
  rowHeight = 150,
}: {
  characters: LineupCharacter[];
  rowHeight?: number;
}) {
  const [width, setWidth] = useState(0);

  const top = characters.slice(0, LIMIT);
  const maxCount = top[0]?.count ?? 0;

  const figures = top.map((character, index) => {
    const box = getCharacterRenderBox(character.characterName);
    const scale = maxCount > 0 ? Math.sqrt((character.count ?? 0) / maxCount) : 1;

    const imageHeight = (scale * rowHeight) / box.height;
    const imageWidth = imageHeight * IMAGE_RATIO;

    return {
      character,
      box,
      imageWidth,
      imageHeight,
      figureWidth: imageWidth * box.width,
      figureHeight: scale * rowHeight,
      // Jede zweite steht eine Spur tiefer, die hinteren rutschen zusätzlich
      // nach unten — das erzeugt die versetzte Staffelung.
      offset: (index % 2 === 0 ? 0 : 5) + index * 1.5,
      // Nach hinten leicht abdunkeln, damit die Reihenfolge auch ohne Zahlen
      // lesbar ist.
      depth: Math.max(0.62, 1 - index * 0.11),
      source: getCharacterImage(character.characterName),
      style: getCharacterStyle(character.characterName),
    };
  });

  // Links nach rechts gepackt, jede Figur rückt unter die vorige.
  const lefts: number[] = [];
  let cursor = 0;
  for (const figure of figures) {
    lefts.push(cursor);
    cursor += figure.figureWidth * (1 - OVERLAP);
  }
  const rowWidth = figures.length > 0 ? lefts[lefts.length - 1] + figures[figures.length - 1].figureWidth : 0;

  /**
   * Passt die Reihe nicht, schrumpft die ganze Bühne. Das Web löst das mit
   * Media Queries auf `--row-height`; hier ist die Breite ohnehin gemessen,
   * also zählt sie direkt — sonst schnitte die Bühne den Größten ab.
   */
  const fit = width > 0 && rowWidth > 0 ? Math.min(1, (width - 24) / rowWidth) : 1;
  const stageHeight = rowHeight * fit + FLOOR + HEADROOM;
  const rowLeft = Math.max(12, (width - rowWidth * fit) / 2);

  return (
    <View
      className="overflow-hidden rounded-xl bg-base-200"
      style={{ height: stageHeight }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width === 0
        ? null
        : figures.map((figure, index) => {
            const figureWidth = figure.figureWidth * fit;
            const imageWidth = figure.imageWidth * fit;
            const imageHeight = figure.imageHeight * fit;

            const figureLeft = rowLeft + lefts[index] * fit;
            const figureBottom = stageHeight - FLOOR + figure.offset;
            const figureTop = figureBottom - figure.figureHeight * fit;

            // Der Ausschnitt des Renders soll die Figur füllen: das Bild wird
            // um den unsichtbaren Rand seines Kastens nach links und unten
            // hinausgeschoben.
            const imageLeft = figureLeft - figure.box.x * imageWidth;
            const imageTop =
              figureBottom + (1 - figure.box.y - figure.box.height) * imageHeight - imageHeight;

            return (
              <View
                key={figure.character.characterName ?? index}
                // Die vorderste Figur liegt oben — im Web macht das `z-index`.
                style={{ zIndex: figures.length - index }}
              >
                {figure.source ? (
                  <Image
                    source={figure.source}
                    style={{
                      position: "absolute",
                      left: imageLeft,
                      top: imageTop,
                      width: imageWidth,
                      height: imageHeight,
                      opacity: figure.depth,
                    }}
                    contentFit="contain"
                  />
                ) : (
                  // Charakter ohne Render: eingefärbte Säule in seiner Farbe.
                  <View
                    style={{
                      position: "absolute",
                      left: figureLeft,
                      top: figureTop,
                      width: figureWidth,
                      height: figureBottom - figureTop,
                      backgroundColor: figure.style.background,
                      opacity: figure.depth,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}
                  />
                )}

                {/* Das Schild sitzt mittig über der Figur; die Breitenangabe
                    der Hülle zentriert es, ohne sie messen zu müssen. */}
                <View
                  style={{
                    position: "absolute",
                    left: figureLeft,
                    top: figureTop - 20,
                    width: figureWidth,
                    alignItems: "center",
                  }}
                  pointerEvents="none"
                >
                  <View
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: figure.style.background }}
                  >
                    <Text
                      className="text-[11px] font-bold"
                      style={{ color: figure.style.color }}
                      numberOfLines={1}
                    >
                      {formatShare(figure.character.percentage ?? 0)}%
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
    </View>
  );
}
