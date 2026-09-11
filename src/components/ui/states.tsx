/** Lade-, Fehler- und Leerzustände — auf jedem Screen dieselbe Darstellung. */
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export function LoadingState({ label = "Lädt …" }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 p-10">
      <ActivityIndicator />
      <Text className="text-sm text-base-muted">{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="m-4 gap-3 rounded-xl bg-error/10 p-5">
      <Text className="font-semibold text-error">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="self-start rounded-lg bg-primary px-4 py-2"
        >
          <Text className="font-semibold text-primary-content">Erneut versuchen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="m-4 items-center gap-4 rounded-xl border border-dashed border-base-300 p-10">
      <Text className="text-center text-sm text-base-muted">{message}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          className="rounded-lg bg-secondary px-4 py-2"
        >
          <Text className="font-semibold text-primary-content">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
