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
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRanking } from "@/lib/api/queries";
import type { RankingRow, RankingScope, RankingSection } from "@/lib/api/types";
import { getCharacterStyle } from "@/lib/characters";
import { getPlayerImage } from "@/lib/player-images";
import { DotBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

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

const RANK_STYLES: Record<number, { border: string; number: string }> = {
  1: { border: "border-gold", number: "text-gold" },
  2: { border: "border-silver", number: "text-silver" },
  3: { border: "border-bronze", number: "text-bronze" },
};

function PlayerCard({ row, eventsConsidered }: { row: RankingRow; eventsConsidered: number }) {
  const rank = row.rank ?? 0;
  const rankStyle = RANK_STYLES[rank];
  const image = getPlayerImage(row.playerId ?? "", row.topCharacter?.characterName);
  const missed = Math.max(0, eventsConsidered - (row.attendances ?? 0));
  const characterStyle = getCharacterStyle(row.topCharacter?.characterName);

  return (
    <Card className={`mb-4 overflow-hidden border-2 ${rankStyle?.border ?? "border-base-300"}`}>
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
            className="self-start flex-row items-center gap-1.5 rounded-full px-3 py-1"
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
  );
}

export default function PowerRankingScreen() {
  const [scope, setScope] = useState<RankingScope>("qualified");
  const [periodKey, setPeriodKey] = useState<string>(currentHalfYearKey());

  const { data, isPending, error, refetch, isRefetching } = useRanking("power", scope);

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
      <SafeAreaView className="flex-1 bg-base-200" edges={["top"]}>
        <LoadingState label="Power Ranking wird geladen …" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-base-200" edges={["top"]}>
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  const rows = activePeriod?.rows ?? [];
  const eventsConsidered = activePeriod?.eventsConsidered ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-base-200" edges={["top"]}>
      <View className="gap-3 pb-3">
        <View className="px-4 pt-2">
          <Text className="text-3xl font-bold text-base-content">Power Ranking</Text>
          <Text className="text-base-muted">Turner Tuesday Series</Text>
        </View>

        <Segmented
          options={[
            { key: "qualified", label: data?.scopeLabel ?? "Qualifiziert" },
            { key: "all", label: "Alle Events" },
          ]}
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
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.playerId ?? String(row.rank)}
        renderItem={({ item }) => (
          <PlayerCard row={item} eventsConsidered={eventsConsidered} />
        )}
        contentContainerClassName="px-4 pb-8"
        refreshing={isRefetching}
        onRefresh={refetch}
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
    </SafeAreaView>
  );
}
