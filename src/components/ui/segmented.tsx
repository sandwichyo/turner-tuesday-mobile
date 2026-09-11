/**
 * Ersatz für die Button-Reihen der Website (`btn btn-sm` + aktiv/ghost). Die
 * Optionen können viele werden — die Zeiträume wachsen mit jedem Quartal —,
 * deshalb scrollt die Reihe horizontal statt umzubrechen.
 *
 * `padded` steuert den Seitenabstand: außerhalb einer Karte soll die Reihe am
 * Bildschirmrand ausgerichtet sein, innerhalb bringt die Karte ihn schon mit.
 */
import { Pressable, ScrollView, Text } from "react-native";

export type SegmentOption = { key: string; label: string };

export function Segmented({
  options,
  value,
  onChange,
  tone = "primary",
  padded = true,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  tone?: "primary" | "secondary";
  padded?: boolean;
}) {
  const activeBg = tone === "primary" ? "bg-primary" : "bg-secondary";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName={`gap-2 ${padded ? "px-4" : ""}`}
    >
      {options.map((option) => {
        const active = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`rounded-lg px-4 py-2 ${active ? activeBg : "bg-base-200"}`}
          >
            <Text
              className={`text-sm font-semibold ${
                active ? "text-primary-content" : "text-base-content"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
