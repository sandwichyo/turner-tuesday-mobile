/**
 * Der Hero-Block, mit dem im Web jede Seite beginnt: eine Karte mit dem Logo
 * links und der Überschrift daneben, optional eine Aktion rechts.
 */
import { Image } from "expo-image";
import { Text, View } from "react-native";

const LOGO = require("../../../assets/brand/logo.png");

export function Hero({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="gap-4 rounded-2xl bg-base-100 p-5 shadow-lg shadow-black/30">
      <View className="flex-row items-center gap-4">
        <Image source={LOGO} style={{ width: 56, height: 56, borderRadius: 12 }} />
        <View className="flex-1">
          <Text className="text-3xl font-bold text-base-content">{title}</Text>
          {subtitle ? <Text className="text-base-muted">{subtitle}</Text> : null}
        </View>
      </View>

      {action}
    </View>
  );
}
