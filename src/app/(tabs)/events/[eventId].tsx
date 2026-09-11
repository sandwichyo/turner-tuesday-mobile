/**
 * Event-Detail — portiert aus frontend/src/pages/Events/Show.vue.
 *
 * Der Turnierverlauf: jedes Set zurück in seiner Bracket-Runde, mit wer wen
 * geschlagen hat, dem Spielstand und den gewählten Charakteren, gefolgt von den
 * Endplatzierungen.
 *
 * Die Gruppierung macht im Web der Controller; die API liefert ein flaches
 * `sets[]`, deshalb übernimmt das hier src/lib/bracket.ts.
 */
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useEvent } from "@/lib/api/queries";
import {
  buildBracket,
  toBracketRows,
  type BracketRound,
  type SetSide,
  type SetView,
} from "@/lib/bracket";
import { getCharacterStyle, getStockIcon } from "@/lib/characters";
import { Screen } from "@/components/screen";
import { StartGgLogo } from "@/components/startgg-logo";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableCell, TableRow, rankIcon } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/states";

const STARTGG_URL = "https://start.gg/whv";

function formatDate(iso?: string | null): string {
  if (!iso) return "Unbekannt";

  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function bracketLabel(bracket: BracketRound["bracket"]): string {
  if (bracket === "winners") return "Winners";
  if (bracket === "losers") return "Losers";

  return "";
}

/** Die Charakterwahl einer Seite: Stock-Icon, sonst ein Namensschild. */
function CharacterPicks({ characters }: { characters: SetSide["characters"] }) {
  if (characters.length === 0) return null;

  return (
    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
      {characters.map((character) => {
        const icon = getStockIcon(character.characterName);
        const style = getCharacterStyle(character.characterName);

        return (
          <View key={character.characterId} className="flex-row items-center gap-1">
            {icon ? (
              <Image source={icon} style={{ width: 20, height: 20 }} contentFit="contain" />
            ) : (
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: style.background }}
              >
                <Text className="text-xs font-semibold" style={{ color: style.color }}>
                  {character.characterName}
                </Text>
              </View>
            )}
            {character.games > 1 ? (
              <Text className="text-xs text-base-muted">×{character.games}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Eine Seite eines Sets — Sieger zuerst, damit sich die Karte wie eine Ergebniszeile liest. */
function SetSideRow({ side, won }: { side: SetSide; won: boolean }) {
  return (
    <View
      className={`flex-row items-start justify-between gap-3 rounded-lg px-2 py-1.5 ${
        won ? "bg-success/10" : ""
      }`}
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          {won ? (
            <Text className="text-sm" accessibilityLabel="Sieger">
              👑
            </Text>
          ) : null}
          <Pressable
            onPress={() => router.push(`/players/${encodeURIComponent(side.playerId)}`)}
            accessibilityRole="link"
            className="flex-shrink"
          >
            <Text
              className={won ? "font-semibold text-base-content" : "text-base-muted"}
              numberOfLines={1}
            >
              {side.displayName}
            </Text>
          </Pressable>
        </View>

        <CharacterPicks characters={side.characters} />
      </View>

      <Text className={`text-lg ${won ? "font-semibold text-base-content" : "text-base-muted"}`}>
        {side.score ?? "–"}
      </Text>
    </View>
  );
}

function SetCard({ set }: { set: SetView }) {
  const scoreless = set.winner.score === null && set.loser.score === null;

  return (
    <View className="rounded-xl border border-base-300 bg-base-200/40 p-3">
      {scoreless ? (
        <Text className="mb-2 text-xs text-base-muted" numberOfLines={1}>
          {set.displayScore ?? "Ergebnis unbekannt"}
        </Text>
      ) : null}

      <View className="gap-1">
        <SetSideRow side={set.winner} won />
        <SetSideRow side={set.loser} won={false} />
      </View>
    </View>
  );
}

function RoundSection({ round }: { round: BracketRound }) {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-lg font-semibold text-base-content">{round.label}</Text>

        {round.bracket !== "other" ? (
          <View
            className={`rounded-full px-2 py-0.5 ${
              round.bracket === "winners" ? "bg-success" : "bg-warning"
            }`}
          >
            <Text className="text-xs font-semibold text-neutral">
              {bracketLabel(round.bracket)}
            </Text>
          </View>
        ) : null}

        {round.phase ? (
          <View className="rounded-full bg-base-300 px-2 py-0.5">
            <Text className="text-xs text-base-muted">{round.phase}</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3">
        {round.sets.map((set) => (
          <SetCard key={set.setId} set={set} />
        ))}
      </View>
    </View>
  );
}

export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { data, isPending, error, refetch } = useEvent(Number(eventId));
  const [playerQuery, setPlayerQuery] = useState("");

  const openStartGg = () => Linking.openURL(STARTGG_URL);

  const { rounds, totals } = useMemo(
    () => buildBracket(data?.sets ?? [], (data?.standings ?? []).length),
    [data],
  );

  /** Ein Spielername filtert den ganzen Baum auf dessen Sets. */
  const filteredRounds = useMemo(() => {
    const query = playerQuery.trim().toLowerCase();
    if (!query) return rounds;

    return rounds
      .map((round) => ({
        ...round,
        sets: round.sets.filter(
          (set) =>
            set.winner.displayName.toLowerCase().includes(query) ||
            set.loser.displayName.toLowerCase().includes(query),
        ),
      }))
      .filter((round) => round.sets.length > 0);
  }, [rounds, playerQuery]);

  const visibleSetCount = filteredRounds.reduce((sum, round) => sum + round.sets.length, 0);
  const rows = useMemo(() => toBracketRows(filteredRounds), [filteredRounds]);

  if (isPending) {
    return (
      <Screen onOpenStartGg={openStartGg}>
        <LoadingState label="Event wird geladen …" />
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

  const standings = data?.standings ?? [];

  return (
    <Screen onOpenStartGg={openStartGg}>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <Card>
          <CardBody className="gap-4">
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
              <Text className="text-base-muted">← Zurück zur Übersicht</Text>
            </Pressable>

            <View>
              <Text className="text-2xl font-bold text-base-content">
                {data?.tournament?.name ?? "Event"}
              </Text>
              <Text className="text-base-muted">
                {data?.name && data.name !== data.tournament?.name ? `${data.name} · ` : ""}
                Turnierverlauf und Endplatzierungen.
              </Text>
            </View>

            <View className="flex-row gap-3">
              <StatTile label="Datum" value={formatDate(data?.startAt)} />
              <StatTile label="Teilnehmer" value={String(data?.numEntrants ?? totals.players)} />
            </View>
            <View className="flex-row gap-3">
              <StatTile label="Sets" value={String(totals.sets)} />
              <StatTile label="Spiele" value={totals.games > 0 ? String(totals.games) : "n/a"} />
            </View>

            {data?.startggUrl ? (
              <Button
                label="Auf start.gg ansehen"
                variant="startgg"
                onPress={() => Linking.openURL(data.startggUrl!)}
                icon={<StartGgLogo size={18} />}
              />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-4">
            <View>
              <Text className="text-xl font-semibold text-base-content">Turnierverlauf</Text>
              <Text className="text-sm text-base-muted">
                Jede Runde mit Ergebnis und den gewählten Charakteren.
              </Text>
            </View>

            <TextInput
              value={playerQuery}
              onChangeText={setPlayerQuery}
              placeholder="Nach Spieler filtern …"
              placeholderTextColor="rgb(122 130 144)"
              autoCorrect={false}
              className="rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-base-content"
            />

            {rounds.length === 0 ? (
              <View className="rounded-xl bg-base-200 p-6">
                <Text className="text-center text-base-muted">
                  Für dieses Event sind keine Sets gespeichert. Nach einem vollständigen Import
                  erscheint hier der Turnierverlauf.
                </Text>
              </View>
            ) : visibleSetCount === 0 ? (
              <View className="rounded-xl bg-base-200 p-6">
                <Text className="text-center text-base-muted">Keine Sets für „{playerQuery}".</Text>
              </View>
            ) : (
              <View className="gap-6">
                {rows.map((row) => (
                  <View key={row.key} className="gap-6">
                    {row.rounds.map((round) => (
                      <RoundSection key={round.key} round={round} />
                    ))}
                  </View>
                ))}
              </View>
            )}
          </CardBody>
        </Card>

        {standings.length > 0 ? (
          <Card>
            <CardBody className="gap-4">
              <Text className="text-xl font-semibold text-base-content">Endplatzierungen</Text>

              <Table
                columns={[
                  { key: "rank", label: "#", flex: 1 },
                  { key: "player", label: "Spieler", flex: 4 },
                ]}
              >
                {standings.map((standing, index) => (
                  <TableRow key={standing.playerId} index={index}>
                    <TableCell flex={1}>
                      <Text className="font-semibold text-base-content">
                        {standing.rankPlacement}
                      </Text>
                      <Text>{rankIcon(standing.rankPlacement ?? 0)}</Text>
                    </TableCell>
                    <TableCell flex={4}>
                      <Pressable
                        onPress={() =>
                          router.push(`/players/${encodeURIComponent(standing.playerId!)}`)
                        }
                        accessibilityRole="link"
                      >
                        <Text className="text-primary" numberOfLines={1}>
                          {standing.displayName}
                        </Text>
                      </Pressable>
                    </TableCell>
                  </TableRow>
                ))}
              </Table>
            </CardBody>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
