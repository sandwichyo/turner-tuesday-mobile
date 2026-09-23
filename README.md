# Turner Tuesdays — Mobile

React-Native-App (Expo SDK 57) für die Turner-Tuesday-Serie. Die Daten kommen
aus der öffentlichen, versionierten API von `melee.sandwichyo.com` — bis auf
eine Zahl, den Anmeldestand des nächsten Turniers, den die API nicht führt
(siehe [Anmeldestand](#anmeldestand)). Die App schreibt nichts und meldet
niemanden an.

## Entwickeln

Node **22** ist Pflicht (`.nvmrc`); mit Node 26 bricht das Expo-Toolchain ab.

```bash
nvm use            # 22.21.1
npm install
npm start          # Metro; i = iOS-Simulator, a = Android
```

| Script | Zweck |
| --- | --- |
| `npm start` | Metro-Dev-Server |
| `npm run go:ios` / `go:android` | Start in Expo Go — ohne native Toolchain |
| `npm run ios` / `android` | Nativer Dev-Build (braucht CocoaPods bzw. Java + SDK) |
| `npm run gen:api` | Typen aus `openapi/melee-v1.yaml` neu erzeugen |

## Builds

```bash
npm run build:doctor          # sagt, was fehlt — und mit welchem Befehl
npm run build:ipa [--clean]   # → build/TurnerTuesdays-1.0.0.ipa
npm run build:apk [--clean]   # → build/TurnerTuesdays-1.0.0.apk
npm run build:apk:cloud       # APK über EAS, ohne lokale Android-Toolchain
```

Beide Scripts **installieren nichts** — sie legen das fertige Paket in `build/`
ab, benannt nach `expo.name` und `expo.version` aus der `app.json`. Was danach
damit geschieht, entscheidest du.

### Der Build-Ordner

`build/` ist der vorgesehene Ablageort und liegt im Repo; sein Inhalt ist
gitignored bis auf [build/README.md](build/README.md), die ihn beschreibt. Am
Ende eines erfolgreichen Laufs enthält er genau ein Artefakt pro Plattform.

Zwischenmaterial — Xcode-Archiv, `Payload/`, das vollständige xcodebuild-Log —
liegt währenddessen unter `build/.work/` und wird nach Erfolg entfernt. Nach
einem Fehlschlag bleibt es liegen: das Log ist dann die Fehlerquelle, auf die
die Abbruchmeldung verweist.

`--clean` erzwingt zusätzlich ein frisches `ios/` bzw. `android/` und räumt
frühere Artefakte weg (die `README.md` bleibt).

Beide Scripts erzeugen das native Projekt ohnehin bei jedem Lauf neu mit
`expo prebuild`: in `ios/` und `android/` wird nichts von Hand geändert, beide
sind gitignored, und ein veralteter Stand würde stillschweigend die vorige
Konfiguration ausliefern.

Weil `expo prebuild` dabei die npm-Scripts `ios` und `android` auf `expo run:*`
zurückschreibt, heißen die Expo-Go-Varianten `go:ios` und `go:android` — sonst
driftet die `package.json` bei jedem Build.

### Die IPA ist unsigniert — mit Absicht

Die Signatur setzt erst der Installationsweg (AltStore, Sideloadly o. ä.) mit
deiner eigenen Apple-ID; eine hier eingebackene würde ohnehin wieder entfernt.
Damit braucht der Build **weder einen bezahlten Account noch eine
Signing-Identität noch ein Provisioning-Profil**. `xcodebuild -exportArchive`
scheidet deshalb aus — es will zwingend signieren. Stattdessen wird die `.app`
nach `Payload/` kopiert und gezippt, was eine IPA per Definition ist.

Mit einer kostenlosen Apple-ID hält die Signatur nach dem Installieren sieben
Tage.

### Die APK trägt den Debug-Keystore

Android verlangt eine Signatur, akzeptiert aber jede — die Expo-Vorlage signiert
den Release-Build mit `android/app/debug.keystore`. Die APK läuft damit
unbegrenzt, ohne 7-Tage-Frist. Für den Play Store reicht das nicht: dort braucht
es einen eigenen, geheim gehaltenen Keystore, und eine einmal veröffentlichte
App lässt sich später nicht auf einen anderen Schlüssel umstellen.

### Voraussetzungen

| IPA | APK |
| --- | --- |
| Xcode + akzeptierte Lizenz | JDK 17+ |
| CocoaPods (`brew install cocoapods`) | Android SDK |
| iOS-**Geräteplattform** (`xcodebuild -downloadPlatform iOS`) | — |

Die Geräteplattform ist die unauffälligste Hürde: seit Xcode 16 ist sie vom SDK
getrennt, `xcodebuild -showsdks` listet `iphoneos` also auch dann, wenn ein
Gerätebuild daran scheitert. `build:ipa` erkennt den Fall am xcodebuild-Log und
nennt den Nachlade-Befehl, statt nur „Build fehlgeschlagen" zu melden.

## Aufbau

```
src/
  app/               expo-router: (tabs)/index, (tabs)/power-ranking, (tabs)/settings
  components/ui/     Ersatz für daisyUI (Card, Badge, Segmented, States)
  lib/api/           Client, React-Query-Hooks, generierte Typen
  lib/characters.ts  Character-Renders, Stock-Icons, Farben
  lib/ranked-day.ts  Die Fenster von Slippis Free Ranked Day
  lib/theme.tsx      Hell/Dunkel/System und die Palette als Werte
  lib/notifications.tsx  Die lokalen Erinnerungen an den Ranked Day
assets/characters/   35 Renders + 26 Stock-Icons, gebündelt
openapi/             Die Spec, aus der src/lib/api/schema.ts entsteht
reference/           Vorlagen aus dem abgelösten Web-Frontend
```

### API-Anbindung

Die App legt sich auf **v1** fest. `src/lib/api/schema.ts` ist generiert und
wird nicht von Hand geändert — bei einer Vertragsänderung die Spec in
`openapi/melee-v1.yaml` aktualisieren und `npm run gen:api` laufen lassen.

Der Client in `src/lib/api/client.ts` bildet zwei Eigenheiten des Vertrags ab:
den `{data, meta}`-Umschlag (Fehler sind problem+json und eben *nicht*
eingepackt) und die ETag-Validatoren — abgelegte ETags gehen als
`If-None-Match` mit, ein `304` wird aus dem Cache bedient.

Die Basis-URL steht in `app.json` unter `extra.apiBaseUrl` und lässt sich beim
Build über `API_BASE_URL` überschreiben.

### Anmeldestand

Die Anmeldezahl des nächsten Turniers ist der einzige Wert der App, der nicht
aus `/api/v1` kommt. Er kann es nicht: `/api/v1/events` listet ausschließlich
importierte, gespielte Events — ein Turnier taucht dort erst auf, wenn es
Ergebnisse hat. Die laufenden Anmeldungen liegen live bei start.gg.

`src/lib/api/upcoming.ts` holt sie deshalb dort, wo das Web-Frontend sie schon
serverseitig zusammenträgt: ein `GET /` mit dem Header `X-Inertia: true` liefert
statt der HTML-Seite deren Props als JSON, darin `upcomingEvent`. Kein Token,
keine zweite Abhängigkeit — aber auch **kein zugesicherter Vertrag**: das darf
sich jederzeit ändern und fällt mit dem alten Web-Frontend ganz weg.

Darauf ist die Datei ausgelegt. Der Zugriff steht isoliert in ihr und nicht im
Client, jede unerwartete Form wird zu `null` statt zu einem Fehler, und der
Screen steht auch ohne die Zahl. Bietet die API den Wert eines Tages selbst an —
etwa als `/api/v1/upcoming-event` —, wird genau diese eine Datei ersetzt; der
Rest der App kennt nur `fetchUpcomingEvent` und den Typ darunter.

### Ranked Day

`src/lib/ranked-day.ts` rechnet aus, wann Slippis Free Ranked Day läuft: alle
vier Tage, 24 Stunden lang, verankert an einem bekannten Fenster. Den Takt
liefert `schedule` aus `/api/v1/ranked-day`; die Konstanten im Code sind nur der
Notnagel, damit der erste Start ohne Netz trotzdem richtig zählt.

Der Countdown selbst läuft lokal. Zwei Dinge macht die App deshalb anders als
das Web: Sie rechnet bei jedem Tick aus `Date.now()` neu statt herunterzuzählen
— nach Stunden im Hintergrund stimmt die Anzeige damit sofort wieder, statt dort
weiterzuzählen, wo das System die Timer eingefroren hat. Und sie gleicht die
Geräteuhr gegen die des Servers ab: aus der Fenstergrenze und
`secondsRemaining` ergibt sich der Versatz, der ab einer halben Minute
Abweichung mitgerechnet wird. Darunter bliebe nur das Rauschen aus Laufzeit und
Sekundenauflösung, und ein bei jedem Abruf springender Countdown wäre schlechter
als eine um zwei Sekunden danebenliegende Anzeige.

### Styling

NativeWind 4 mit Tailwind 3.4, wie im Web. **daisyUI läuft hier nicht** — es ist
ein CSS-Plugin, und React Native hat keine CSS-Engine. Übernommen sind nur die
Farbnamen (`bg-base-100`, `text-base-content`, …), definiert als CSS-Variablen
in `src/global.css` und als Tokens in `tailwind.config.js`. Die Komponenten
liegen in `src/components/ui/`.

Die App **startet dunkel** wie das Original, lässt sich in den Einstellungen
aber auf Hell oder „System" stellen. Maßgeblich ist `src/lib/theme.tsx`: die
Palette hängt dort als CSS-Variablen (`vars()`) an einer Wurzel-View, und jede
Klasse darunter liest sie von dort. Dieselben Tripel stehen in
`src/global.css` als Rückfall, der dem Gerät folgt.

Der naheliegendere Weg über NativeWinds `colorScheme.set()` allein **trägt
nicht**: nativ hat NativeWind keinen eigenen Zustand, es folgt ausschließlich den
`Appearance`-Ereignissen von React Native — und verwirft sie, solange `AppState`
nicht „active" meldet. Genau das ist beim Start der Fall, die Wahl fiel damit
weg und die App blieb beim Schema des Geräts. Gesetzt wird `Appearance`
trotzdem, aber nur noch für Tastatur, Systemdialoge und native Menüs; dafür
steht `userInterfaceStyle` auf `"automatic"` (ein fest verdrahtetes Schema ließe
sich zur Laufzeit nicht übersteuern — **nach einer Änderung daran muss
`expo prebuild` laufen**, sonst steht in der `Info.plist` weiter das alte).

Den Rahmen des Web-Layouts stellt `src/components/screen.tsx`: `bg-base-200`,
darüber das Turnier-Hintergrundbild (20 % Deckkraft im Dunkeln, 10 % im Hellen),
darauf die Navbar mit Logo und start.gg-Verweis. Die Bottom-Navigation ersetzt
die Seitenlinks der Navbar: `src/components/ui/floating-tab-bar.tsx` zeichnet sie
als schwebende Kapsel im Stil von iOS 26 — Liquid Glass, wo es das gibt, sonst
eine gedeckte Fläche. Beschriftet ist nur der aktive Tab, damit drei Einträge
nebeneinander passen. Weil die Kapsel über dem Inhalt liegt, hängt `TabBarSpacer`
am Ende jeder Liste; seine Höhe ist die gemessene Höhe der Leiste. Unten rechts schwebt wie im Web der Ranked-Day-Anzeiger — er gehört in
den Rahmen und nicht auf einen Screen, damit ein Tab-Wechsel ihn nicht neu
startet.

## Stand

Alle vier Screens des Originals sind portiert, dazu kommt einer, den es im Web
nicht gibt:

| Screen | Route | Inhalt |
| --- | --- | --- |
| Turner Overview | `(tabs)/index` | Event-Auswahl mit Suche, Endplatzierungen, Ranking-Tabelle |
| Power Ranking | `(tabs)/power-ranking` | Bereichs- und Zeitraumwechsel, Legende, Spielerkarten mit Kostüm-Overrides |
| Event-Detail | `(tabs)/events/[eventId]` | Turnierverlauf nach Bracket-Runden, Charakterwahl, Endplatzierungen |
| Spieler-Detail | `(tabs)/players/[playerId]` | Platzierungsverlauf, Events, Charaktere, H2H |
| Einstellungen | `(tabs)/settings` | Darstellung (Hell/Dunkel/System), Ranked-Day-Erinnerung, Datenstand |

Die Detail-Routen liegen bewusst **innerhalb** der Tab-Gruppe (mit
`href: null`), damit die Bottom-Navigation auf ihnen stehen bleibt — im Web
bleibt die Navbar auf jeder Unterseite ebenfalls sichtbar.

### Benachrichtigungen

Es gibt nichts zu pushen: `/api/v1` liefert Daten und kennt keine Geräte. Der
Takt des Ranked Day steht aber fest, also plant `src/lib/notifications.tsx` die
Nachrichten selbst — lokal, und damit auch zugestellt, wenn die App nicht läuft.
Weil niemand von außen nachlegt, werden sechs Fenster auf einmal eingestellt und
bei jedem Start neu gesetzt (iOS hält je App höchstens 64 anstehende
Nachrichten). Der Schalter bleibt aus, solange das System die Erlaubnis
verweigert — sonst verspräche er etwas, das nicht kommt.

`expo-notifications` ist eine native Abhängigkeit: nach dem Ziehen der Änderung
einmal neu bauen (`npm run ios` bzw. `npm run android`), ein alter Build kennt
das Modul nicht.

### Bracket-Gruppierung

`src/lib/bracket.ts` ist der TypeScript-Port von
`reference/EventDetailBuilder.php` (329 Zeilen PHP). Die API liefert unter
`/api/v1/events/{id}` ein flaches `sets[]`; die Runden, ihre Reihenfolge vom
Grand Final hinunter zu den Pools und die Paarung von Winners- und
Losers-Runden desselben Schritts entstehen erst hier.

Zwei Abweichungen von der Vorlage, beide unvermeidbar: das Feld heißt in der
API `phase` statt `phaseName`, und `sortOrder` gibt es nicht — an seine Stelle
tritt der Array-Index, weil der Vertrag die Sets in Bracket-Reihenfolge zusagt.

Dazu kommen der Anmeldestand auf der Übersicht und der Ranked-Day-Anzeiger im
Rahmen; beide sind oben beschrieben.

Offen:

- **Push** — das Web nutzt Web-Push (VAPID); nativ braucht es FCM/APNs. Auf iOS
  erst mit einem bezahlten Apple-Developer-Account möglich.
