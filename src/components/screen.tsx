/**
 * Der Rahmen, den im Web das Default-Layout stellt: `bg-base-200`, darüber das
 * Turnier-Hintergrundbild mit 20 % Deckkraft, darauf die Navbar.
 *
 * Das Bild liegt im Web als fixe Ebene hinter allem — hier genauso: absolut
 * positioniert und nicht scrollend, damit es beim Blättern stehen bleibt.
 *
 * Logo und Hintergrund gehören der aktiven Turnier-Reihe, und das Logo ist
 * zugleich deren Umschalter — wie im Web (layouts/Default.vue). Der Wechsel
 * führt zurück auf die Übersicht, weil Event- und Spieler-Detail an Ids der
 * vorigen Reihe hängen, die es in der neuen nicht gibt.
 */
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Ionicons from "@expo/vector-icons/Ionicons";

import { useSeries, type Series } from "@/lib/series";
import { useThemeColors } from "@/lib/theme";

import { RankedDayIndicator } from "./ui/ranked-day-indicator";
import { StartGgLogo } from "./startgg-logo";

/** Die Navbar des Originals: Reihen-Umschalter links, start.gg-Verweis rechts. */
function AppHeader({
  series,
  open,
  onToggle,
  onOpenStartGg,
  onLayout,
}: {
  series: Series;
  open: boolean;
  onToggle: () => void;
  onOpenStartGg: () => void;
  onLayout: (height: number) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center justify-between bg-base-100 px-4 py-3 shadow-lg shadow-black/30"
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Turnier-Reihe wechseln – aktuell ${series.label}`}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        className="flex-1 flex-row items-center gap-2 pr-3"
      >
        <Image source={series.logo} style={{ width: 32, height: 32, borderRadius: 6 }} />
        <Text className="flex-shrink text-xl font-semibold text-base-content" numberOfLines={1}>
          {series.label}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>

      <Pressable
        onPress={onOpenStartGg}
        accessibilityRole="link"
        accessibilityLabel="start.gg"
        hitSlop={12}
      >
        <StartGgLogo size={22} />
      </Pressable>
    </View>
  );
}

/**
 * Die Liste unter der Navbar. Sie hängt nicht im Header, sondern liegt als
 * Geschwister über dem Inhalt: absolut positionierte Kinder werden auf Android
 * am Rand des Elternteils abgeschnitten, und der Header ist nur 56 Punkte hoch.
 */
function SeriesMenu({
  top,
  active,
  options,
  onSelect,
}: {
  top: number;
  active: string;
  options: Series[];
  onSelect: (slug: string) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      className="absolute left-4 right-4 z-10 overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-lg shadow-black/30"
      style={{ top: top + 8 }}
    >
      {options.map((option) => {
        const current = option.slug === active;

        return (
          <Pressable
            key={option.slug}
            onPress={() => onSelect(option.slug)}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            className={`flex-row items-center gap-3 px-4 py-3 ${current ? "bg-base-200" : ""}`}
          >
            <Image source={option.logo} style={{ width: 28, height: 28, borderRadius: 6 }} />
            <View className="flex-1">
              <Text className="font-medium text-base-content" numberOfLines={1}>
                {option.label}
              </Text>
              <Text className="text-xs text-base-muted" numberOfLines={1}>
                {option.subtitle}
              </Text>
            </View>
            {current ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const { series, all, setSeries } = useSeries();
  const [open, setOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);

  const select = (slug: string) => {
    setOpen(false);

    if (slug === series.slug) return;

    setSeries(slug);
    router.navigate("/");
  };

  return (
    <View className="flex-1 bg-base-200">
      <Image
        source={series.background}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: colors.backdropOpacity,
        }}
        contentFit="cover"
        contentPosition="center"
      />

      <SafeAreaView className="flex-1" edges={["top"]}>
        <AppHeader
          series={series}
          open={open}
          onToggle={() => setOpen((value) => !value)}
          onOpenStartGg={() => Linking.openURL(series.startggUrl)}
          onLayout={setHeaderHeight}
        />
        {children}

        {/* Fängt den Tipp daneben ab — das Gegenstück zum pointerdown-Handler im Web. */}
        {open ? (
          <>
            <Pressable
              className="absolute inset-0"
              onPress={() => setOpen(false)}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <SeriesMenu
              top={headerHeight}
              active={series.slug}
              options={all}
              onSelect={select}
            />
          </>
        ) : null}

        {/*
          Wie im Web-Layout: der Ranked-Day-Anzeiger schwebt über allem und
          bleibt beim Wechsel des Tabs stehen. Zuletzt gerendert, damit er über
          dem Inhalt liegt; absolut positioniert, also nimmt er ihm keinen Platz.
        */}
        <RankedDayIndicator />
      </SafeAreaView>
    </View>
  );
}
