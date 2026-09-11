/**
 * Ersatz für daisyUIs `badge`. `tone` bildet die Varianten ab, die die Website
 * nutzt; `dot` ist die 10-Pixel-Variante aus dem Power Ranking, die nur über
 * ihre Farbe spricht (verpasste Events).
 */
import { Text, View } from "react-native";

const TONES = {
  neutral: "bg-base-300",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  primary: "bg-primary",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <View className={`self-start rounded-full px-3 py-1 ${TONES[tone]} ${className}`}>
      <Text className="text-sm font-semibold text-base-content">{children}</Text>
    </View>
  );
}

export function DotBadge({ tone, className = "" }: { tone: BadgeTone; className?: string }) {
  return <View className={`h-2.5 w-2.5 rounded-full ${TONES[tone]} ${className}`} />;
}
