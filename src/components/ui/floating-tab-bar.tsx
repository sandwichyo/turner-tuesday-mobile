/**
 * Die Bottom-Navigation als schwebende Kapsel, wie sie iOS 26 zeigt — Safari
 * und Musik stellen ihre Leisten so dar: abgerundet, mit Abstand zum Rand und
 * über dem Inhalt, der sichtbar darunter hindurchscrollt.
 *
 * Warum eine eigene Leiste und nicht nur `tabBarStyle`: React Navigation
 * zeichnet seine Leiste über die volle Breite und mit Trennlinie darüber. Runde
 * Ecken, der seitliche Abstand und die gleitende Auswahl-Pille lassen sich über
 * die Optionen nicht setzen. Mit `tabBar` rendert der Navigator stattdessen
 * diese Komponente und reicht Zustand, Optionen und Safe-Area-Insets weiter.
 *
 * Beschriftet ist nur der aktive Tab, die übrigen tragen ihr Symbol allein —
 * so bleibt auch bei drei Einträgen Platz für ein Wort wie „Power Ranking",
 * und die Kapsel bekommt Safaris Aufteilung: ein breites Feld, daneben Knöpfe.
 * Die Pille folgt deshalb gemessenen Kanten und nicht einer festen Spaltenbreite
 * — der aktive Eintrag ist breiter als die anderen.
 *
 * Das Material ist auf iOS 26 echtes Liquid Glass (expo-glass-effect), sonst
 * eine gedeckte Fläche mit hauchdünnem Rand. `isLiquidGlassAvailable()`
 * entscheidet das zur Laufzeit; auf Android und im Web ist es immer `false`.
 *
 * Weil die Kapsel absolut liegt, nimmt sie den Screens keinen Platz weg — ihr
 * Inhalt endet sonst unsichtbar darunter. Dagegen hängt `TabBarSpacer` ans Ende
 * der Liste; seine Höhe ist die, die diese Leiste beim Layout meldet.
 */
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import {
  BottomTabBarHeightCallbackContext,
  BottomTabBarHeightContext,
  type BottomTabBarProps,
  type BottomTabNavigationOptions,
} from "expo-router/js-tabs";
import { CommonActions } from "expo-router/react-navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useScheme, useThemeColors } from "@/lib/theme";

/** Höhe der Kapsel; die Reihe darin ist um `PADDING` niedriger. */
const BAR_HEIGHT = 58;
const PADDING = 6;

/** Breite eines Eintrags ohne Beschriftung — ein Knopf, kein Feld. */
const ICON_WIDTH = 52;

/** Abstand zu den Bildschirmrändern. Unten wird die Safe Area um `EDGE_TRIM`
 *  gekürzt: der Home-Indikator bleibt frei, die Kapsel schwebt aber nicht so
 *  hoch über ihm, wie es die volle Inset-Höhe täte. */
const SIDE_MARGIN = 16;
const EDGE_GAP = 12;
const EDGE_TRIM = 8;

const SPRING = { damping: 18, stiffness: 200, mass: 0.7 };

/** Form der Kapsel; ihre Farben kommen aus dem Theme. */
const CAPSULE = {
  height: BAR_HEIGHT,
  borderRadius: BAR_HEIGHT / 2,
  padding: PADDING,
};

type Rect = { x: number; width: number };

/**
 * `href: null` aus expo-router wird zu `tabBarItemStyle: { display: "none" }` —
 * so bleiben die Detail-Screens im Navigator (die Leiste steht auch dort), ohne
 * einen eigenen Eintrag zu bekommen.
 */
function isHidden(options: BottomTabNavigationOptions): boolean {
  return StyleSheet.flatten(options.tabBarItemStyle)?.display === "none";
}

/** Bei offener Tastatur weicht die Leiste nach unten, wie die Standard-Leiste
 *  mit `tabBarHideOnKeyboard` — sonst klebt sie über den Tasten. */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // iOS meldet das Öffnen vor der Animation, Android erst danach.
    const open = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setShown(true),
    );
    const close = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setShown(false),
    );

    return () => {
      open.remove();
      close.remove();
    };
  }, []);

  return shown;
}

/** Der Platz, den die schwebende Leiste unten belegt. */
export function useTabBarSpace(): number {
  return use(BottomTabBarHeightContext) ?? 0;
}

/** Hält das Ende einer Liste frei, damit der letzte Eintrag nicht unter der
 *  Kapsel endet. In ScrollViews als letztes Kind, in FlatLists als Footer. */
export function TabBarSpacer() {
  const space = useTabBarSpace();

  return <View style={{ height: space }} />;
}

function Capsule({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const scheme = useScheme();

  if (isLiquidGlassAvailable()) {
    // `colorScheme` fest gesetzt: das Glas soll dem Theme der App folgen, nicht
    // dem des Systems — beides kann auseinanderlaufen.
    return (
      <GlassView
        style={[CAPSULE, { boxShadow: colors.shadow }]}
        glassEffectStyle="regular"
        colorScheme={scheme}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        CAPSULE,
        {
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          boxShadow: colors.shadow,
        },
      ]}
    >
      {children}
    </View>
  );
}

function TabItem({
  label,
  icon,
  selected,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
  onMeasure,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
  onLongPress: () => void;
  onMeasure: (rect: Rect) => void;
}) {
  const colors = useThemeColors();
  const pressed = useSharedValue(0);
  const feedback = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.06 }],
  }));

  return (
    <Pressable
      style={selected ? { flex: 1 } : { width: ICON_WIDTH }}
      onLayout={(event) => {
        const { x, width } = event.nativeEvent.layout;

        onMeasure({ x, width });
      }}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 80 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 160 });
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      <Animated.View
        className="flex-1 flex-row items-center justify-center gap-2"
        style={feedback}
      >
        {icon}

        {/* Nur der aktive Eintrag trägt sein Wort — und blendet es ein, damit
            es nicht mitten in der Bewegung der Pille aufblitzt. */}
        {selected ? (
          <Animated.View entering={FadeIn.duration(180)}>
            <Text
              numberOfLines={1}
              className="text-xs font-semibold"
              style={{ color: colors.primary }}
            >
              {label}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const colors = useThemeColors();
  const reportHeight = use(BottomTabBarHeightCallbackContext);
  const keyboardShown = useKeyboardShown();
  const [rects, setRects] = useState<Rect[]>([]);

  const items = state.routes
    .map((route, index) => ({ route, index, options: descriptors[route.key].options }))
    .filter((item) => !isHidden(item.options));

  const focused = items.findIndex((item) => item.index === state.index);

  /**
   * Auf den Detail-Screens ist kein Eintrag der Leiste aktiv — sie liegen im
   * selben Navigator, haben aber keinen eigenen. Statt die Auswahl dort leer zu
   * lassen, bleibt sie auf dem Tab stehen, von dem aus geöffnet wurde.
   */
  const [selected, setSelected] = useState(Math.max(focused, 0));
  if (focused >= 0 && focused !== selected) setSelected(focused);

  const measure = useCallback((index: number, rect: Rect) => {
    setRects((previous) => {
      const current = previous[index];

      // Ohne diesen Vergleich setzt jedes Layout den Zustand neu und das Messen
      // ruft sich selbst wieder auf.
      if (current && current.x === rect.x && current.width === rect.width) return previous;

      const next = [...previous];
      next[index] = rect;

      return next;
    });
  }, []);

  const bottomGap = Math.max(insets.bottom - EDGE_TRIM, EDGE_GAP);
  const target = rects[selected];

  const pillX = useSharedValue(0);
  const pillWidth = useSharedValue(0);
  const measured = useSharedValue(false);

  useEffect(() => {
    if (!target) return;

    // Beim ersten Mal springt die Pille an ihren Platz: eine Bewegung aus dem
    // Nichts wäre kein Wechsel, sondern nur der Aufbau des Bildschirms.
    if (!measured.value) {
      measured.value = true;
      pillX.value = target.x;
      pillWidth.value = target.width;

      return;
    }

    pillX.value = withSpring(target.x, SPRING);
    pillWidth.value = withSpring(target.width, SPRING);
  }, [measured, pillWidth, pillX, target]);

  const retreat = useSharedValue(0);
  useEffect(() => {
    retreat.value = withTiming(keyboardShown ? 1 : 0, { duration: 200 });
  }, [keyboardShown, retreat]);

  const bar = useAnimatedStyle(() => ({
    transform: [{ translateY: retreat.value * (BAR_HEIGHT + bottomGap) }],
    opacity: 1 - retreat.value,
  }));

  const pill = useAnimatedStyle(() => ({
    width: pillWidth.value,
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <Animated.View
      // `box-none`: neben der Kapsel bleibt der Inhalt darunter bedienbar.
      pointerEvents={keyboardShown ? "none" : "box-none"}
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: SIDE_MARGIN,
          paddingBottom: bottomGap,
        },
        bar,
      ]}
    >
      <Capsule>
        <View role="tablist" className="flex-1 flex-row">
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                borderRadius: (BAR_HEIGHT - 2 * PADDING) / 2,
                backgroundColor: colors.pill,
              },
              pill,
            ]}
          />

          {items.map((item, index) => {
            const { route, options } = item;
            const active = index === selected;

            const label =
              typeof options.tabBarLabel === "string"
                ? options.tabBarLabel
                : (options.title ?? route.name);

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (item.index !== state.index && !event.defaultPrevented) {
                navigation.dispatch({
                  ...CommonActions.navigate(route),
                  target: state.key,
                });
              }
            };

            return (
              <TabItem
                key={route.key}
                label={label}
                selected={active}
                icon={options.tabBarIcon?.({
                  focused: active,
                  color: active ? colors.primary : colors.muted,
                  size: 20,
                })}
                accessibilityLabel={
                  options.tabBarAccessibilityLabel ??
                  (Platform.OS === "ios"
                    ? `${label}, Tab, ${index + 1} von ${items.length}`
                    : label)
                }
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={() =>
                  navigation.emit({ type: "tabLongPress", target: route.key })
                }
                onMeasure={(rect) => measure(index, rect)}
              />
            );
          })}
        </View>
      </Capsule>
    </Animated.View>
  );
}
