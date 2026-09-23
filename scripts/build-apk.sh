#!/usr/bin/env bash
#
# Baut eine installierbare Release-APK zum Sideloading.
#
# Anders als bei iOS braucht Android keinen Umweg über einen Signier-Dienst:
# Android verlangt zwar eine Signatur, akzeptiert aber jede — die Vorlage von
# Expo signiert den Release-Build mit dem mitgelieferten Debug-Keystore
# (android/app/debug.keystore). Das ergibt eine APK, die sich direkt
# installieren lässt.
#
# Für den Play Store reicht das **nicht**: dort braucht es einen eigenen,
# geheim gehaltenen Keystore und einen signingConfig in
# android/app/build.gradle. Eine mit dem Debug-Schlüssel signierte App lässt
# sich später nicht auf einen anderen Schlüssel umstellen.
#
# Das Script installiert nichts — es legt die fertige APK in build/ ab.
#
# Usage:  ./scripts/build-apk.sh [--clean]
# Output: build/<Name>-<version>.apk

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# build/ enthält am Ende ausschließlich das Artefakt.
BUILD_DIR="$ROOT/build"

info()  { printf '\033[1;34m▸\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m✖\033[0m %s\n' "$1" >&2; exit 1; }

NAME="$(node -p "require('./app.json').expo.name.replace(/[^A-Za-z0-9]/g, '')")"
VERSION="$(node -p "require('./app.json').expo.version")"
ARTIFACT="$BUILD_DIR/$NAME-$VERSION.apk"

# --- preflight -------------------------------------------------------------
info "Prüfe Toolchain"

# macOS legt unter /usr/bin/java einen Stub ab, der auch ohne installierte
# Laufzeit existiert — `command -v java` genügt als Prüfung deshalb nicht.
if ! java -version >/dev/null 2>&1; then
  fail "Keine Java-Laufzeit. Installation:  brew install --cask temurin@17
     Danach ggf.:  export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
fi
ok "Java $(java -version 2>&1 | head -1 | sed 's/.*\"\(.*\)\".*/\1/')"

SDK=""
for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then
    SDK="$candidate"
    break
  fi
done

if [ -z "$SDK" ]; then
  fail "Android SDK nicht gefunden. Installation:
     brew install --cask android-commandlinetools
     export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
     sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
     (oder Android Studio installieren — legt das SDK unter ~/Library/Android/sdk an)"
fi
export ANDROID_HOME="$SDK"
ok "Android SDK: $SDK"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ] || [ "$NODE_MAJOR" -gt 22 ]; then
  fail "Node $(node -v) wird von Expo nicht unterstützt. Erwartet 20–22:  nvm use"
fi
ok "Node $(node -v)"

if [[ "${1:-}" == "--clean" ]]; then
  info "Entferne android/ und bisherige Artefakte für einen frischen Durchlauf"
  rm -rf android
  # -maxdepth 1: nur die obersten Einträge entfernen, sonst steigt find in
  # .work/ hinab und stolpert über bereits gelöschte Elternordner.
  find "$BUILD_DIR" -mindepth 1 -maxdepth 1 -not -name README.md -exec rm -rf {} + 2>/dev/null || true
fi

# --- native project --------------------------------------------------------
# Immer neu erzeugen: app.json ist die Quelle der Wahrheit für Version, Plugins
# und AndroidManifest, und ein veraltetes android/ liefert stillschweigend die
# vorige Konfiguration aus.
info "Generiere natives Android-Projekt (expo prebuild)"
npx expo prebuild --platform android --no-install

# --- build -----------------------------------------------------------------
mkdir -p "$BUILD_DIR"

info "Gradle-Release-Build — das dauert beim ersten Mal einige Minuten"
( cd android && ./gradlew assembleRelease --console=plain ) \
  | grep -E "^(> Task :app:(assemble|package|bundle)|BUILD |FAILURE|error:|\* What went wrong)" || true

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK_PATH" ]] || fail "Gradle hinterlässt keine APK unter $APK_PATH.
     Für die vollständige Fehlerausgabe:
       ( cd android && ./gradlew assembleRelease --stacktrace )"

ok "APK gebaut"

# --- package ---------------------------------------------------------------
info "Lege Artefakt ab"
rm -f "$ARTIFACT"
cp "$APK_PATH" "$ARTIFACT"

SIZE="$(du -h "$ARTIFACT" | cut -f1 | tr -d ' ')"
ok "$(basename "$ARTIFACT") ($SIZE)"

printf '\n  %s\n' "$ARTIFACT"
printf '  Mit dem Debug-Keystore signiert — unbegrenzt lauffähig, aber nicht\n'
printf '  für den Play Store geeignet.\n\n'
