import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useColorScheme } from "react-native";

/**
 * Die Tab-Farben kommen aus denselben Tokens wie global.css. NativeWind-Klassen
 * greifen in den Optionen der Navigation nicht, deshalb hier als Werte.
 */
const COLORS = {
  light: { active: "rgb(73 30 255)", inactive: "rgb(107 114 128)", bg: "rgb(255 255 255)" },
  dark: { active: "rgb(116 128 255)", inactive: "rgb(122 130 144)", bg: "rgb(29 35 42)" },
};

export default function TabsLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = COLORS[scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarStyle: { backgroundColor: colors.bg, borderTopWidth: 0 },
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
    </Tabs>
  );
}
