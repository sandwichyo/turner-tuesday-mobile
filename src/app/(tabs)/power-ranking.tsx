/**
 * Power Ranking — portiert aus frontend/src/pages/PowerRanking.vue.
 *
 * Ein Unterschied zum Web: dort liefert der Inertia-Controller beide Bereiche
 * (`qualified` und `all`) in einem Rutsch, die API trennt sie über `?scope=`.
 * Der Screen fragt deshalb nur den aktiven Bereich ab; React Query hält den
 * anderen im Cache, sodass der Wechsel trotzdem sofort erscheint.
 */
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, Text, View } from "react-native";

import { router } from "expo-router";

import { useRanking, useScopeOptions } from "@/lib/api/queries";
import type { RankingRow, RankingScope, RankingSection } from "@/lib/api/types";
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
type Period = RankingSection & { key: string; label: string };

const OVERALL_KEY = "overall";

function currentHalfYearKey(): string {
  const now = new Date();

  return `${now.getFullYear()}-H${now.getMonth() < 6 ? 1 : 2}`;
}

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Die Ampel für verpasste Events aus der Legende der Website. */
function missedTone(missed: number): BadgeTone {
  if (missed <= 0) return "success";

  return missed <= 5 ? "warning" : "error";
}

const RANK_STYLES: Record<number, { border: string; number: string; glow: string }> = {
  1: { border: "border-gold", number: "text-gold", glow: "shadow-gold/30" },
  2: { border: "border-silver", number: "text-silver", glow: "shadow-silver/20" },
  3: { border: "border-bronze", number: "text-bronze", glow: "shadow-bronze/20" },
};

/** Die drei Farbstufen unter den Umschaltern, wie im Web. */
function Legend() {
  const entries: { tone: BadgeTone; label: string }[] = [
    { tone: "success", label: "Keine Events verpasst" },
    { tone: "warning", label: "1–5 Events verpasst" },
    { tone: "error", label: "Über 5 Events verpasst" },
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

function PlayerCard({ row, eventsConsidered }: { row: RankingRow; eventsConsidered: number }) {
  const rank = row.rank ?? 0;
  const rankStyle = RANK_STYLES[rank];
  const image = getPlayerImage(row.playerId ?? "", row.topCharacter?.characterName);
  const missed = Math.max(0, eventsConsidered - (row.attendances ?? 0));
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

        <View className="mt-1 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-sm text-base-muted">
              {formatAverage(row.averagePlacement ?? 0)}
            </Text>
            <DotBadge tone={missedTone(missed)} />
          </View>
          <Text className="text-sm text-base-muted">{row.attendances} Events</Text>
        </View>
      </CardBody>
    </Card>
    </Pressable>
  );
}

export default function PowerRankingScreen() {
  const [scope, setScope] = useState<RankingScope>("qualified");
  const [periodKey, setPeriodKey] = useState<string>(currentHalfYearKey());

  const { data, isPending, error, refetch, isRefetching } = useRanking("power", scope);
  const scopeOptions = useScopeOptions("power");
  const openStartGg = () => Linking.openURL(STARTGG_URL);

  const periods = useMemo<Period[]>(() => {
    if (!data) return [];

    return [
      {
        key: OVERALL_KEY,
        label: "Gesamt",
        eventsConsidered: data.overall?.eventsConsidered,
        rows: data.overall?.rows,
      },
      ...(data.periods ?? []).map((period) => ({
        key: period.key ?? "",
        label: period.label ?? "",
        eventsConsidered: period.eventsConsidered,
        rows: period.rows,
      })),
    ];
  }, [data]);

  /**
   * Das laufende Halbjahr, sonst das jüngste vorhandene. Dass `periodKey` auf
   * einen Zeitraum zeigt, den dieser Bereich nicht kennt, ist der Normalfall
   * beim Bereichswechsel — deshalb wird hier aufgelöst statt beim Umschalten
   * gesetzt.
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
  const eventsConsidered = activePeriod?.eventsConsidered ?? 0;

  return (
    <Screen onOpenStartGg={openStartGg}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.playerId ?? String(row.rank)}
        renderItem={({ item }) => (
          <PlayerCard row={item} eventsConsidered={eventsConsidered} />
        )}
        contentContainerClassName="px-4 pb-4"
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          <View className="-mx-4 gap-3 pb-4">
            <View className="px-4">
              <Hero title="Power Ranking" subtitle="Turner Tuesday Series" />
            </View>

            <Segmented
              options={scopeOptions}
              value={scope}
              onChange={(key) => setScope(key as RankingScope)}
            />

            {periods.length > 1 ? (
              <Segmented
                options={periods.map(({ key, label }) => ({ key, label }))}
                value={activePeriod?.key ?? OVERALL_KEY}
                onChange={setPeriodKey}
                tone="secondary"
              />
            ) : null}

            <Text className="px-4 text-sm text-base-muted">
              {eventsConsidered} Events berücksichtigt
              {data?.rules?.minimumEntrants != null
                ? ` · mind. ${data.rules.minimumEntrants} Teilnehmer pro Event`
                : ""}
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
