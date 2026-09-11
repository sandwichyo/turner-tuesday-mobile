/**
 * Der Rahmen, den im Web das Default-Layout stellt: `bg-base-200`, darüber das
 * Turnier-Hintergrundbild mit 20 % Deckkraft, darauf die Navbar.
 *
 * Das Bild liegt im Web als fixe Ebene hinter allem — hier genauso: absolut
 * positioniert und nicht scrollend, damit es beim Blättern stehen bleibt.
 */
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StartGgLogo } from "./startgg-logo";

const BACKGROUND = require("../../assets/brand/background.webp");
const LOGO = require("../../assets/brand/logo.png");

/** Die Navbar des Originals: Logo, Wortmarke, start.gg-Verweis. */
function AppHeader({ onOpenStartGg }: { onOpenStartGg: () => void }) {
  return (
    <View className="flex-row items-center justify-between bg-base-100 px-4 py-3 shadow-lg shadow-black/30">
      <View className="flex-row items-center gap-2">
        <Image source={LOGO} style={{ width: 32, height: 32, borderRadius: 6 }} />
        <Text className="text-xl font-semibold text-base-content">Turner Tuesdays</Text>
      </View>

      <Pressable
        onPress={onOpenStartGg}
        accessibilityRole="link"
        accessibilityLabel="start.gg"
        hitSlop={12}
      >
        <StartGgLogo size={22} />
      </Pressable>
    </View>
  );
}

export function Screen({
  children,
  onOpenStartGg,
}: {
  children: React.ReactNode;
  onOpenStartGg: () => void;
}) {
  return (
    <View className="flex-1 bg-base-200">
      <Image
        source={BACKGROUND}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.2 }}
        contentFit="cover"
        contentPosition="center"
      />

      <SafeAreaView className="flex-1" edges={["top"]}>
        <AppHeader onOpenStartGg={onOpenStartGg} />
        {children}
      </SafeAreaView>
    </View>
  );
}
