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
  lib/series.tsx     Die Turnier-Reihen und welche gerade gilt
  lib/theme.tsx      Hell/Dunkel/System und die Palette als Werte
  lib/notifications.tsx  Die lokalen Erinnerungen an den Ranked Day
assets/characters/   35 Renders + 26 Stock-Icons, gebündelt
assets/tenants/      Logo und Hintergrund je Reihe
openapi/             Die Spec, aus der src/lib/api/schema.ts entsteht
reference/           Vorlagen aus dem abgelösten Web-Frontend
```

### API-Anbindung

Die App legt sich auf **v2** fest. In v2 hängt jede Datenressource unter einer
Turnier-Reihe (`/api/v2/series/{series}/…`), deshalb tragen die Pfad-Helfer in
`src/lib/api/client.ts` den Slug als ersten Parameter; welcher es ist, sagt
`useSeries()` (siehe unten). Nur `/api/v2/meta` und `/api/v2/ranked-day` liegen
daneben — das Ranked-Day-Fenster gilt für alle Reihen gleich.

Zwei Dinge sind gegenüber v1 nicht bloß umbenannt: die beiden Ranglisten haben
verschiedene Formen und deshalb je einen eigenen Pfad statt `rankings/{type}`,
und das Power Ranking kennt keine Bereiche mehr (siehe unten). Welche Bereiche
die Quartalswertung führt und welcher davon die Vorgabe ist, steht im Katalog
unter `rankings` — die App liest es dort aus, statt `qualified` anzunehmen.

`src/lib/api/schema.ts` ist generiert und wird nicht von Hand geändert — bei
einer Vertragsänderung die Spec in `openapi/melee-v2.yaml` aktualisieren und
`npm run gen:api` laufen lassen.

Der Client in `src/lib/api/client.ts` bildet zwei Eigenheiten des Vertrags ab:
den `{data, meta}`-Umschlag (Fehler sind problem+json und eben *nicht*
eingepackt) und die ETag-Validatoren — abgelegte ETags gehen als
`If-None-Match` mit, ein `304` wird aus dem Cache bedient.

Die Basis-URL steht in `app.json` unter `extra.apiBaseUrl` und lässt sich beim
Build über `API_BASE_URL` überschreiben.

### Turnier-Reihen

Das Logo in der Navbar ist zugleich der Umschalter zwischen den Reihen, wie im
Web (`frontend/src/layouts/Default.vue`). Ein Wechsel führt zurück auf die
Übersicht: Event- und Spieler-Detail hängen an Ids der vorigen Reihe, die es in
der neuen nicht gibt.

Im Web steckt die Reihe im Pfad und kommt mit jeder Seite vom Server. Hier gibt
es keinen Pfad, also gehört sie in den Zustand — `src/lib/series.tsx` hält sie,
legt sie in AsyncStorage ab und gibt sie über `useSeries()` weiter. Der Slug
steckt zusätzlich in **jedem** Query-Key, sonst zeigte die neue Reihe für einen
Moment die Tabelle der vorigen.

Der Katalog steht in dieser Datei und kommt **nicht** aus `/api/v2/series`. Die
Bilder liegen im Bundle und nicht auf dem Host, eine Reihe ohne sie wäre also
ohnehin nur halb da — und auf der Gegenseite ist die Liste genauso fest
verdrahtet: `App\Tenant\Tenant` ist ein PHP-Enum und ändert sich nur mit einem
Deploy. Eine neue Reihe = ein Eintrag in `SERIES` plus Logo und Hintergrund
unter `assets/tenants/` (aus `backend/public/tenants/` von MeleeImNorden). Die
Feldnamen sind die des `Series`-Schemas der API, damit ein späterer Umstieg auf
den Endpunkt diese eine Datei kostet.

Was die Reihen unterscheidet, ist mehr als das Bild: `turner-tuesday` führt eine
eigene „6+ Teilnehmer"-Tabelle, die anderen nicht. Genau deshalb liest die
Übersicht den Vorgabe-Bereich aus dem Ranglisten-Katalog, statt `qualified`
anzunehmen — sonst wäre der Wechsel zu GeMaOn ein 404.

### Power Ranking v2

Die Rangliste unter `rankings/power` rechnet in v2 anders, und der Screen zeigt
das: sortiert wird nach `score` — der Spielstärke auf einer Skala, auf der 500
der Durchschnitt aller gewerteten Spieler ist —, nicht mehr nach
durchschnittlicher Platzierung. Jedes Event zählt, gewichtet danach, wie stark
sein Feld besetzt war; eine Mindestgröße und eine Mindestzahl an Teilnahmen gibt
es nicht mehr, und damit auch keinen Bereichsumschalter.

Die Ampel auf den Karten bedeutet deshalb etwas anderes als vorher: sie zeigt
nicht mehr verpasste Events, sondern wie stark die Felder waren, gegen die ein
Spieler angetreten ist (`averageFieldStrength`, gleiche Skala wie `score`).

### Anmeldestand

Die Anmeldezahl des nächsten Turniers ist der einzige Wert der App, der nicht
aus `/api/v2` kommt. Er kann es nicht: die Event-Liste einer Reihe führt
ausschließlich importierte, gespielte Events — ein Turnier taucht dort erst auf,
wenn es Ergebnisse hat. Die laufenden Anmeldungen liegen live bei start.gg.

`src/lib/api/upcoming.ts` holt sie deshalb dort, wo das Web-Frontend sie schon
serverseitig zusammenträgt: ein `GET` auf die Startseite der Reihe
(`/turner-tuesday` und so fort) mit dem Header `X-Inertia: true` liefert statt
der HTML-Seite deren Props als JSON, darin `upcomingEvent`. Kein Token,
keine zweite Abhängigkeit — aber auch **kein zugesicherter Vertrag**: das darf
sich jederzeit ändern und fällt mit dem alten Web-Frontend ganz weg.

Darauf ist die Datei ausgelegt. Der Zugriff steht isoliert in ihr und nicht im
Client, jede unerwartete Form wird zu `null` statt zu einem Fehler, und der
Screen steht auch ohne die Zahl. Bietet die API den Wert eines Tages selbst an —
etwa als `upcoming-event` unter der Reihe —, wird genau diese eine Datei ersetzt; der
Rest der App kennt nur `fetchUpcomingEvent` und den Typ darunter.

### Ranked Day

`src/lib/ranked-day.ts` rechnet aus, wann Slippis Free Ranked Day läuft: alle
vier Tage, 24 Stunden lang, verankert an einem bekannten Fenster. Den Takt
liefert `schedule` aus `/api/v2/ranked-day`; die Konstanten im Code sind nur der
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

### App-Icon

Die Vorlage liegt als `docs/melee-im-norden.jpg` (1024²) im Repo: ein Leuchtturm
unter Nordlicht im Smash-Emblem, gerendert als Attrappe auf einer Wand. Die
Icons sind daraus zugeschnitten, der gezeichnete Rahmen der Attrappe bleibt
draußen — iOS und Android legen ihre eigene Maske darüber, und ein zweiter
Rahmen darin ist der klassische Doppelrand.

| Datei | Ausschnitt der Vorlage | Größe |
| --- | --- | --- |
| `assets/images/icon.png` | 192–832, randlos | 1024² |
| `assets/images/favicon.png` | derselbe | 48² |
| `assets/images/android-icon-foreground.png` | 140–884, auf 470 px in der Mitte | 512² |
| `assets/images/android-icon-background.png` | einfarbig `#112540` | 512² |

Der Vordergrund ist der weitere Ausschnitt, weil Android nur die mittleren
66,7 % zeigt: der Ring muss vollständig in diese Zone passen, der Rest ist
Anschnitt. `#112540` ist der Randton des Sternenhimmels, damit die Fläche
hinter dem Anschnitt nicht abreißt.

Kein `monochromeImage`: ein Schwellwert über die Vorlage macht aus Sternen und
Nordlicht Rauschen statt einer Silhouette, und der untere Teil des Rings ist zu
dunkel, um stehen zu bleiben. Ohne den Schlüssel zeigt Android im
Themed-Icon-Modus das normale adaptive Icon. Für ein echtes gäbe es nur eine
flache Zeichnung des Rings.

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
darüber das Hintergrundbild der aktiven Reihe (20 % Deckkraft im Dunkeln, 10 %
im Hellen), darauf die Navbar mit dem Reihen-Umschalter und dem
start.gg-Verweis. Die Bottom-Navigation ersetzt
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
| Übersicht | `(tabs)/index` | Event-Auswahl mit Suche, Endplatzierungen, Ranking-Tabelle |
| Power Ranking | `(tabs)/power-ranking` | Zeitraumwechsel, Legende, Spielerkarten mit Kostüm-Overrides |
| Event-Detail | `(tabs)/events/[eventId]` | Turnierverlauf nach Bracket-Runden, Charakterwahl, Endplatzierungen |
| Spieler-Detail | `(tabs)/players/[playerId]` | Platzierungsverlauf, Events, Charaktere, H2H |
| Einstellungen | `(tabs)/settings` | Darstellung (Hell/Dunkel/System), Ranked-Day-Erinnerung, Datenstand |

Die Detail-Routen liegen bewusst **innerhalb** der Tab-Gruppe (mit
`href: null`), damit die Bottom-Navigation auf ihnen stehen bleibt — im Web
bleibt die Navbar auf jeder Unterseite ebenfalls sichtbar.

### Benachrichtigungen

Es gibt nichts zu pushen: `/api/v2` liefert Daten und kennt keine Geräte. Der
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
`/api/v2/series/{series}/events/{id}` ein flaches `sets[]`; die Runden, ihre Reihenfolge vom
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
- **Turniersiege und Eventgewichte** — v2 liefert beides (`tournamentWins` je
  Zeile, `events[]` je Abschnitt), die Karten zeigen es noch nicht. Im Web sind
  das die Krone und die Tabelle „Eventgewichte".
- **Neue Reihen ohne App-Update** — der Katalog steht im Code, weil die Bilder
  im Bundle liegen. Eine fünfte Reihe braucht eine neue Version.
