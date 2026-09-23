import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";

import { FloatingTabBar } from "@/components/ui/floating-tab-bar";

/**
 * Die Bottom-Navigation. Das Aussehen steckt in FloatingTabBar — hier stehen
 * nur die Einträge: Titel und Symbol. Gefüllt, solange der Tab aktiv ist, sonst
 * als Umriss; so machen es die Leisten von iOS.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Übersicht",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="power-ranking"
        options={{
          title: "Power Ranking",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "trophy" : "trophy-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Einstellungen",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={size}
              color={color}
            />
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
