/**
 * Einstellungen — der einzige Screen ohne Vorlage im Web: die Website hat
 * weder ein Theme zur Wahl noch Benachrichtigungen, beides gibt es nur auf dem
 * Gerät.
 *
 * Zwei Schalter, sonst nichts: Darstellung (lib/theme.tsx) und die Erinnerung
 * an den Ranked Day (lib/notifications.tsx). Beide wirken sofort und liegen in
 * AsyncStorage, überstehen also den nächsten Start.
 */
import Constants from "expo-constants";
import { Linking, ScrollView, Switch, Text, View } from "react-native";

import { useDataVersion } from "@/lib/api/queries";
import { useNotifications } from "@/lib/notifications";
import { useThemeColors, useThemePreference, type ThemePreference } from "@/lib/theme";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { TabBarSpacer } from "@/components/ui/floating-tab-bar";
import { Hero } from "@/components/ui/hero";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";

/** Der Name, unter dem die App im System steht — aus app.json, nicht doppelt. */
const APP_NAME = Constants.expoConfig?.name ?? "Melee im Norden";

const THEMES: { key: ThemePreference; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Hell" },
  { key: "dark", label: "Dunkel" },
];

function formatDate(iso?: string | null): string {
  if (!iso) return "n/a";

  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Überschrift und Nebensatz — in beiden Karten derselbe Aufbau. */
function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <View className="gap-1">
      <Text className="text-lg font-bold text-base-content">{title}</Text>
      <Text className="text-sm text-base-muted">{hint}</Text>
    </View>
  );
}

function Appearance() {
  const { preference, setPreference } = useThemePreference();

  return (
    <Card>
      <CardBody className="gap-4">
        <SectionTitle
          title="Darstellung"
          hint={'„System" folgt dem Gerät. Ohne eigene Wahl bleibt die App dunkel, wie die Website.'}
        />

        <Segmented
          options={THEMES}
          value={preference}
          onChange={(key) => setPreference(key as ThemePreference)}
          padded={false}
        />
      </CardBody>
    </Card>
  );
}

function Reminders() {
  const { enabled, denied, supported, setEnabled } = useNotifications();
  const colors = useThemeColors();

  return (
    <Card>
      <CardBody className="gap-4">
        <SectionTitle
          title="Benachrichtigungen"
          hint="Der Takt steht fest, deshalb plant die App die Nachrichten selbst — ganz ohne Server."
        />

        <View className="flex-row items-center gap-4">
          <View className="flex-1">
            <Text className="font-medium text-base-content">Ranked Day</Text>
            <Text className="text-sm text-base-muted">
              Eine Nachricht, sobald Slippi Ranked wieder für alle frei ist.
            </Text>
          </View>

          <Switch
            value={enabled}
            onValueChange={setEnabled}
            disabled={!supported}
            accessibilityLabel="Erinnerung an den Ranked Day"
            trackColor={{ false: colors.grid, true: colors.primary }}
          />
        </View>

        {denied ? (
          <View className="gap-3 rounded-xl bg-base-200 p-4">
            <Text className="text-sm text-base-muted">
              Das System lässt keine Nachrichten zu. Erlaube sie für {APP_NAME}, dann
              greift der Schalter.
            </Text>
            <Button
              label="Zu den Systemeinstellungen"
              variant="ghost"
              onPress={() => Linking.openSettings()}
            />
          </View>
        ) : null}

        {supported ? null : (
          <Text className="text-sm text-base-muted">
            Im Browser gibt es keine geplanten Nachrichten — dieser Schalter wirkt nur in
            der App.
          </Text>
        )}
      </CardBody>
    </Card>
  );
}

function About() {
  const { data } = useDataVersion();

  return (
    <Card>
      <CardBody className="gap-4">
        <SectionTitle
          title="Über"
          hint="Die Daten kommen aus der Melee-API und ändern sich nach jedem Turnier."
        />

        <View className="flex-row gap-3">
          <StatTile label="App" value={Constants.expoConfig?.version ?? "n/a"} />
          <StatTile label="Datenstand" value={formatDate(data?.dataUpdatedAt)} />
        </View>
      </CardBody>
    </Card>
  );
}

export default function SettingsScreen() {

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Hero title="Einstellungen" subtitle="Darstellung und Erinnerungen" />

        <Appearance />
        <Reminders />
        <About />

        <TabBarSpacer />
      </ScrollView>
    </Screen>
  );
}
