/**
 * Die Turnier-Reihe, auf die alles zeigt — das Gegenstück zu
 * frontend/src/composables/useTenant.ts.
 *
 * Im Web steckt die Reihe im Pfad (`/turner-tuesday/…`) und kommt mit jeder
 * Seite vom Server. Hier gibt es keinen Pfad, also gehört sie in den Zustand:
 * gewählt im Kopf des Rahmens, abgelegt in AsyncStorage, und von dort holt sie
 * sich jeder API-Aufruf. Der Slug steckt zusätzlich in jedem Query-Key — sonst
 * zeigte die andere Reihe nach dem Wechsel kurz die Tabelle der vorigen.
 *
 * **Der Katalog steht hier und kommt nicht aus `/api/v2/series`.** Zwei Gründe:
 * Die Bilder liegen im Bundle und nicht auf dem Host, eine Reihe ohne Bilder
 * wäre also ohnehin nur halb da. Und auf der Gegenseite ist die Liste genauso
 * fest verdrahtet — `App\Tenant\Tenant` ist ein PHP-Enum, das sich nur mit
 * einem Deploy ändert. Eine neue Reihe = ein weiterer Eintrag hier plus ihre
 * beiden Bilder unter assets/tenants/.
 *
 * Die Feldnamen sind die des `Series`-Schemas der API, damit der Umstieg auf
 * den Endpunkt diese eine Datei kostet und sonst nichts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, use, useCallback, useEffect, useState } from "react";
import type { ImageSourcePropType } from "react-native";

export type Series = {
  slug: string;
  label: string;
  /** Die Zeile unter den Überschriften. */
  subtitle: string;
  /** Der Pfad der Reihe auf der Website — die Quelle des Anmeldestands. */
  websitePath: string;
  startggUrl: string;
  logo: ImageSourcePropType;
  /** Das Bild hinter allem, im Rahmen mit ~20 % Deckkraft. */
  background: ImageSourcePropType;
};

export const SERIES: Series[] = [
  {
    slug: "turner-tuesday",
    label: "Turner Tuesday",
    subtitle: "Turner Tuesday Series",
    websitePath: "/turner-tuesday",
    startggUrl: "https://start.gg/whv",
    logo: require("../../assets/tenants/turner-tuesday-logo.png"),
    background: require("../../assets/tenants/turner-tuesday-bg.webp"),
  },
  {
    slug: "gelegentlich-mal-sonntags",
    label: "Gelegentlich mal Sonntags",
    subtitle: "Gelegentlich mal Sonntags",
    websitePath: "/gelegentlich-mal-sonntags",
    startggUrl: "https://start.gg/gemaso",
    logo: require("../../assets/tenants/gemaso-logo.webp"),
    background: require("../../assets/tenants/gemaso-bg.webp"),
  },
  {
    slug: "gelegentlich-mal-grillfest",
    label: "Gelegentlich mal Grillfest",
    subtitle: "Gelegentlich mal Grillfest",
    websitePath: "/gelegentlich-mal-grillfest",
    startggUrl: "https://start.gg/gemagrill",
    logo: require("../../assets/tenants/gemagrill-logo.webp"),
    background: require("../../assets/tenants/gemagrill-bg.webp"),
  },
  {
    slug: "gemaon",
    label: "GeMaOn",
    subtitle: "gelegentlich.mal.online",
    websitePath: "/gemaon",
    startggUrl: "https://start.gg/gemaon",
    logo: require("../../assets/tenants/gemaon-logo.webp"),
    background: require("../../assets/tenants/gemaon-bg.webp"),
  },
];

/** Die Reihe, mit der die App aufmacht — dieselbe wie `Tenant::default()`. */
const DEFAULT_SLUG = SERIES[0].slug;

const STORAGE_KEY = "turner:series";

function bySlug(slug: string | null): Series {
  return SERIES.find((series) => series.slug === slug) ?? SERIES[0];
}

type SeriesControl = {
  series: Series;
  all: Series[];
  setSeries: (slug: string) => void;
};

const SeriesContext = createContext<SeriesControl | undefined>(undefined);

export function useSeries(): SeriesControl {
  const control = use(SeriesContext);

  if (!control) throw new Error("useSeries braucht den SeriesProvider.");

  return control;
}

export function SeriesProvider({ children }: { children: React.ReactNode }) {
  const [slug, setSlug] = useState(DEFAULT_SLUG);

  // Kein Splash-Gate wie beim Theme: bis die Wahl da ist, zeigt die App die
  // Vorgabe — ein kurzer Wechsel des Logos ist harmloser als ein Start, der auf
  // den Speicher wartet.
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && stored) setSlug(bySlug(stored).slug);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const setSeries = useCallback((next: string) => {
    setSlug(bySlug(next).slug);

    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <SeriesContext value={{ series: bySlug(slug), all: SERIES, setSeries }}>
      {children}
    </SeriesContext>
  );
}
