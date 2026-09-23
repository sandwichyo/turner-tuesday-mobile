/**
 * Turner Overview — portiert aus frontend/src/pages/Home.vue.
 *
 * Aufbau wie im Web: Hero mit Teilnahme-Aufruf, darunter die Event-Auswahl mit
 * den Endplatzierungen und schließlich die Ranking-Tabelle. Was die Seite im
 * Web zweispaltig nebeneinander stellt, steht hier untereinander.
 *
 * Der Anmeldestand „x/y" am Aufruf-Button ist der einzige Wert dieses Screens,
 * der nicht aus /api/v1 kommt: die Zahl liegt live bei start.gg. Woher die App
 * sie stattdessen holt und was das kostet, steht in lib/api/upcoming.ts.
 */
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import { router } from "expo-router";

import { useEvent, useEvents, useRanking, useScopeOptions } from "@/lib/api/queries";
import type { RankingScope, RankingSection } from "@/lib/api/types";
import { Screen } from "@/components/screen";
import { StartGgLogo } from "@/components/startgg-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EventSearch } from "@/components/ui/event-search";
import { TabBarSpacer } from "@/components/ui/floating-tab-bar";
import { Hero } from "@/components/ui/hero";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/segmented";
import { SignupCounter } from "@/components/ui/signup-counter";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableCell, TableRow, rankIcon } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/states";

const STARTGG_URL = "https://start.gg/whv";

function formatDate(iso?: string | null): string {
  if (!iso) return "n/a";

  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function paged<T>(rows: T[], page: number): T[] {
  return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

function pageCountOf(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function EventPicker() {
  const { data: events, isPending, error, refetch } = useEvents();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [standingsPage, setStandingsPage] = useState(1);

  // Die Liste kommt absteigend — ohne Auswahl zeigt die Seite das jüngste Event.
  const activeId = selectedId ?? events?.[0]?.eventId ?? undefined;
  const { data: event } = useEvent(activeId);

  const standings = event?.standings ?? [];

  if (isPending) return <LoadingState label="Events werden geladen …" />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;

  return (
    <Card>
      <CardBody className="gap-4">
        <Text className="text-lg font-bold text-base-content">Wähle ein Event aus</Text>

        <EventSearch
          events={events ?? []}
          selectedId={activeId}
          formatDate={formatDate}
          onSelect={(eventId) => {
            setSelectedId(eventId);
            setStandingsPage(1);
          }}
        />

        {event ? (
          <>
            <View className="flex-row gap-3">
              <StatTile label="Datum" value={formatDate(event.startAt)} />
              <StatTile
                label="Teilnehmer"
                value={event.numEntrants != null ? String(event.numEntrants) : "n/a"}
              />
            </View>

            <Button
              label="Turnierverlauf ansehen →"
              onPress={() => router.push(`/events/${event.eventId}`)}
              className="self-start"
            />

            <Table
              columns={[
                { key: "rank", label: "#", flex: 1 },
                { key: "player", label: "Spieler", flex: 4 },
              ]}
            >
              {paged(standings, standingsPage).map((standing, index) => (
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
                      className="flex-1"
                    >
                      <Text className="text-primary" numberOfLines={1}>
                        {standing.displayName}
                      </Text>
                    </Pressable>
                  </TableCell>
                </TableRow>
              ))}
            </Table>

            <Pagination
              page={standingsPage}
              pageCount={pageCountOf(standings.length)}
              onChange={setStandingsPage}
            />
          </>
        ) : (
          <View className="rounded-xl border border-dashed border-base-300 p-8">
            <Text className="text-sm text-base-muted">Aktuell ist kein Event verfügbar.</Text>
          </View>
        )}
      </CardBody>
    </Card>
  );
}

function RankingCard() {
  const [scope, setScope] = useState<RankingScope>("qualified");
  const [periodKey, setPeriodKey] = useState("overall");
  const [page, setPage] = useState(1);

  const { data, isPending, error, refetch } = useRanking("quarterly", scope);
  const scopeOptions = useScopeOptions("quarterly");

  const periods = useMemo<(RankingSection & { key: string; label: string })[]>(() => {
    if (!data) return [];

    return [
      {
        key: "overall",
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

  const activePeriod = periods.find((period) => period.key === periodKey) ?? periods[0];
  const rows = activePeriod?.rows ?? [];

  if (isPending) return <LoadingState label="Ranking wird geladen …" />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;

  return (
    <Card>
      <CardBody className="gap-4">
        <View className="gap-1">
          <Text className="text-lg font-bold text-base-content">Ranking</Text>
          <Text className="text-sm text-base-muted">
            Sortiert nach durchschnittlicher Platzierung. Bei Gleichstand wird zunächst H2H
            berücksichtigt und dann die Anzahl teilgenommener Events.
          </Text>
        </View>

        <Segmented
          options={scopeOptions}
          value={scope}
          onChange={(key) => {
            setScope(key as RankingScope);
            setPage(1);
          }}
          padded={false}
        />

        {periods.length > 1 ? (
          <Segmented
            options={periods.map(({ key, label }) => ({ key, label }))}
            value={activePeriod?.key ?? "overall"}
            onChange={(key) => {
              setPeriodKey(key);
              setPage(1);
            }}
            tone="secondary"
            padded={false}
          />
        ) : null}

        <Text className="text-sm text-base-muted">
          Berücksichtigt werden {activePeriod?.eventsConsidered ?? 0} Events
          {data?.rules?.minimumEntrants != null
            ? ` mit mindestens ${data.rules.minimumEntrants} Teilnehmern.`
            : "."}
          {data?.rules?.minimumAttendances != null
            ? ` Spieler benötigen mindestens ${data.rules.minimumAttendances} Teilnahmen in dieser Kategorie.`
            : ""}
        </Text>

        <Table
          columns={[
            { key: "rank", label: "#", flex: 1.2 },
            { key: "player", label: "Spieler [Teiln.]", flex: 4 },
            { key: "avg", label: "Ø Platz", flex: 1.6 },
          ]}
        >
          {paged(rows, page).map((row, index) => (
            <TableRow key={row.playerId} index={index}>
              <TableCell flex={1.2}>
                <Text className="font-semibold text-base-content">{row.rank}</Text>
                <Text>{rankIcon(row.rank ?? 0)}</Text>
              </TableCell>
              <TableCell flex={4}>
                <Pressable
                  onPress={() => router.push(`/players/${encodeURIComponent(row.playerId!)}`)}
                  accessibilityRole="link"
                  className="flex-shrink"
                >
                  <Text className="text-primary" numberOfLines={1}>
                    {row.displayName}
                  </Text>
                </Pressable>
                <Badge tone="neutral" className="px-2 py-0.5">
                  {row.attendances}
                </Badge>
              </TableCell>
              <TableCell flex={1.6}>
                <Text className="text-base-content">
                  {formatAverage(row.averagePlacement ?? 0)}
                </Text>
              </TableCell>
            </TableRow>
          ))}
        </Table>

        <Pagination page={page} pageCount={pageCountOf(rows.length)} onChange={setPage} />
      </CardBody>
    </Card>
  );
}

export default function OverviewScreen() {
  const openStartGg = () => Linking.openURL(STARTGG_URL);

  return (
    <Screen onOpenStartGg={openStartGg}>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Hero
          title="Turner Overview"
          action={
            /*
              Der Anmeldestand steht direkt am Aufruf, wie im Web: die Zahl ist
              der Grund, den Button zu drücken — oder eben nicht. Dort steht sie
              unterhalb von `lg` über dem vollbreiten Button, hier also immer.
            */
            <View className="gap-3">
              <SignupCounter />
              <Button
                label="Jetzt teilnehmen"
                variant="startgg"
                onPress={openStartGg}
                icon={<StartGgLogo size={18} />}
              />
            </View>
          }
        />

        <EventPicker />
        <RankingCard />

        <TabBarSpacer />
      </ScrollView>
    </Screen>
  );
}
