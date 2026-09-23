import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

import { NotificationsProvider, RankedDayReminders } from "@/lib/notifications";
import { ThemeProvider, useScheme } from "@/lib/theme";

import "../global.css";

// Weg ist er, sobald die Theme-Wahl aus dem Speicher da ist — siehe lib/theme.tsx.
SplashScreen.preventAutoHideAsync();

/**
 * Alles, was das gewählte Schema kennen muss. Eine Ebene tiefer als der
 * ThemeProvider, weil `useScheme()` dessen Zustand liest.
 */
function App() {
  const scheme = useScheme();

  return (
    <NavigationThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      {/* Plant die Ranked-Day-Erinnerungen; zeichnet nichts. */}
      <RankedDayReminders />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  /**
   * Der Client gehört in den State, nicht ins Modul: beim Fast Refresh würde
   * ein Modul-Singleton sonst den Cache über Reloads hinweg festhalten.
   *
   * `staleTime` ist großzügig, weil sich die Daten nur beim Import ändern —
   * typischerweise einmal pro Woche nach dem Turnier.
   */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 24 * 60 * 60 * 1000,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <NotificationsProvider>
          <App />
        </NotificationsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
