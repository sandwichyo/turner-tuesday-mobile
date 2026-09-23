/**
 * Power Ranking v2 — portiert aus frontend/src/pages/PowerRankingV2.vue.
 *
 * Gegenüber v1 fällt die Bereichsauswahl weg: es gibt keine Mindestgröße und
 * keine Mindestteilnahmen mehr, jedes Event zählt — gewichtet danach, wie stark
 * sein Feld besetzt war. Sortiert wird nach `score`, der Spielstärke auf einer
 * Skala, auf der 500 der Ligadurchschnitt ist.
 */
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, Text, View } from "react-native";

import { router } from "expo-router";

import { usePowerRanking } from "@/lib/api/queries";
import type { PowerRankingRow, PowerRankingSection } from "@/lib/api/types";
import { getCharacterStyle } from "@/lib/characters";
import { getPlayerImage } from "@/lib/player-images";
import { Screen } from "@/components/screen";
import { DotBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { TabBarSpacer } from "@/components/ui/floating-tab-bar";
import { Hero } from "@/components/ui/hero";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

const STARTGG_URL = "https://start.gg/whv";

/** "Gesamt" plus die Halbjahre — dieselbe Reihenfolge wie im Web. */
type Period = PowerRankingSection & { key: string; label: string };

const OVERALL_KEY = "overall";

function currentHalfYearKey(): string {
  const now = new Date();

  return `${now.getFullYear()}-H${now.getMonth() < 6 ? 1 : 2}`;
}

/** Ligadurchschnitt auf der Score-Skala — Bezugspunkt jeder Einordnung. */
const AVERAGE_SCORE = 500;

function formatScore(value: number): string {
  return String(Math.round(value));
}

/** Die Ampel der Website: wie stark waren die Felder dieses Spielers? */
function fieldTone(fieldStrength: number): BadgeTone {
  if (fieldStrength >= AVERAGE_SCORE + 25) return "error";

  return fieldStrength <= AVERAGE_SCORE - 25 ? "success" : "warning";
}

const RANK_STYLES: Record<number, { border: string; number: string; glow: string }> = {
  1: { border: "border-gold", number: "text-gold", glow: "shadow-gold/30" },
  2: { border: "border-silver", number: "text-silver", glow: "shadow-silver/20" },
  3: { border: "border-bronze", number: "text-bronze", glow: "shadow-bronze/20" },
};

/** Die drei Farbstufen unter den Umschaltern, wie im Web. */
function Legend() {
  const entries: { tone: BadgeTone; label: string }[] = [
    { tone: "error", label: "Überdurchschnittlich starke Gegner" },
    { tone: "warning", label: "Durchschnittliche Gegner" },
    { tone: "success", label: "Unterdurchschnittlich starke Gegner" },
  ];

  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1 px-4">
      {entries.map((entry) => (
        <View key={entry.tone} className="flex-row items-center gap-1.5">
          <DotBadge tone={entry.tone} />
          <Text className="text-sm text-base-muted">{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}

function PlayerCard({ row }: { row: PowerRankingRow }) {
  const rank = row.rank ?? 0;
  const rankStyle = RANK_STYLES[rank];
  const image = getPlayerImage(row.playerId ?? "", row.topCharacter?.characterName);
  const fieldStrength = row.averageFieldStrength ?? AVERAGE_SCORE;
  const characterStyle = getCharacterStyle(row.topCharacter?.characterName);

  return (
    <Pressable
      onPress={() => router.push(`/players/${encodeURIComponent(row.playerId ?? "")}`)}
      accessibilityRole="link"
      accessibilityLabel={`${row.displayName}, Platz ${rank}`}
    >
    <Card
      className={`mb-4 overflow-hidden border-2 ${rankStyle?.border ?? "border-base-300"} ${
        rankStyle?.glow ?? ""
      }`}
    >
      {image ? (
        <Image
          source={image}
          // Der Render sitzt wie im Web hinter dem Text, unten rechts.
          style={{ position: "absolute", right: 0, bottom: 0, width: 110, height: 128, opacity: 0.4 }}
          contentFit="contain"
          contentPosition="bottom right"
          transition={150}
        />
      ) : null}

      <CardBody>
        <Text className={`text-3xl font-black ${rankStyle?.number ?? "text-base-muted"}`}>
          #{rank}
        </Text>

        <Text className="text-xl font-bold text-base-content" numberOfLines={1}>
          {row.displayName}
        </Text>

        {row.topCharacter ? (
          <View
            className="flex-row items-center gap-1.5 self-start rounded-full px-3 py-1"
            style={{ backgroundColor: characterStyle.background }}
          >
            <Text className="text-sm font-semibold" style={{ color: characterStyle.color }}>
              {row.topCharacter.characterName}
            </Text>
            <Text className="text-xs opacity-75" style={{ color: characterStyle.color }}>
              {row.topCharacter.percentage}%
            </Text>
          </View>
        ) : (
          <View className="self-start rounded-full bg-base-300 px-3 py-1">
            <Text className="text-sm text-base-muted">–</Text>
          </View>
        )}

        <View className="mt-1 gap-1">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-2xl font-black text-base-content">
              {formatScore(row.score ?? AVERAGE_SCORE)}
            </Text>
            <Text className="text-sm text-base-muted">{row.attendances} Events</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <DotBadge tone={fieldTone(fieldStrength)} />
              <Text className="text-sm text-base-muted">
                Gegner Ø {formatScore(fieldStrength)}
              </Text>
            </View>
            <Text className="text-sm text-base-muted">
              {row.setWins}–{row.setLosses} Sets
            </Text>
          </View>
        </View>
      </CardBody>
    </Card>
    </Pressable>
  );
}

export default function PowerRankingScreen() {
  const [periodKey, setPeriodKey] = useState<string>(currentHalfYearKey());

  const { data, isPending, error, refetch, isRefetching } = usePowerRanking();
  const openStartGg = () => Linking.openURL(STARTGG_URL);

  const periods = useMemo<Period[]>(() => {
    if (!data) return [];

    return [
      {
        key: OVERALL_KEY,
        label: "Gesamt",
        eventsConsidered: data.overall?.eventsConsidered,
        eventsSkipped: data.overall?.eventsSkipped,
        rows: data.overall?.rows,
      },
      ...(data.periods ?? []).map((period) => ({
        key: period.key ?? "",
        label: period.label ?? "",
        eventsConsidered: period.eventsConsidered,
        eventsSkipped: period.eventsSkipped,
        rows: period.rows,
      })),
    ];
  }, [data]);

  /**
   * Das laufende Halbjahr, sonst das jüngste vorhandene — aufgelöst statt beim
   * Umschalten gesetzt, weil das laufende Halbjahr noch ohne Events dastehen
   * kann.
   */
  const activePeriod = useMemo<Period | null>(() => {
    if (periods.length === 0) return null;

    return periods.find((period) => period.key === periodKey) ?? periods[1] ?? periods[0];
  }, [periods, periodKey]);

  /** Der nächstältere Zeitraum — das Angebot, wenn der aktive leer ist. */
  const previousPeriod = useMemo<Period | null>(() => {
    const index = periods.findIndex((period) => period.key === activePeriod?.key);
    if (index === -1) return null;

    const previous = periods[index + 1];

    return previous && previous.key !== OVERALL_KEY ? previous : null;
  }, [periods, activePeriod]);

  if (isPending) {
    return (
      <Screen onOpenStartGg={openStartGg}>
        <LoadingState label="Power Ranking wird geladen …" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen onOpenStartGg={openStartGg}>
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </Screen>
    );
  }

  const rows = activePeriod?.rows ?? [];

  return (
    <Screen onOpenStartGg={openStartGg}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.playerId ?? String(row.rank)}
        renderItem={({ item }) => <PlayerCard row={item} />}
        contentContainerClassName="px-4 pb-4"
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          <View className="-mx-4 gap-3 pb-4">
            <View className="px-4">
              <Hero title="Power Ranking" subtitle="Turner Tuesday Series" />
            </View>

            {periods.length > 1 ? (
              <Segmented
                options={periods.map(({ key, label }) => ({ key, label }))}
                value={activePeriod?.key ?? OVERALL_KEY}
                onChange={setPeriodKey}
                tone="secondary"
              />
            ) : null}

            <Text className="px-4 text-sm text-base-muted">
              {activePeriod?.eventsConsidered ?? 0} Events berücksichtigt
              {activePeriod?.eventsSkipped
                ? ` · ${activePeriod.eventsSkipped} ohne Gegner ausgelassen`
                : ""}
              {` · keine Mindestteilnahmen · Score ${formatScore(
                data?.rules?.averageScore ?? AVERAGE_SCORE,
              )} = Durchschnitt aller gewerteten Spieler`}
            </Text>

            <Legend />
          </View>
        }
        ListFooterComponent={<TabBarSpacer />}
        ListEmptyComponent={
          <EmptyState
            message="Keine Daten für diesen Zeitraum verfügbar."
            action={
              previousPeriod
                ? {
                    label: `${previousPeriod.label} anzeigen`,
                    onPress: () => setPeriodKey(previousPeriod.key),
                  }
                : undefined
            }
          />
        }
      />
    </Screen>
  );
}
