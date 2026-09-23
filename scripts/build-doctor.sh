#!/usr/bin/env bash
#
# Prüft, was für einen fertigen IPA- bzw. APK-Build fehlt — und nennt für jeden
# Punkt den konkreten Befehl.
#
# Signaturen tauchen hier bewusst nicht auf: die IPA wird unsigniert gebaut und
# erst von AltStore signiert, die APK trägt den Debug-Keystore aus der
# Expo-Vorlage. Es gibt also nichts einzurichten.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail=0

check() {
  local label="$1" hint="$2"
  shift 2

  if "$@" >/dev/null 2>&1; then
    printf '  \033[32m✓\033[0m %s\n' "$label"
  else
    printf '  \033[31m✗\033[0m %s\n      → %s\n' "$label" "$hint"
    fail=$((fail + 1))
  fi
}

node_major() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || return 1
  [ "$major" -ge 20 ] && [ "$major" -le 22 ]
}

# Ohne akzeptierte Lizenz scheitert jedes Xcode-Werkzeug, auch git.
xcode_ready() { xcodebuild -version; }

# macOS legt unter /usr/bin/java einen Stub ab, der auch ohne installierte
# Laufzeit existiert — `command -v java` genügt als Prüfung deshalb nicht.
java_runtime() { java -version; }

android_sdk() {
  for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then
      return 0
    fi
  done

  return 1
}

# Seit Xcode 16 ist die Geräteplattform vom SDK getrennt: `-showsdks` listet
# iphoneos auch dann, wenn ein Gerätebuild noch daran scheitert. Sichtbar wird
# es an den Destinations eines Projekts — und das gibt es erst nach prebuild.
#
# Geprüft wird auf Geräte-Ziele, erkennbar am Komma: `platform:iOS,` gegenüber
# `platform:iOS Simulator,`. Fehlen sie ganz oder tragen sie einen Fehler, ist
# die Plattform nicht einsatzbereit. Das Urteil ist ein Indiz — verlässlich
# sagt es erst der Build selbst.
ios_platform() {
  local scheme devices
  scheme="$(node -p 'require("./app.json").expo.name.replace(/[^A-Za-z0-9]/g, "")' 2>/dev/null)" || return 2
  [ -d "ios/$scheme.xcodeproj" ] || return 2

  devices="$(xcodebuild -showdestinations -project "ios/$scheme.xcodeproj" -scheme "$scheme" 2>/dev/null |
    grep 'platform:iOS,' || true)"

  [ -n "$devices" ] || return 1
  echo "$devices" | grep -q 'is not installed' && return 1

  return 0
}

echo
echo "Gemeinsam"
check "Node 20–22 (aktuell $(node -v 2>/dev/null || echo '?'))" \
  "nvm use   # .nvmrc zeigt auf 22" node_major

echo
echo "iOS → IPA  (npm run build:ipa)"
check "Xcode installiert, ausgewählt, Lizenz akzeptiert" \
  "sudo xcodebuild -license accept" xcode_ready
check "CocoaPods" \
  "brew install cocoapods" command -v pod

ios_platform
case $? in
  0) printf '  \033[32m✓\033[0m iOS-Geräteplattform installiert\n' ;;
  1)
    printf '  \033[31m✗\033[0m iOS-Geräteplattform installiert\n      → xcodebuild -downloadPlatform iOS   (mehrere GB)\n'
    fail=$((fail + 1))
    ;;
  *) printf '  \033[33m!\033[0m iOS-Geräteplattform — prüfbar erst nach `npm run prebuild`\n' ;;
esac

echo
echo "Android → APK  (npm run build:apk)"
check "Java-Laufzeit (JDK 17+)" \
  "brew install --cask temurin@17" java_runtime
check "Android SDK" \
  "brew install --cask android-commandlinetools && export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools" \
  android_sdk

echo
if [ "$fail" -eq 0 ]; then
  echo "Alles da."
else
  echo "$fail Punkt(e) offen. Cloud-Alternative ohne lokale Toolchain: npm run build:apk:cloud"
fi

exit 0
