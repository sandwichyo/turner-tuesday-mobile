/**
 * Spieler-Detail — portiert aus frontend/src/pages/Participants/Show.vue.
 *
 * Platzierungshistorie, Eventliste, meistgespielte Charaktere und H2H. Den
 * Verlauf zeichnet im Web chart.js, hier PlacementChart auf react-native-svg.
 *
 * Charaktere und H2H lassen sich über einen Zeitraum-Regler eingrenzen. Die
 * Zahlen dafür stehen schon in der Antwort: `characters.timeline` und
 * `headToHead.timeline` führen je Event auf, was gespielt wurde. Bei „Gesamt"
 * bleibt das vom Server gerechnete Aggregat stehen, jeder engere Ausschnitt
 * wird hier aufsummiert — Reihenfolge und Rundung folgen dem Server, damit ein
 * voll aufgezogener Regler dieselbe Liste ergibt.
 */
import { useLocalSearchParams, router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { usePlayer } from "@/lib/api/queries";
import { charactersInRange, h2hInRange, type TimeRange } from "@/lib/player-range";
import { useSeries } from "@/lib/series";
import { useThemeColors } from "@/lib/theme";
import { Screen } from "@/components/screen";
import { Card, CardBody } from "@/components/ui/card";
import { CharacterLineup } from "@/components/ui/character-lineup";
import { TabBarSpacer } from "@/components/ui/floating-tab-bar";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { PlacementChart } from "@/components/ui/placement-chart";
import { RangeSlider } from "@/components/ui/range-slider";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableCell, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/states";

/** Der Ausschnitt, mit dem der Verlauf aufmacht — wie im Web. */
const DEFAULT_CHART_POINTS = 6;

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
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Ein Label je Raste des Reglers: das Datum, sonst der Name des Events. */
function rangeLabels(entries: { startAt?: string | null; label?: string }[]): string[] {
  return entries.map((entry) => formatDate(entry.startAt) || entry.label || "Event");
}

export default function PlayerDetailScreen() {
  const colors = useThemeColors();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { data, isPending, error, refetch } = usePlayer(playerId);
  const { series } = useSeries();

  const [placementQuery, setPlacementQuery] = useState("");
  const [placementPage, setPlacementPage] = useState(1);
  const [opponentQuery, setOpponentQuery] = useState("");
  const [opponentPage, setOpponentPage] = useState(1);
  const [chartPoints, setChartPoints] = useState(DEFAULT_CHART_POINTS);
  const [characterRange, setCharacterRange] = useState<TimeRange | null>(null);
  const [h2hRange, setH2hRange] = useState<TimeRange | null>(null);

  const placements = data?.placements ?? [];
  const characterTimeline = data?.characters?.timeline ?? [];
  const h2hTimeline = data?.headToHead?.timeline ?? [];

  const best = placements.length > 0 ? Math.min(...placements.map((p) => p.placement ?? 0)) : 0;
  const worst = placements.length > 0 ? Math.max(...placements.map((p) => p.placement ?? 0)) : 0;

  const rangedCharacters = useMemo(
    () =>
      charactersInRange(characterTimeline, characterRange, {
        total: data?.characters?.totalSelections ?? 0,
        top: data?.characters?.top ?? [],
      }),
    [characterTimeline, characterRange, data?.characters],
  );

  const rangedH2h = useMemo(
    () =>
      h2hInRange(h2hTimeline, h2hRange, {
        wins: data?.headToHead?.summary?.wins ?? 0,
        losses: data?.headToHead?.summary?.losses ?? 0,
        opponents: data?.headToHead?.opponents ?? [],
      }),
    [h2hTimeline, h2hRange, data?.headToHead],
  );

  /**
   * Der Verlauf nutzt die chronologische Reihenfolge der API, die Tabelle dreht
   * sie um: das jüngste Event zuerst. Events ohne Zeitstempel ans Ende.
   */
  const sortedPlacements = useMemo(
    () =>
      [...placements].sort(
        (a, b) =>
          (b.startAt ? Date.parse(b.startAt) : -Infinity) -
          (a.startAt ? Date.parse(a.startAt) : -Infinity),
      ),
    [placements],
  );

  const filteredPlacements = useMemo(() => {
    const query = placementQuery.trim().toLowerCase();
    if (!query) return sortedPlacements;

    return sortedPlacements.filter((entry) =>
      `${entry.tournamentName ?? ""} ${entry.eventName ?? ""}`.toLowerCase().includes(query),
    );
  }, [sortedPlacements, placementQuery]);

  const filteredOpponents = useMemo(() => {
    const query = opponentQuery.trim().toLowerCase();
    if (!query) return rangedH2h.opponents;

    return rangedH2h.opponents.filter((opponent) =>
      (opponent.displayName ?? "").toLowerCase().includes(query),
    );
  }, [rangedH2h.opponents, opponentQuery]);

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

  const totalSets = rangedH2h.wins + rangedH2h.losses;
  const winRate = totalSets > 0 ? (rangedH2h.wins / totalSets) * 100 : 0;

  const pagedPlacements = filteredPlacements.slice(
    (placementPage - 1) * PAGE_SIZE,
    placementPage * PAGE_SIZE,
  );
  const pagedOpponents = filteredOpponents.slice(
    (opponentPage - 1) * PAGE_SIZE,
    opponentPage * PAGE_SIZE,
  );

  /*
    Der Verlauf zeigt die jüngsten Events. Das Web hängt das an einen Regler;
    hier reichen Vorgaben — auf sechs Punkten trifft ein Finger die Raste
    ohnehin kaum. Angeboten wird nur, was die Liste hergibt.
  */
  const chartOptions = [DEFAULT_CHART_POINTS, 12]
    .filter((count) => count < placements.length)
    .map((count) => ({ key: String(count), label: `Letzte ${count}` }));
  const visiblePlacements = placements.slice(Math.max(0, placements.length - chartPoints));

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
                Platzierungshistorie über Events der Reihe {series.label}.
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
              <Text className="text-sm text-base-muted">
                {visiblePlacements.length} von {placements.length} Events
              </Text>
            </View>

            {chartOptions.length > 0 ? (
              <Segmented
                options={[...chartOptions, { key: "all", label: "Alle" }]}
                value={chartPoints >= placements.length ? "all" : String(chartPoints)}
                onChange={(key) => setChartPoints(key === "all" ? placements.length : Number(key))}
                padded={false}
              />
            ) : null}

            <PlacementChart
              points={visiblePlacements.map((entry) => ({
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
                            {/* Turniersieg — die Krone der Web-Ansicht. */}
                            {entry.placement === 1 ? "👑 " : ""}
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
              <Text className="text-sm text-base-muted">{rangedCharacters.total} Games</Text>
            </View>

            <RangeSlider
              labels={rangeLabels(characterTimeline)}
              value={characterRange}
              onChange={setCharacterRange}
            />

            {rangedCharacters.top.length > 0 ? (
              <>
                <CharacterLineup characters={rangedCharacters.top} />

                {/* Unter der Bühne stehen alle Charaktere, nicht nur die fünf
                    gezeichneten. */}
                <View className="flex-row flex-wrap gap-2">
                  {rangedCharacters.top.map((character, index) => (
                    <View
                      key={character.characterName}
                      className={`flex-row items-center gap-2 rounded-full px-3 py-1 ${
                        index === 0 ? "border border-secondary bg-secondary/10" : "bg-base-200"
                      }`}
                    >
                      <Text className="text-sm font-semibold text-base-content">
                        {character.characterName}
                      </Text>
                      <Text className="text-sm text-base-muted">
                        {character.count}× · {formatWinRate(character.percentage ?? 0)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View className="rounded-xl border border-dashed border-base-300 p-6">
                <Text className="text-sm text-base-muted">
                  {characterRange === null
                    ? "Keine Charakterinformationen hinterlegt."
                    : "Im gewählten Zeitraum wurde kein Charakter gespielt."}
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
                {rangedH2h.wins} - {rangedH2h.losses}
              </Text>
            </View>

            <RangeSlider
              labels={rangeLabels(h2hTimeline)}
              value={h2hRange}
              onChange={(range) => {
                setH2hRange(range);
                setOpponentPage(1);
              }}
            />

            <View className="flex-row gap-3">
              <StatTile label="Gewonnen" value={String(rangedH2h.wins)} />
              <StatTile label="Verloren" value={String(rangedH2h.losses)} />
            </View>
            <View className="flex-row">
              <StatTile label="Gewinnrate" value={`${formatWinRate(winRate)}%`} />
            </View>

            {rangedH2h.opponents.length > 0 ? (
              <>
                <TextInput
                  value={opponentQuery}
                  onChangeText={(text) => {
                    setOpponentQuery(text);
                    setOpponentPage(1);
                  }}
                  placeholder="Gegner suchen …"
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                  className="rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-base-content"
                />

                {filteredOpponents.length > 0 ? (
                  <>
                    <Table
                      columns={[
                        { key: "opponent", label: "Gegner", flex: 3 },
                        { key: "record", label: "Bilanz", flex: 1.4 },
                        { key: "sets", label: "Sets", flex: 1 },
                        { key: "rate", label: "Rate", flex: 1.4 },
                      ]}
                    >
                      {pagedOpponents.map((opponent, index) => (
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

                    <Pagination
                      page={opponentPage}
                      pageCount={Math.max(1, Math.ceil(filteredOpponents.length / PAGE_SIZE))}
                      onChange={setOpponentPage}
                    />
                  </>
                ) : (
                  <View className="rounded-xl border border-dashed border-base-300 p-6">
                    <Text className="text-sm text-base-muted">Kein Gegner gefunden.</Text>
                  </View>
                )}
              </>
            ) : (
              <View className="rounded-xl border border-dashed border-base-300 p-6">
                <Text className="text-sm text-base-muted">
                  {h2hRange === null
                    ? "Noch keine H2H Daten verfügbar."
                    : "Im gewählten Zeitraum wurde kein Set gespielt."}
                </Text>
              </View>
            )}
          </CardBody>
        </Card>

        <TabBarSpacer />
      </ScrollView>
    </Screen>
  );
}
