/**
 * Ersatz für daisyUIs `card`. Die Website setzt durchgehend
 * `card bg-base-100 shadow-xl` — das ist hier die Voreinstellung, `className`
 * überschreibt sie.
 */
import { View, type ViewProps } from "react-native";

export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-2xl bg-base-100 shadow-lg shadow-black/10 ${className}`}
      {...props}
    />
  );
}

export function CardBody({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View className={`gap-3 p-5 ${className}`} {...props} />;
}
