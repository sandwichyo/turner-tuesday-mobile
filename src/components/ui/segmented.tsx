/**
 * Ersatz für die Button-Reihen der Website (`btn btn-sm` + aktiv/ghost). Die
 * Optionen können viele werden — die Perioden des Power Rankings wachsen mit
 * jedem Halbjahr —, deshalb scrollt die Reihe horizontal statt umzubrechen.
 */
import { Pressable, ScrollView, Text } from "react-native";

export type SegmentOption = { key: string; label: string };

export function Segmented({
  options,
  value,
  onChange,
  tone = "primary",
}: {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  tone?: "primary" | "secondary";
}) {
  const activeBg = tone === "primary" ? "bg-primary" : "bg-secondary";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4"
    >
      {options.map((option) => {
        const active = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`rounded-lg px-4 py-2 ${active ? activeBg : "bg-base-100"}`}
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
