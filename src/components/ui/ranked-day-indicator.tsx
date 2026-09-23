/**
 * Der Ranked-Day-Anzeiger: unten rechts ein Punkt, der grün pulst, solange
 * Slippis Free Ranked Day läuft, und rot ruht, wenn nicht. Ein Tipp klappt die
 * Einzelheiten darüber auf — Countdown, Fenster, Takt.
 *
 * Wie im Web sitzt er im Rahmen (screen.tsx) und nicht auf einem Screen — der
 * Countdown gilt überall. Jeder Screen bringt damit seinen eigenen Anzeiger
 * mit; sichtbar ist immer nur der oberste, und den Takt teilen sich alle über
 * React Query.
 *
 * Zwei Dinge macht die App anders als das Web, beide aus demselben Grund — hier
 * läuft die Uhr auf einem Gerät, das sich schlafen legt:
 *
 * - Der Takt kommt aus `schedule` der API und der Countdown wird bei jedem Tick
 *   aus `Date.now()` neu gerechnet, nicht heruntergezählt. Nach Stunden im
 *   Hintergrund stimmt er damit sofort wieder, statt an der Stelle
 *   weiterzuzählen, an der das System die Timer eingefroren hat.
 * - Sekundengenau tickt er nur, wenn das auch jemand sieht: bei offener Karte
 *   oder in der letzten Stunde. Sonst reicht die halbe Minute.
 */
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import Ionicons from "@expo/vector-icons/Ionicons";

import { useRankedDay } from "@/lib/api/queries";
import {
  clockOffset,
  evaluateRankedDay,
  formatRemaining,
  formatWindow,
  scheduleFrom,
  statusLabel,
  type RankedDaySchedule,
  type RankedDayWindow,
} from "@/lib/ranked-day";
import { useThemeColors } from "@/lib/theme";
import { useTabBarSpace } from "./floating-tab-bar";

const TICK_FAST_MS = 1000;
const TICK_SLOW_MS = 30_000;

/** Ab hier lohnt die Sekundenanzeige. */
const FAST_BELOW_MS = 60 * 60 * 1000;

/** Nach so langer Pause im Hintergrund wird der Takt neu abgeglichen. */
const RESYNC_AFTER_MS = 5 * 60 * 1000;

const TABULAR = { fontVariant: ["tabular-nums" as const] };

function useRankedDayCountdown(detailed: boolean) {
  const { data, dataUpdatedAt, refetch } = useRankedDay();
  const [now, setNow] = useState(() => Date.now());

  // In einer Ref, damit der AppState-Effekt nicht an ihnen hängt: sie ändern
  // sich mit jeder Antwort, der Listener soll dafür nicht neu gesetzt werden.
  const resync = useRef({ dataUpdatedAt, refetch });
  useEffect(() => {
    resync.current = { dataUpdatedAt, refetch };
  }, [dataUpdatedAt, refetch]);

  const schedule = scheduleFrom(data);
  const current = evaluateRankedDay(now + clockOffset(data, dataUpdatedAt), schedule);

  const fast = detailed || current.remainingMs < FAST_BELOW_MS;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), fast ? TICK_FAST_MS : TICK_SLOW_MS);

    return () => clearInterval(timer);
  }, [fast]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;

      // Zuerst die Anzeige — sie darf nicht bis zum nächsten Tick alt bleiben.
      setNow(Date.now());

      const { dataUpdatedAt: updatedAt, refetch: refresh } = resync.current;
      if (Date.now() - updatedAt > RESYNC_AFTER_MS) void refresh();
    });

    return () => subscription.remove();
  }, []);

  return { current, schedule };
}

/** Der Ring des Web-Originals (`animate-ping`): aufziehen und dabei ausblenden. */
function PulsingDot({ active }: { active: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );

    return () => cancelAnimation(progress);
  }, [active, progress]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value }],
    opacity: 0.75 * (1 - progress.value),
  }));

  return (
    <View className="h-2.5 w-2.5 items-center justify-center">
      {active ? (
        <Animated.View
          style={ring}
          className="absolute h-2.5 w-2.5 rounded-full bg-success"
        />
      ) : null}
      <View className={`h-2.5 w-2.5 rounded-full ${active ? "bg-success" : "bg-error"}`} />
    </View>
  );
}

function Details({
  current,
  schedule,
  onClose,
}: {
  current: RankedDayWindow;
  schedule: RankedDaySchedule;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const remaining = formatRemaining(current.remainingMs);

  return (
    <View className="w-72 gap-1 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-lg shadow-black/30">
      <View className="flex-row items-start justify-between gap-2">
        <Text className="text-xs uppercase tracking-wide text-base-muted">
          Slippi Free Ranked Day
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          hitSlop={12}
        >
          <Ionicons name="close" size={14} color={colors.muted} />
        </Pressable>
      </View>

      <Text
        className={`font-medium ${current.active ? "text-success" : "text-base-content"}`}
        style={TABULAR}
      >
        {current.active ? `Läuft noch ${remaining}` : `Startet in ${remaining}`}
      </Text>

      <Text className="text-xs text-base-muted">{formatWindow(current)}</Text>

      <Text className="mt-1 text-xs text-base-muted">
        Ranked ist alle {schedule.cycleDays} Tage für {schedule.durationHours} Stunden für
        alle frei.
      </Text>
    </View>
  );
}

export function RankedDayIndicator() {
  const [open, setOpen] = useState(false);
  const { current, schedule } = useRankedDayCountdown(open);

  // Über der schwebenden Navigation, nicht dahinter: deren Höhe ist der Abstand
  // nach unten, die Safe Area steckt schon darin.
  const tabBarSpace = useTabBarSpace();

  const label = statusLabel(current);

  return (
    <>
      {/* Fängt den Tipp daneben ab — das Gegenstück zum pointerdown-Handler im Web. */}
      {open ? (
        <Pressable
          className="absolute inset-0"
          onPress={() => setOpen(false)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      <View className="absolute right-4 items-end gap-2" style={{ bottom: tabBarSpace + 8 }}>
        {open ? (
          <Details current={current} schedule={schedule} onClose={() => setOpen(false)} />
        ) : null}

        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open }}
          className={`h-12 flex-row items-center justify-center rounded-full border border-base-300 bg-base-100 shadow-lg shadow-black/30 ${
            current.active ? "gap-2 px-4" : "w-12"
          }`}
        >
          <PulsingDot active={current.active} />
          {current.active ? (
            <Text className="text-xs font-medium text-success">Ranked Day</Text>
          ) : null}
        </Pressable>
      </View>
    </>
  );
}
