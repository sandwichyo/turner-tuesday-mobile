/**
 * Ersatz für daisyUIs `btn` in den Varianten, die die Website nutzt.
 *
 * `startgg` ist der neutrale Button aus Home.vue: das Logo ist mehrfarbig, der
 * Button deshalb einfarbig — im Dunkeln weiß mit dunkler Schrift, im Hellen
 * umgekehrt (die Tokens dazu stehen in global.css).
 */
import { Pressable, Text, View } from "react-native";

const VARIANTS = {
  primary: { bg: "bg-primary", text: "text-primary-content" },
  secondary: { bg: "bg-secondary", text: "text-primary-content" },
  ghost: { bg: "bg-base-100", text: "text-base-content" },
  startgg: { bg: "bg-startgg", text: "text-startgg-content" },
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  className = "",
}: {
  label: string;
  onPress: () => void;
  variant?: keyof typeof VARIANTS;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const style = VARIANTS[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`flex-row items-center justify-center gap-2 rounded-lg px-4 py-2.5 ${style.bg} ${
        disabled ? "opacity-40" : ""
      } ${className}`}
    >
      <Text className={`font-semibold ${style.text}`}>{label}</Text>
      {icon ? <View>{icon}</View> : null}
    </Pressable>
  );
}
