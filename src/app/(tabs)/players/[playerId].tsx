/**
 * Spieler-Detail — portiert aus frontend/src/pages/Participants/Show.vue.
 *
 * Platzierungshistorie, Eventliste, meistgespielte Charaktere und H2H. Den
 * Verlauf zeichnet im Web chart.js, hier PlacementChart auf react-native-svg.
 */
import { useLocalSearchParams, router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { usePlayer } from "@/lib/api/queries";
import { useSeries } from "@/lib/series";
import { useThemeColors } from "@/lib/theme";
import { Screen } from "@/components/screen";
import { Card, CardBody } from "@/components/ui/card";
import { TabBarSpacer } from "@/components/ui/floating-tab-bar";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { PlacementChart } from "@/components/ui/placement-chart";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableCell, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/states";

function formatDate(iso?: string | null): string {
  if (!iso) return "";

  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatWinRate(value: number): string {
  return value.toFixed(1);
}

export default function PlayerDetailScreen() {
  const colors = useThemeColors();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { data, isPending, error, refetch } = usePlayer(playerId);
  const { series } = useSeries();

  const [placementQuery, setPlacementQuery] = useState("");
  const [placementPage, setPlacementPage] = useState(1);
  const [opponentQuery, setOpponentQuery] = useState("");


  const placements = data?.placements ?? [];
  const opponents = data?.headToHead?.opponents ?? [];
  const summary = data?.headToHead?.summary ?? { wins: 0, losses: 0 };
  const characters = data?.characters?.top ?? [];

  const best = placements.length > 0 ? Math.min(...placements.map((p) => p.placement ?? 0)) : 0;
  const worst = placements.length > 0 ? Math.max(...placements.map((p) => p.placement ?? 0)) : 0;

  const filteredPlacements = useMemo(() => {
    const query = placementQuery.trim().toLowerCase();
    if (!query) return placements;

    return placements.filter((entry) =>
      `${entry.tournamentName ?? ""} ${entry.eventName ?? ""}`.toLowerCase().includes(query),
    );
  }, [placements, placementQuery]);

  const filteredOpponents = useMemo(() => {
    const query = opponentQuery.trim().toLowerCase();
    if (!query) return opponents;

    return opponents.filter((opponent) =>
      (opponent.displayName ?? "").toLowerCase().includes(query),
    );
  }, [opponents, opponentQuery]);

  if (isPending) {
    return (
      <Screen>
        <LoadingState label="Spieler wird geladen …" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </Screen>
    );
  }

  const totalSets = (summary.wins ?? 0) + (summary.losses ?? 0);
  const winRate = totalSets > 0 ? ((summary.wins ?? 0) / totalSets) * 100 : 0;
  const pagedPlacements = filteredPlacements.slice(
    (placementPage - 1) * PAGE_SIZE,
    placementPage * PAGE_SIZE,
  );

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Card>
          <CardBody className="gap-4">
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
              <Text className="text-base-muted">← Zurück</Text>
            </Pressable>

            <View>
              <Text className="text-2xl font-bold text-base-content">
                {data?.displayName ?? "Spieler"}
              </Text>
              <Text className="text-base-muted">
                Platzierungshistorie über {series.label}-Events.
              </Text>
            </View>

            <View className="flex-row gap-3">
              <StatTile label="Teilnahmen" value={String(data?.attendances ?? 0)} />
              <StatTile label="Ø Platzierung" value={formatAverage(data?.averagePlacement ?? 0)} />
            </View>
            <View className="flex-row">
              <StatTile label="Beste / Schlechteste Platzierung" value={`${best} / ${worst}`} />
            </View>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-base-content">
                Platzierungen über die Zeit
              </Text>
              <Text className="text-sm text-base-muted">{placements.length} Events</Text>
            </View>

            <PlacementChart
              points={placements.map((entry) => ({
                eventId: entry.eventId ?? 0,
                label: entry.label ?? entry.tournamentName ?? "",
                placement: entry.placement ?? 0,
                numEntrants: entry.numEntrants,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <Text className="text-lg font-semibold text-base-content">Events</Text>

            <TextInput
              value={placementQuery}
              onChangeText={(text) => {
                setPlacementQuery(text);
                setPlacementPage(1);
              }}
              placeholder="Event suchen …"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              className="rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-base-content"
            />

            {filteredPlacements.length > 0 ? (
              <>
                <Table
                  columns={[
                    { key: "event", label: "Event", flex: 4 },
                    { key: "placement", label: "Platz", flex: 1.2 },
                    { key: "entrants", label: "Teiln.", flex: 1.2 },
                  ]}
                >
                  {pagedPlacements.map((entry, index) => (
                    <TableRow key={entry.eventId} index={index}>
                      <TableCell flex={4}>
                        <Pressable
                          onPress={() => router.push(`/events/${entry.eventId}`)}
                          accessibilityRole="link"
                          className="flex-1"
                        >
                          <Text className="font-medium text-primary" numberOfLines={1}>
                            {entry.tournamentName}
                          </Text>
                          <Text className="text-xs text-base-muted" numberOfLines={1}>
                            {entry.eventName !== entry.tournamentName ? `${entry.eventName} · ` : ""}
                            {formatDate(entry.startAt)}
                          </Text>
                        </Pressable>
                      </TableCell>
                      <TableCell flex={1.2}>
                        <Text className="font-semibold text-base-content">{entry.placement}</Text>
                      </TableCell>
                      <TableCell flex={1.2}>
                        <Text className="text-base-content">{entry.numEntrants ?? "n/a"}</Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </Table>

                <Pagination
                  page={placementPage}
                  pageCount={Math.max(1, Math.ceil(filteredPlacements.length / PAGE_SIZE))}
                  onChange={setPlacementPage}
                />
              </>
            ) : (
              <View className="rounded-xl border border-dashed border-base-300 p-6">
                <Text className="text-sm text-base-muted">Keine Events gefunden.</Text>
              </View>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-base-content">
                Meist gespielte Charaktere
              </Text>
              <Text className="text-sm text-base-muted">
                {data?.characters?.totalSelections ?? 0} Games
              </Text>
            </View>

            {characters.length > 0 ? (
              <View className="gap-3">
                {characters.map((character) => (
                  <View key={character.characterId} className="rounded-xl bg-base-200 p-4">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-lg font-semibold text-base-content">
                          {character.characterName}
                        </Text>
                        <Text className="text-sm text-base-muted">
                          {character.count} mal gewählt
                        </Text>
                      </View>
                      <View className="rounded-full border border-secondary px-2 py-0.5">
                        <Text className="text-xs font-semibold text-secondary">
                          {formatWinRate(character.percentage ?? 0)}%
                        </Text>
                      </View>
                    </View>

                    {/* Ersatz für <progress>: ein Balken, dessen Breite den Anteil trägt. */}
                    <View className="mt-4 h-2 overflow-hidden rounded-full bg-base-300">
                      <View
                        className="h-full rounded-full bg-secondary"
                        style={{ width: `${Math.min(100, character.percentage ?? 0)}%` }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="rounded-xl border border-dashed border-base-300 p-6">
                <Text className="text-sm text-base-muted">
                  Keine Charakterinformationen hinterlegt.
                </Text>
              </View>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-base-content">H2H</Text>
              <Text className="text-sm text-base-muted">
                {summary.wins} - {summary.losses}
              </Text>
            </View>

            <View className="flex-row gap-3">
              <StatTile label="Gewonnen" value={String(summary.wins ?? 0)} />
              <StatTile label="Verloren" value={String(summary.losses ?? 0)} />
            </View>
            <View className="flex-row">
              <StatTile label="Gewinnrate" value={`${formatWinRate(winRate)}%`} />
            </View>

            {opponents.length > 0 ? (
              <>
                <TextInput
                  value={opponentQuery}
                  onChangeText={setOpponentQuery}
                  placeholder="Gegner suchen …"
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                  className="rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-base-content"
                />

                {filteredOpponents.length > 0 ? (
                  <Table
                    columns={[
                      { key: "opponent", label: "Gegner", flex: 3 },
                      { key: "record", label: "Bilanz", flex: 1.4 },
                      { key: "sets", label: "Sets", flex: 1 },
                      { key: "rate", label: "Rate", flex: 1.4 },
                    ]}
                  >
                    {filteredOpponents.map((opponent, index) => (
                      <TableRow key={opponent.playerId} index={index}>
                        <TableCell flex={3}>
                          <Pressable
                            onPress={() =>
                              router.push(`/players/${encodeURIComponent(opponent.playerId!)}`)
                            }
                            accessibilityRole="link"
                            className="flex-1"
                          >
                            <Text className="text-primary" numberOfLines={1}>
                              {opponent.displayName}
                            </Text>
                          </Pressable>
                        </TableCell>
                        <TableCell flex={1.4}>
                          <Text className="text-base-content">
                            {opponent.wins} - {opponent.losses}
                          </Text>
                        </TableCell>
                        <TableCell flex={1}>
                          <Text className="text-base-content">{opponent.totalSets}</Text>
                        </TableCell>
                        <TableCell flex={1.4}>
                          <Text className="text-base-content">
                            {formatWinRate(opponent.winRate ?? 0)}%
                          </Text>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Table>
                ) : (
                  <View className="rounded-xl border border-dashed border-base-300 p-6">
                    <Text className="text-sm text-base-muted">Keine Gegner gefunden.</Text>
                  </View>
                )}
              </>
            ) : null}
          </CardBody>
        </Card>

        <TabBarSpacer />
      </ScrollView>
    </Screen>
  );
}
