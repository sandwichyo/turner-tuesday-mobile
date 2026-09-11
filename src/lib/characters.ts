/**
 * Character-Renders, Stock-Icons und Farben — portiert aus dem Web-Frontend
 * (frontend/src/lib/characters.ts).
 *
 * Ein Unterschied zum Web: dort waren die Bilder URLs unter /characters/, hier
 * sind es gebündelte Assets. Metro löst `require` zur Bauzeit auf, ein zur
 * Laufzeit zusammengesetzter Pfad findet nichts — deshalb steht jede Datei
 * ausgeschrieben in der Map. Erzeugt aus den tatsächlich vorhandenen Dateien in
 * assets/characters/, jeder Eintrag ist also nachweislich vorhanden.
 */
import type { ImageSourcePropType } from "react-native";

export const CHARACTER_IMAGES: Record<string, ImageSourcePropType> = {
  Fox: require("../../assets/characters/Fox_Standard_1_Render.webp"),
  Falco: require("../../assets/characters/Falco_Standard_1_Render.webp"),
  Marth: require("../../assets/characters/Marth_Standard_1_Render.webp"),
  Sheik: require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_1_Render.webp"),
  Zelda: require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_1_Render.webp"),
  "Sheik/Zelda": require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_1_Render.webp"),
  "Sheik / Zelda": require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_1_Render.webp"),
  "Zelda/Sheik": require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_1_Render.webp"),
  "Zelda / Sheik": require("../../assets/characters/Zelda_Standard_and_Sheik_Standard_1_Render.webp"),
  Jigglypuff: require("../../assets/characters/Jigglypuff_Standard_1_Render.webp"),
  "Captain Falcon": require("../../assets/characters/Captain_Falcon_Standard_1_Render.webp"),
  Peach: require("../../assets/characters/Peach_Standard_1_Render.webp"),
  "Ice Climbers": require("../../assets/characters/Ice_Climbers_Standard_1_Render.webp"),
  Samus: require("../../assets/characters/Samus_Standard_1_Render.webp"),
  "Young Link": require("../../assets/characters/Young_Link_Standard_1_Render.webp"),
  Link: require("../../assets/characters/Link_Standard_1_Render.webp"),
  Pikachu: require("../../assets/characters/Pikachu_Standard_1_Render.webp"),
  Luigi: require("../../assets/characters/Luigi_Standard_1_Render.webp"),
  Mario: require("../../assets/characters/Mario_Standard_1_Render.webp"),
  "Dr. Mario": require("../../assets/characters/Dr._Mario_Standard_1_Render.webp"),
  Yoshi: require("../../assets/characters/Yoshi_Standard_1_Render.webp"),
  Ganondorf: require("../../assets/characters/Ganondorf_Standard_1_Render.webp"),
  Mewtwo: require("../../assets/characters/Mewtwo_Standard_1_Render.webp"),
  Roy: require("../../assets/characters/Roy_Standard_1_Render.webp"),
  "Mr. Game & Watch": require("../../assets/characters/Mr._Game_and_Watch_Standard_1_Render.webp"),
  Ness: require("../../assets/characters/Ness_Standard_1_Render.webp"),
  Kirby: require("../../assets/characters/Kirby_Standard_1_Render.webp"),
  Pichu: require("../../assets/characters/Pichu_Standard_1_Render.webp"),
  "Donkey Kong": require("../../assets/characters/Donkey_Kong_Standard_1_Render.webp"),
  Bowser: require("../../assets/characters/Bowser_Standard_1_Render.webp"),
};

export const CHARACTER_STOCK_ICONS: Record<string, ImageSourcePropType> = {
  Fox: require("../../assets/characters/stock-icons/FoxHeadSSBM.webp"),
  Falco: require("../../assets/characters/stock-icons/FalcoHeadSSBM.webp"),
  Marth: require("../../assets/characters/stock-icons/MarthHeadSSBM.webp"),
  Sheik: require("../../assets/characters/stock-icons/SheikHeadSSBM.webp"),
  "Sheik/Zelda": require("../../assets/characters/stock-icons/SheikHeadSSBM.webp"),
  "Sheik / Zelda": require("../../assets/characters/stock-icons/SheikHeadSSBM.webp"),
  "Zelda/Sheik": require("../../assets/characters/stock-icons/SheikHeadSSBM.webp"),
  "Zelda / Sheik": require("../../assets/characters/stock-icons/SheikHeadSSBM.webp"),
  Zelda: require("../../assets/characters/stock-icons/ZeldaHeadSSBM.webp"),
  Jigglypuff: require("../../assets/characters/stock-icons/JigglypuffHeadSSBM.webp"),
  "Captain Falcon": require("../../assets/characters/stock-icons/CaptainFalconHeadSSBM.webp"),
  Peach: require("../../assets/characters/stock-icons/PeachHeadSSBM.webp"),
  "Ice Climbers": require("../../assets/characters/stock-icons/IceClimbersHeadSSBM.webp"),
  Samus: require("../../assets/characters/stock-icons/SamusHeadSSBM.webp"),
  "Young Link": require("../../assets/characters/stock-icons/YoungLinkHeadSSBM.webp"),
  Link: require("../../assets/characters/stock-icons/LinkHeadSSBM.webp"),
  Pikachu: require("../../assets/characters/stock-icons/PikachuHeadSSBM.webp"),
  Luigi: require("../../assets/characters/stock-icons/LuigiHeadSSBM.webp"),
  Mario: require("../../assets/characters/stock-icons/MarioHeadSSBM.webp"),
  "Dr. Mario": require("../../assets/characters/stock-icons/DrMarioHeadSSBM.webp"),
  Yoshi: require("../../assets/characters/stock-icons/YoshiHeadSSBM.webp"),
  Ganondorf: require("../../assets/characters/stock-icons/GanondorfHeadSSBM.webp"),
  Mewtwo: require("../../assets/characters/stock-icons/MewtwoHeadSSBM.webp"),
  Roy: require("../../assets/characters/stock-icons/RoyHeadSSBM.webp"),
  "Mr. Game & Watch": require("../../assets/characters/stock-icons/MrGame&WatchHeadSSBM.webp"),
  Ness: require("../../assets/characters/stock-icons/NessHeadSSBM.webp"),
  Kirby: require("../../assets/characters/stock-icons/KirbyHeadSSBM.webp"),
  Pichu: require("../../assets/characters/stock-icons/PichuHeadSSBM.webp"),
  "Donkey Kong": require("../../assets/characters/stock-icons/DonkeyKongHeadSSBM.webp"),
  Bowser: require("../../assets/characters/stock-icons/BowserHeadSSBM.webp"),
};

export const CHARACTER_STYLES: Record<string, { background: string; color: string }> = {
  Fox: { background: "#f97316", color: "#fff" },
  Falco: { background: "#3b82f6", color: "#fff" },
  Marth: { background: "#ef4444", color: "#fff" },
  Sheik: { background: "#6366f1", color: "#fff" },
  Jigglypuff: { background: "#f9a8d4", color: "#1e1b4b" },
  "Captain Falcon": { background: "#d97706", color: "#fff" },
  Peach: { background: "#ec4899", color: "#fff" },
  "Ice Climbers": { background: "#0891b2", color: "#fff" },
  Samus: { background: "#65a30d", color: "#fff" },
  "Young Link": { background: "#16a34a", color: "#fff" },
  Link: { background: "#15803d", color: "#fff" },
  Pikachu: { background: "#ca8a04", color: "#fff" },
  Luigi: { background: "#16a34a", color: "#fff" },
  Mario: { background: "#dc2626", color: "#fff" },
  "Dr. Mario": { background: "#b91c1c", color: "#fff" },
  Yoshi: { background: "#22c55e", color: "#fff" },
  Ganondorf: { background: "#7c3aed", color: "#fff" },
  Mewtwo: { background: "#9333ea", color: "#fff" },
  Roy: { background: "#f87171", color: "#fff" },
  "Mr. Game & Watch": { background: "#1e293b", color: "#e2e8f0" },
  Ness: { background: "#f59e0b", color: "#fff" },
  Kirby: { background: "#fb923c", color: "#fff" },
  Zelda: { background: "#eab308", color: "#1a1a1a" },
  Pichu: { background: "#fde047", color: "#1a1a1a" },
  "Donkey Kong": { background: "#92400e", color: "#fff" },
  Bowser: { background: "#166534", color: "#fff" },
  };

const FALLBACK_STYLE = { background: "#374151", color: "#fff" };

/** Namensauflösung unabhängig von der Groß-/Kleinschreibung, wie im Web. */
function lookup<T>(map: Record<string, T>, name?: string | null): T | null {
  if (!name) return null;
  if (map[name]) return map[name];

  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (key.toLowerCase() === lower) return value;
  }

  return null;
}

export function getCharacterImage(name?: string | null): ImageSourcePropType | null {
  return lookup(CHARACTER_IMAGES, name);
}

export function getStockIcon(name?: string | null): ImageSourcePropType | null {
  return lookup(CHARACTER_STOCK_ICONS, name);
}

export function getCharacterStyle(name?: string | null): { background: string; color: string } {
  return lookup(CHARACTER_STYLES, name) ?? FALLBACK_STYLE;
}
