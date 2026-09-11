import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

import "../global.css";

SplashScreen.preventAutoHideAsync();
SplashScreen.hideAsync();

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
    <QueryClientProvider client={queryClient}>
      {/* Fest dunkel, wie das Original — nicht dem Systemschema folgend. */}
      <ThemeProvider value={DarkTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
