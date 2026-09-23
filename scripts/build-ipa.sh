#!/usr/bin/env bash
#
# Baut eine unsignierte IPA zum Sideloading über AltStore.
#
# Unsigniert ist Absicht: AltStore signiert die App beim Installieren mit der
# eigenen Apple-ID neu, eine hier eingebackene Signatur würde also ohnehin
# wieder entfernt. Damit braucht es weder einen bezahlten Developer-Account noch
# ein Provisioning-Profil — und auch keine Signing-Identität im Schlüsselbund.
#
# Das Script installiert nichts — es legt die fertige IPA in build/ ab.
#
# Usage:  ./scripts/build-ipa.sh [--clean]
# Output: build/<Name>-<version>.ipa

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONFIG="Release"
# build/ enthält am Ende ausschließlich das Artefakt; alles Zwischenmaterial
# liegt in .work/ und wird nach einem erfolgreichen Lauf entfernt.
BUILD_DIR="$ROOT/build"
WORK_DIR="$BUILD_DIR/.work"

info()  { printf '\033[1;34m▸\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m✖\033[0m %s\n' "$1" >&2; exit 1; }

# Der Schemaname folgt aus app.json — dort steht die Wahrheit über den App-Namen,
# und expo prebuild leitet den Xcode-Projektnamen daraus ab.
SCHEME="$(node -p "require('./app.json').expo.name.replace(/[^A-Za-z0-9]/g, '')")"
VERSION="$(node -p "require('./app.json').expo.version")"
ARCHIVE_PATH="$WORK_DIR/$SCHEME.xcarchive"
ARTIFACT="$BUILD_DIR/$SCHEME-$VERSION.ipa"

# --- preflight -------------------------------------------------------------
info "Prüfe Toolchain"

if ! xcodebuild -version >/dev/null 2>&1; then
  fail "Xcode fehlt, ist nicht ausgewählt oder die Lizenz ist offen.
     1) Xcode aus dem App Store installieren
     2) sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
     3) sudo xcodebuild -license accept
     4) xcodebuild -runFirstLaunch"
fi
ok "$(xcodebuild -version | head -1)"

if ! command -v pod >/dev/null 2>&1; then
  fail "CocoaPods fehlt. Installation:  brew install cocoapods
     (oder:  sudo gem install cocoapods)"
fi
ok "CocoaPods $(pod --version)"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ] || [ "$NODE_MAJOR" -gt 22 ]; then
  fail "Node $(node -v) wird von Expo nicht unterstützt. Erwartet 20–22:  nvm use"
fi
ok "Node $(node -v)"

if [[ "${1:-}" == "--clean" ]]; then
  info "Entferne ios/ und bisherige Artefakte für einen frischen Durchlauf"
  rm -rf ios
  # -maxdepth 1: nur die obersten Einträge entfernen, sonst steigt find in
  # .work/ hinab und stolpert über bereits gelöschte Elternordner.
  find "$BUILD_DIR" -mindepth 1 -maxdepth 1 -not -name README.md -exec rm -rf {} + 2>/dev/null || true
fi

# --- native project --------------------------------------------------------
# Immer neu erzeugen: app.json ist die Quelle der Wahrheit für Version, Plugins
# und Info.plist, und ein veraltetes ios/ liefert stillschweigend die vorige
# Konfiguration aus. In ios/ wird nichts von Hand geändert, das Neuerzeugen
# kostet also nichts.
info "Generiere natives iOS-Projekt (expo prebuild)"
npx expo prebuild --platform ios --no-install

info "Installiere Pods"
( cd ios && pod install )
ok "Pods installiert"

# --- archive ---------------------------------------------------------------
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

# Die vollständige Ausgabe wandert in ein Log, auf der Konsole bleiben die
# Kopfzeilen und Fehler. Scheitert der Build, wird das Log ausgewertet — es ist
# die einzige verlässliche Quelle dafür, *warum*.
LOG="$WORK_DIR/xcodebuild.log"

info "Archiviere ($CONFIG, unsigniert) — das dauert beim ersten Mal einige Minuten"
set +e
xcodebuild archive \
  -workspace "ios/$SCHEME.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -sdk iphoneos \
  -archivePath "$ARCHIVE_PATH" \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  >"$LOG" 2>&1
set -e

grep -E "^(=== |\*\* |error:)" "$LOG" || true

APP_PATH="$ARCHIVE_PATH/Products/Applications/$SCHEME.app"
if [[ ! -d "$APP_PATH" ]]; then
  # Seit Xcode 16 ist die iOS-Geräteplattform vom SDK getrennt: `-showsdks`
  # listet iphoneos auch dann, wenn für einen Gerätebuild die Plattform fehlt.
  # Sichtbar wird das erst hier.
  if grep -q "is not installed" "$LOG"; then
    fail "Die iOS-Geräteplattform ist nicht installiert — nur die Simulator-Runtime.
     Nachladen (mehrere GB):  xcodebuild -downloadPlatform iOS
     Oder: Xcode → Settings → Components → iOS"
  fi

  fail "Archiv enthält keine .app — der Build ist fehlgeschlagen.
     Vollständige Ausgabe:  $LOG"
fi

ok "App gebaut"

# --- package ---------------------------------------------------------------
# Eine IPA ist ein ZIP mit der .app unter Payload/. `xcodebuild -exportArchive`
# käme hier nicht in Frage: es verlangt eine Signatur, genau das, was dem
# Installationsweg überlassen bleibt.
info "Verpacke IPA"
PAYLOAD="$WORK_DIR/Payload"
rm -rf "$PAYLOAD" "$ARTIFACT"
mkdir -p "$PAYLOAD"
cp -R "$APP_PATH" "$PAYLOAD/"

( cd "$WORK_DIR" && zip -qry "$SCHEME-$VERSION.ipa" Payload )
mv "$WORK_DIR/$SCHEME-$VERSION.ipa" "$ARTIFACT"

# Erst jetzt aufräumen: nach einem Fehlschlag bleibt .work/ zur Fehlersuche.
rm -rf "$WORK_DIR"

SIZE="$(du -h "$ARTIFACT" | cut -f1 | tr -d ' ')"
ok "$(basename "$ARTIFACT") ($SIZE)"

printf '\n  %s\n' "$ARTIFACT"
printf '  Unsigniert — die Signatur setzt erst der Installationsweg (AltStore,\n'
printf '  Sideloadly o. ä.) mit deiner Apple-ID.\n\n'
