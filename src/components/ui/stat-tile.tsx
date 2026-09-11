/** Die Kennzahl-Kachel der Website: `rounded-xl bg-base-200 p-4`, Label über Wert. */
import { Text, View } from "react-native";

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl bg-base-200 p-4">
      <Text className="text-xs uppercase text-base-muted">{label}</Text>
      <Text className="mt-1 font-medium text-base-content">{value}</Text>
    </View>
  );
}
