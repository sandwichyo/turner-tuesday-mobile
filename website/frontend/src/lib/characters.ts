/**
 * Character renders, stock icons and colours, shared by every page that shows a
 * character: the power ranking's portraits and the picks on the event detail
 * page.
 *
 * The renders live in `backend/public/characters/` and are served from the web
 * root, which is why the paths are absolute. The stock icons sit one level
 * deeper, in `backend/public/characters/stock-icons/`.
 */
export const CHARACTER_IMAGES: Record<string, string> = {
  Fox: "Fox_Standard_1_Render.webp",
  Falco: "Falco_Standard_1_Render.webp",
  Marth: "Marth_Standard_1_Render.webp",
  Sheik: "Zelda_Standard_and_Sheik_Standard_1_Render.webp",
  Zelda: "Zelda_Standard_and_Sheik_Standard_1_Render.webp",
  "Sheik/Zelda": "Zelda_Standard_and_Sheik_Standard_1_Render.webp",
  "Sheik / Zelda": "Zelda_Standard_and_Sheik_Standard_1_Render.webp",
  "Zelda/Sheik": "Zelda_Standard_and_Sheik_Standard_1_Render.webp",
  "Zelda / Sheik": "Zelda_Standard_and_Sheik_Standard_1_Render.webp",
  Jigglypuff: "Jigglypuff_Standard_1_Render.webp",
  "Captain Falcon": "Captain_Falcon_Standard_1_Render.webp",
  Peach: "Peach_Standard_1_Render.webp",
  "Ice Climbers": "Ice_Climbers_Standard_1_Render.webp",
  Samus: "Samus_Standard_1_Render.webp",
  "Young Link": "Young_Link_Standard_1_Render.webp",
  Link: "Link_Standard_1_Render.webp",
  Pikachu: "Pikachu_Standard_1_Render.webp",
  Luigi: "Luigi_Standard_1_Render.webp",
  Mario: "Mario_Standard_1_Render.webp",
  "Dr. Mario": "Dr._Mario_Standard_1_Render.webp",
  Yoshi: "Yoshi_Standard_1_Render.webp",
  Ganondorf: "Ganondorf_Standard_1_Render.webp",
  Mewtwo: "Mewtwo_Standard_1_Render.webp",
  Roy: "Roy_Standard_1_Render.webp",
  "Mr. Game & Watch": "Mr._Game_and_Watch_Standard_1_Render.webp",
  Ness: "Ness_Standard_1_Render.webp",
  Kirby: "Kirby_Standard_1_Render.webp",
  Pichu: "Pichu_Standard_1_Render.webp",
  "Donkey Kong": "Donkey_Kong_Standard_1_Render.webp",
  Bowser: "Bowser_Standard_1_Render.webp",
};

/**
 * Stock icons — the little head portraits Melee shows next to a player's
 * stocks. Sheik and Zelda are one character on start.gg's side but two icons;
 * every Sheik variant resolves to the Sheik head, plain Zelda keeps her own.
 */
export const CHARACTER_STOCK_ICONS: Record<string, string> = {
  Fox: "FoxHeadSSBM.webp",
  Falco: "FalcoHeadSSBM.webp",
  Marth: "MarthHeadSSBM.webp",
  Sheik: "SheikHeadSSBM.webp",
  "Sheik/Zelda": "SheikHeadSSBM.webp",
  "Sheik / Zelda": "SheikHeadSSBM.webp",
  "Zelda/Sheik": "SheikHeadSSBM.webp",
  "Zelda / Sheik": "SheikHeadSSBM.webp",
  Zelda: "ZeldaHeadSSBM.webp",
  Jigglypuff: "JigglypuffHeadSSBM.webp",
  "Captain Falcon": "CaptainFalconHeadSSBM.webp",
  Peach: "PeachHeadSSBM.webp",
  "Ice Climbers": "IceClimbersHeadSSBM.webp",
  Samus: "SamusHeadSSBM.webp",
  "Young Link": "YoungLinkHeadSSBM.webp",
  Link: "LinkHeadSSBM.webp",
  Pikachu: "PikachuHeadSSBM.webp",
  Luigi: "LuigiHeadSSBM.webp",
  Mario: "MarioHeadSSBM.webp",
  "Dr. Mario": "DrMarioHeadSSBM.webp",
  Yoshi: "YoshiHeadSSBM.webp",
  Ganondorf: "GanondorfHeadSSBM.webp",
  Mewtwo: "MewtwoHeadSSBM.webp",
  Roy: "RoyHeadSSBM.webp",
  "Mr. Game & Watch": "MrGame&WatchHeadSSBM.webp",
  Ness: "NessHeadSSBM.webp",
  Kirby: "KirbyHeadSSBM.webp",
  Pichu: "PichuHeadSSBM.webp",
  "Donkey Kong": "DonkeyKongHeadSSBM.webp",
  Bowser: "BowserHeadSSBM.webp",
};

export const CHARACTER_STYLES: Record<string, { background: string; color: string }> =
  {
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

export function getCharacterImageUrl(name?: string | null): string | null {
  if (!name) return null;
  const filename = CHARACTER_IMAGES[name];
  if (filename) return `/characters/${filename}`;
  const lower = name.toLowerCase();
  for (const [key, file] of Object.entries(CHARACTER_IMAGES)) {
    if (key.toLowerCase() === lower) return `/characters/${file}`;
  }
  return null;
}

export function getStockIconUrl(name?: string | null): string | null {
  if (!name) return null;
  const filename = CHARACTER_STOCK_ICONS[name];
  if (filename) return stockIconPath(filename);
  const lower = name.toLowerCase();
  for (const [key, file] of Object.entries(CHARACTER_STOCK_ICONS)) {
    if (key.toLowerCase() === lower) return stockIconPath(file);
  }
  return null;
}

/** Mr. Game & Watch's `&` has to be escaped before it reaches the URL. */
function stockIconPath(filename: string): string {
  return `/characters/stock-icons/${encodeURIComponent(filename)}`;
}

export function getCharacterStyle(name?: string | null): {
  background: string;
  color: string;
} {
  if (!name) return { background: "#374151", color: "#fff" };
  if (CHARACTER_STYLES[name]) return CHARACTER_STYLES[name];
  const lower = name.toLowerCase();
  for (const [key, style] of Object.entries(CHARACTER_STYLES)) {
    if (key.toLowerCase() === lower) return style;
  }
  return { background: "#374151", color: "#fff" };
}
