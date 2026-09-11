/**
 * Ersatz für die `join`-Blätterleiste der Website: «, Seitenzahlen mit Auslassung,
 * ». Seitengröße ist wie im Web 10 Zeilen.
 */
import { Pressable, Text, View } from "react-native";

export const PAGE_SIZE = 10;

/**
 * Die sichtbaren Seitenzahlen: immer die erste und die letzte, um die aktuelle
 * herum ein Fenster, dazwischen "…". Auf dem Telefon ist weniger Platz als im
 * Web, deshalb ein Fenster von ±1.
 */
function visiblePages(current: number, count: number): (number | "…")[] {
  if (count <= 7) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, count, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push("…");
    out.push(page);
    previous = page;
  }

  return out;
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <View className="mt-3 flex-row items-center justify-between gap-3">
      <Text className="text-sm text-base-muted">
        Seite {page} von {pageCount}
      </Text>

      <View className="flex-row items-center gap-1">
        <PageButton label="«" disabled={page <= 1} onPress={() => onChange(page - 1)} />
        {visiblePages(page, pageCount).map((entry, index) =>
          entry === "…" ? (
            <Text key={`gap-${index}`} className="px-1 text-base-muted">
              …
            </Text>
          ) : (
            <PageButton
              key={entry}
              label={String(entry)}
              active={entry === page}
              onPress={() => onChange(entry)}
            />
          ),
        )}
        <PageButton label="»" disabled={page >= pageCount} onPress={() => onChange(page + 1)} />
      </View>
    </View>
  );
}

function PageButton({
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      className={`min-w-8 items-center rounded-md px-2 py-1.5 ${
        active ? "bg-primary" : "bg-base-200"
      } ${disabled ? "opacity-30" : ""}`}
    >
      <Text
        className={`text-sm font-semibold ${active ? "text-primary-content" : "text-base-content"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
