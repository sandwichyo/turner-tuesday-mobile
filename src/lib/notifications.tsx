/**
 * Lokale Erinnerungen an den Slippi Free Ranked Day.
 *
 * Pushen kann niemand: /api/v1 liefert Daten und kennt keine Geräte. Der Takt
 * steht aber fest (lib/ranked-day.ts), also plant die App die Nachrichten
 * selbst — lokal, und damit auch dann zugestellt, wenn die App nicht läuft.
 *
 * Weil nichts von außen nachlegt, werden mehrere Fenster auf einmal eingestellt
 * und bei jedem Start neu gesetzt. `AHEAD` bleibt dabei klein: iOS hält je App
 * höchstens 64 anstehende Nachrichten, und wer die App alle paar Wochen öffnet,
 * hat mit sechs Fenstern immer noch welche in der Warteschlange.
 *
 * Der Schalter in den Einstellungen ist der Zustand hier; die Erlaubnis des
 * Systems ist der zweite Teil. Verweigert das System sie, bleibt der Schalter
 * aus — sonst verspräche er etwas, das nicht kommt.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { createContext, use, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useRankedDay } from "./api/queries";
import { scheduleFrom, upcomingStarts, type RankedDaySchedule } from "./ranked-day";

const STORAGE_KEY = "turner:ranked-day-reminders";
const CHANNEL_ID = "ranked-day";
const AHEAD = 6;

/** Im Web gibt es keine geplanten lokalen Nachrichten — dort bleibt es beim Hinweis. */
const SUPPORTED = Platform.OS !== "web";

if (SUPPORTED) {
  // Ohne Handler bliebe eine Nachricht stumm, solange die App offen ist.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  // Nach einem „Nein" fragt iOS nicht erneut; die Antwort kommt dann sofort
  // wieder negativ zurück, und die Einstellungen zeigen den Weg über das System.
  if (!current.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();

  return asked.granted;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Ranked Day",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function scheduleReminders(schedule: RankedDaySchedule): Promise<void> {
  await ensureChannel();

  // Erst räumen: die Liste wird bei jedem Start neu aufgebaut, sonst stünden
  // alte Zeitpunkte doppelt darin.
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const date of upcomingStarts(Date.now(), AHEAD, schedule)) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Ranked Day",
        body: `Slippi Ranked ist ab jetzt ${schedule.durationHours} Stunden für alle frei.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
  }
}

type NotificationControl = {
  enabled: boolean;
  /** Das System hat die Erlaubnis verweigert — der Schalter allein hilft nicht. */
  denied: boolean;
  supported: boolean;
  setEnabled: (next: boolean) => void;
};

const NotificationContext = createContext<NotificationControl | undefined>(undefined);

export function useNotifications(): NotificationControl {
  const control = use(NotificationContext);

  if (!control) throw new Error("useNotifications braucht den NotificationsProvider.");

  return control;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!SUPPORTED) return;

    let active = true;

    void (async () => {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) === "1";
      if (!stored || !active) return;

      // Die Erlaubnis kann zwischen zwei Starts im System zurückgenommen worden
      // sein; dann steht der Schalter wieder auf aus.
      const granted = (await Notifications.getPermissionsAsync()).granted;

      if (!active) return;

      setEnabledState(granted);
      setDenied(!granted);
    })();

    return () => {
      active = false;
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    if (!next) {
      setEnabledState(false);
      setDenied(false);
      void AsyncStorage.setItem(STORAGE_KEY, "0");

      return;
    }

    void (async () => {
      const granted = await ensurePermission();

      setEnabledState(granted);
      setDenied(!granted);

      await AsyncStorage.setItem(STORAGE_KEY, granted ? "1" : "0");
    })();
  }, []);

  return (
    <NotificationContext value={{ enabled, denied, supported: SUPPORTED, setEnabled }}>
      {children}
    </NotificationContext>
  );
}

/**
 * Hält die Warteschlange aktuell: plant neu, sobald der Schalter umgelegt wird
 * oder ein neuer Takt aus der API kommt. Rendert nichts — gehört in den Rahmen
 * der App, damit es einmal pro Start passiert und nicht pro Screen.
 */
export function RankedDayReminders() {
  const { enabled } = useNotifications();
  const { data } = useRankedDay();

  const { anchorMs, cycleDays, durationHours } = scheduleFrom(data);

  useEffect(() => {
    if (!SUPPORTED) return;

    if (!enabled) {
      void Notifications.cancelAllScheduledNotificationsAsync();

      return;
    }

    void scheduleReminders({ anchorMs, cycleDays, durationHours });
  }, [enabled, anchorMs, cycleDays, durationHours]);

  return null;
}
