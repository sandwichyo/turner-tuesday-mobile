/**
 * Die Event-Auswahl aus Home.vue: ein Suchfeld, das eine Vorschlagsliste
 * öffnet. Der Platzhalter zeigt das gewählte Event, die Liste Bezeichnung,
 * Datum und Teilnehmerzahl, das gewählte mit einem Haken.
 *
 * Wie im Web erscheint die Liste auch ohne Eingabe, sobald das Feld den Fokus
 * hat — sonst käme man ohne Tippen an kein anderes Event.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { EventSummary } from "@/lib/api/types";

export function EventSearch({
  events,
  selectedId,
  onSelect,
  formatDate,
}: {
  events: EventSummary[];
  selectedId?: number;
  onSelect: (eventId: number) => void;
  formatDate: (iso?: string | null) => string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = events.find((event) => event.eventId === selectedId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;

    return events.filter((event) => (event.label ?? event.name ?? "").toLowerCase().includes(needle));
  }, [events, query]);

  return (
    <View className="gap-2">
      <Text className="text-sm text-base-content">Event suchen</Text>

      <TextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={selected?.label ?? selected?.name ?? "Event auswählen"}
        placeholderTextColor="rgb(122 130 144)"
        editable={events.length > 0}
        className="rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-base-content"
      />

      {open ? (
        filtered.length > 0 ? (
          <ScrollView
            className="max-h-72 rounded-xl border border-base-300 bg-base-100"
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {filtered.map((event) => {
              const isSelected = event.eventId === selectedId;

              return (
                <Pressable
                  key={event.eventId}
                  onPress={() => {
                    onSelect(event.eventId!);
                    setQuery("");
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className="flex-row items-start justify-between gap-2 px-3 py-2.5"
                >
                  <View className="flex-1">
                    <Text
                      className={`text-base-content ${isSelected ? "font-semibold" : ""}`}
                      numberOfLines={1}
                    >
                      {event.label ?? event.name}
                    </Text>
                    <Text className="text-xs text-base-muted">
                      {formatDate(event.startAt)}
                      {event.numEntrants ? ` · ${event.numEntrants} Teilnehmer` : ""}
                    </Text>
                  </View>
                  {isSelected ? <Text className="text-primary">✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View className="rounded-xl border border-base-300 bg-base-100 p-4">
            <Text className="text-sm text-base-muted">Kein Event gefunden.</Text>
          </View>
        )
      ) : null}
    </View>
  );
}
