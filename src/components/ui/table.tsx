/**
 * Ersatz für daisyUIs `table table-zebra`. Die Website stellt Platzierungen und
 * das Ranking als Tabelle dar; RN hat kein <table>, also Zeilen aus Flex-Spalten
 * mit festen Anteilen.
 *
 * `flex` je Spalte statt fester Breiten, damit lange Spielernamen auf schmalen
 * Geräten nicht aus der Zeile laufen.
 */
import { Text, View } from "react-native";

export type Column = { key: string; label: string; flex: number };

export function Table({ columns, children }: { columns: Column[]; children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-xl">
      <View className="flex-row border-b border-base-300 px-3 py-2">
        {columns.map((column) => (
          <Text
            key={column.key}
            style={{ flex: column.flex }}
            className="text-xs font-semibold uppercase text-base-muted"
          >
            {column.label}
          </Text>
        ))}
      </View>
      {children}
    </View>
  );
}

/** `table-zebra`: jede zweite Zeile leicht abgesetzt. */
export function TableRow({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <View className={`flex-row items-center px-3 py-2.5 ${index % 2 === 1 ? "bg-base-200/40" : ""}`}>
      {children}
    </View>
  );
}

export function TableCell({
  flex,
  children,
  className = "",
}: {
  flex: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View style={{ flex }} className={`flex-row items-center gap-2 ${className}`}>
      {children}
    </View>
  );
}

/** 🥇🥈🥉 für die ersten drei Plätze, wie getRankIcon im Web. */
export function rankIcon(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";

  return "";
}
