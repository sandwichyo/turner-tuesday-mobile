/**
 * Übersicht — vorerst die Event-Liste aus /api/v1/events.
 *
 * Die Startseite der Website zeigt darüber hinaus den Anmeldestand des nächsten
 * Turner Tuesday. Diese Zahl kommt live von start.gg über den
 * UpcomingEventProvider und ist in der API (noch) nicht exponiert — sie fehlt
 * hier deshalb, bis ein Endpunkt dafür existiert.
 */
import { Link } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useEvents } from "@/lib/api/queries";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

function formatDate(iso?: string | null): string {
  if (!iso) return "Datum unbekannt";

  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function OverviewScreen() {
  const { data, isPending, error, refetch, isRefetching } = useEvents();

  if (isPending) {
    return (
      <SafeAreaView className="flex-1 bg-base-200" edges={["top"]}>
        <LoadingState label="Events werden geladen …" />
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

  return (
    <SafeAreaView className="flex-1 bg-base-200" edges={["top"]}>
      <View className="px-4 pb-3 pt-2">
        <Text className="text-3xl font-bold text-base-content">Turner Tuesdays</Text>
        <Text className="text-base-muted">{data?.length ?? 0} Events importiert</Text>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(event) => String(event.eventId)}
        contentContainerClassName="px-4 pb-8"
        refreshing={isRefetching}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <Card className="mb-3">
            <CardBody className="gap-1">
              <Text className="text-lg font-bold text-base-content" numberOfLines={2}>
                {item.label ?? item.name}
              </Text>
              <View className="flex-row justify-between">
                <Text className="text-sm text-base-muted">{formatDate(item.startAt)}</Text>
                <Text className="text-sm text-base-muted">
                  {item.numEntrants != null ? `${item.numEntrants} Teilnehmer` : ""}
                </Text>
              </View>
            </CardBody>
          </Card>
        )}
        ListEmptyComponent={<EmptyState message="Noch keine Events importiert." />}
      />
    </SafeAreaView>
  );
}
