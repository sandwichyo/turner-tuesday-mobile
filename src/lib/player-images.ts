/**
 * Spielerspezifische Alternate-Costume-Renders, portiert aus PowerRanking.vue.
 *
 * Geschlüsselt über die stabile start.gg-Spieler-ID, damit die Zuordnung eine
 * Namensänderung überlebt. `character` ist der Charakter, zu dem das Kostüm
 * gehört: das Override greift nur, wenn es auch der dominante Charakter des
 * Spielers ist — sonst liefe ein Falco-Kostüm unter einem Fox-Eintrag.
 */
import type { ImageSourcePropType } from "react-native";

import { getCharacterImage } from "./characters";

type Override = { character: string; image: ImageSourcePropType };

const PLAYER_IMAGE_OVERRIDES: Record<string, Override> = {
  "player:4840191": {
    character: "Falco",
    image: require("../../assets/characters/Falco_Standard_4_Render.webp"),
  }, // Meadow
  "player:232047": {
    character: "Falco",
    image: require("../../assets/characters/Falco_Standard_2_Render.webp"),
  }, // Labig
  "player:4727713": {
    character: "Sheik",
    image: require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_2_Render.webp"),
  }, // DaddyFox
  "player:581484": {
    character: "Jigglypuff",
    image: require("../../assets/characters/Jigglypuff_Standard_4_Render.webp"),
  }, // StyleStocks
  "player:281090": {
    character: "Samus",
    image: require("../../assets/characters/Samus_Standard_5_Render.webp"),
  }, // schnitte
  "player:1594961": {
    character: "Ice Climbers",
    image: require("../../assets/characters/Ice_Climbers_Standard_2_Render.webp"),
  }, // wuerger
  "player:4191763": {
    character: "Marth",
    image: require("../../assets/characters/Marth_Standard_2_Render.webp"),
  }, // sandboxxyo
  "player:5306262": {
    character: "Marth",
    image: require("../../assets/characters/Marth_Standard_4_Render.webp"),
  }, // Skog
  "player:5474068": {
    character: "Sheik",
    image: require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_2_Render.webp"),
  }, // carottensuppe
};

/**
 * Das Bild für eine Ranking-Zeile: das Kostüm-Override, wenn es zum dominanten
 * Charakter passt, sonst der Standard-Render dieses Charakters.
 *
 * Der Vergleich läuft über die aufgelöste Bildquelle statt über den Namen, weil
 * Sheik und Zelda sich einen Render teilen — ein Sheik-Override soll auch
 * greifen, wenn die API "Zelda" meldet.
 */
export function getPlayerImage(
  playerId: string,
  topCharacterName?: string | null,
): ImageSourcePropType | null {
  const fallback = getCharacterImage(topCharacterName);
  const override = PLAYER_IMAGE_OVERRIDES[playerId];

  if (override && fallback !== null && fallback === getCharacterImage(override.character)) {
    return override.image;
  }

  return fallback;
}
