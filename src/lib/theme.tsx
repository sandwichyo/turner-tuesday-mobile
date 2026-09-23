/**
 * Hell oder Dunkel — und wer es entscheidet.
 *
 * Maßgeblich ist der Zustand hier: die Palette hängt als CSS-Variablen
 * (`vars()`) an einer Wurzel-View, und jede Klasse darunter liest sie von dort.
 *
 * Der naheliegendere Weg über NativeWinds `colorScheme.set()` allein **trägt
 * nicht**. Auf nativer Seite hat NativeWind keinen eigenen Zustand: es folgt
 * ausschließlich den `Appearance`-Ereignissen von React Native — und verwirft
 * sie, solange `AppState` nicht „active" meldet. Genau das ist beim Start der
 * Fall: die Wahl wird gesetzt, während die App noch hochfährt, das Ereignis
 * fällt weg, und die App bleibt bei dem Schema, das das Gerät vorgibt. Über
 * `vars()` hängt die Darstellung an React statt an dieser Reihenfolge.
 *
 * `Appearance` wird trotzdem gesetzt, aber nur noch für das, was uns nicht
 * gehört: Tastatur, Systemdialoge, native Menüs. Im Web wirft `colorScheme.set()`
 * (dort hängt Dunkel an der Media-Query) — daher der Plattform-Zweig; die Farben
 * der App schaltet dieser Aufruf ohnehin nicht mehr.
 *
 * Voreinstellung bleibt Dunkel, wie die App bisher aussah; „System" und „Hell"
 * sind eine bewusste Wahl in den Einstellungen und liegen in AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { colorScheme, vars } from "nativewind";
import { createContext, use, useCallback, useEffect, useState } from "react";
import { Platform, View, useColorScheme } from "react-native";

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const STORAGE_KEY = "turner:theme";
const DEFAULT_PREFERENCE: ThemePreference = "dark";

/**
 * Die Palette als Kanal-Tripel, wie sie tailwind.config.js erwartet
 * (`rgb(var(…) / <alpha-value>)`). Dieselben Werte stehen in global.css — dort
 * als Rückfall für alles, was vor dem Provider gezeichnet wird.
 */
const TOKENS: Record<Scheme, Record<string, string>> = {
  light: {
    "--color-base-100": "255 255 255",
    "--color-base-200": "242 242 242",
    "--color-base-300": "229 230 230",
    "--color-base-content": "31 41 55",
    "--color-base-muted": "107 114 128",

    "--color-primary": "73 30 255",
    "--color-primary-content": "255 255 255",
    "--color-secondary": "255 65 199",
    "--color-accent": "0 205 183",
    "--color-neutral": "42 50 60",

    "--color-info": "0 140 190",
    "--color-success": "0 150 98",
    "--color-warning": "180 120 0",
    "--color-error": "220 55 62",

    "--color-gold": "202 138 4",
    "--color-silver": "100 116 139",
    "--color-bronze": "180 83 9",

    "--color-startgg": "27 31 42",
    "--color-startgg-content": "255 255 255",
  },
  dark: {
    "--color-base-100": "29 35 42",
    "--color-base-200": "25 30 36",
    "--color-base-300": "21 25 30",
    "--color-base-content": "166 173 187",
    "--color-base-muted": "122 130 144",

    "--color-primary": "116 128 255",
    "--color-primary-content": "255 255 255",
    "--color-secondary": "255 82 217",
    "--color-accent": "0 205 183",
    "--color-neutral": "42 50 60",

    "--color-info": "0 179 240",
    "--color-success": "0 169 110",
    "--color-warning": "255 190 0",
    "--color-error": "255 88 97",

    "--color-gold": "250 204 21",
    "--color-silver": "203 213 225",
    "--color-bronze": "217 119 6",

    "--color-startgg": "255 255 255",
    "--color-startgg-content": "27 31 42",
  },
};

export type Palette = {
  primary: string;
  muted: string;
  content: string;
  background: string;
  /** Die Fläche der schwebenden Navigation, wo es kein Liquid Glass gibt. */
  surface: string;
  hairline: string;
  pill: string;
  shadow: string;
  /** Gitter und Beschriftung des Platzierungsverlaufs. */
  grid: string;
  /** Das Turnierbild hinter allem: auf Weiß reicht weniger. */
  backdropOpacity: number;
};

/**
 * Was keine Klassen nimmt — Platzhalterfarben, native Views (Liquid Glass),
 * SVG —, holt sich die Werte hier. Sie kommen aus denselben Tripeln, damit
 * nichts auseinanderläuft.
 */
function paletteFor(scheme: Scheme): Palette {
  const dark = scheme === "dark";
  const color = (name: string, alpha?: number) =>
    alpha === undefined
      ? `rgb(${TOKENS[scheme][name]})`
      : `rgb(${TOKENS[scheme][name]} / ${alpha})`;

  return {
    primary: color("--color-primary"),
    muted: color("--color-base-muted"),
    content: color("--color-base-content"),
    background: color("--color-base-200"),
    surface: color("--color-base-100", 0.94),
    hairline: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.12)",
    pill: color("--color-primary", 0.16),
    shadow: dark
      ? "0px 8px 24px rgba(0, 0, 0, 0.45)"
      : "0px 8px 24px rgba(15, 23, 42, 0.18)",
    grid: color("--color-base-muted", 0.3),
    backdropOpacity: dark ? 0.2 : 0.1,
  };
}

const PALETTE: Record<Scheme, Palette> = {
  light: paletteFor("light"),
  dark: paletteFor("dark"),
};

function isPreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Nur für die Oberflächen des Systems — die Farben der App hängen an `vars()`. */
function applyToSystem(preference: ThemePreference): void {
  if (Platform.OS === "web") return;

  colorScheme.set(preference);
}

type ThemeControl = {
  preference: ThemePreference;
  /** Das Schema, das gerade gilt — „System" ist hier schon aufgelöst. */
  scheme: Scheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeControl | undefined>(undefined);

export function useThemePreference(): ThemeControl {
  const control = use(ThemeContext);

  if (!control) throw new Error("useThemePreference braucht den ThemeProvider.");

  return control;
}

export function useScheme(): Scheme {
  return useThemePreference().scheme;
}

export function useThemeColors(): Palette {
  return PALETTE[useScheme()];
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setState] = useState<ThemePreference>(DEFAULT_PREFERENCE);

  // Das Schema des Geräts. Es zählt nur bei „System" — und dann steht
  // `Appearance` auch auf „unspecified", meldet also wirklich das Gerät und
  // nicht unsere eigene Vorgabe.
  const system = useColorScheme();
  const scheme: Scheme =
    preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  /**
   * Der Splash bleibt stehen, bis die Wahl aus dem Speicher da ist — sonst
   * zeigte ein hell eingestelltes Gerät für einen Wimpernschlag die dunkle
   * Voreinstellung. Bei einem Fehler geht er trotzdem weg: eine Palette ist
   * gesetzt, und ein hängender Splash wäre das schlimmere Ergebnis.
   */
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const stored = isPreference(raw) ? raw : DEFAULT_PREFERENCE;

        if (!active) return;

        applyToSystem(stored);
        setState(stored);
      })
      .catch(() => applyToSystem(DEFAULT_PREFERENCE))
      // `catch`, weil ein zweiter Aufruf (Fast Refresh) sonst als unbehandelte
      // Zurückweisung endet — der Splash ist dann ohnehin schon weg.
      .finally(() => void SplashScreen.hideAsync().catch(() => {}));

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    applyToSystem(next);
    setState(next);

    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  // Der Grund hinter allem: was durchscheint, bevor ein Screen gezeichnet ist,
  // und was beim Drehen an den Rändern steht.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(PALETTE[scheme].background);
  }, [scheme]);

  return (
    <ThemeContext value={{ preference, scheme, setPreference }}>
      <View style={[{ flex: 1 }, vars(TOKENS[scheme])]}>{children}</View>
    </ThemeContext>
  );
}
