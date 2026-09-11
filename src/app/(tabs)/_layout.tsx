import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

/**
 * Die Bottom-Navigation. Farben als Werte, weil NativeWind-Klassen in den
 * Optionen der Navigation nicht greifen — die Werte sind dieselben Tokens wie
 * in global.css, hier fest im Dark-Theme.
 */
const COLORS = {
  active: "rgb(116 128 255)",
  inactive: "rgb(122 130 144)",
  background: "rgb(29 35 42)",
  border: "rgb(21 25 30)",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.active,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Übersicht",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="power-ranking"
        options={{
          title: "Power Ranking",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />

      {/*
        Die Detail-Screens gehören in den Tab-Navigator, damit die
        Bottom-Navigation stehen bleibt — im Web bleibt die Navbar auch auf
        jeder Unterseite. `href: null` hält sie aus der Leiste heraus.
      */}
      <Tabs.Screen name="events/[eventId]" options={{ href: null }} />
      <Tabs.Screen name="players/[playerId]" options={{ href: null }} />
    </Tabs>
  );
}
