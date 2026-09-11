# Turner Tuesdays — Mobile

React-Native-App (Expo SDK 57) für die Turner-Tuesday-Serie. Die Daten kommen
vollständig aus der öffentlichen, versionierten API von
`melee.sandwichyo.com` — die App schreibt nichts und meldet niemanden an.

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
| `npm run ios` / `npm run android` | Start auf Simulator/Emulator |
| `npm run gen:api` | Typen aus `openapi/melee-v1.yaml` neu erzeugen |

## Aufbau

```
src/
  app/               expo-router: (tabs)/index, (tabs)/power-ranking
  components/ui/     Ersatz für daisyUI (Card, Badge, Segmented, States)
  lib/api/           Client, React-Query-Hooks, generierte Typen
  lib/characters.ts  Character-Renders, Stock-Icons, Farben
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

### Styling

NativeWind 4 mit Tailwind 3.4, wie im Web. **daisyUI läuft hier nicht** — es ist
ein CSS-Plugin, und React Native hat keine CSS-Engine. Übernommen sind nur die
Farbnamen (`bg-base-100`, `text-base-content`, …), definiert als CSS-Variablen
in `src/global.css` und als Tokens in `tailwind.config.js`. Die Komponenten
liegen in `src/components/ui/`.

Die App läuft **fest im Dark-Theme** des Originals — das Systemschema schaltet
nichts um. Verankert ist das an drei Stellen: `:root` in `src/global.css` (ohne
prefers-color-scheme-Zweig, die Light-Werte stehen als Kommentar daneben),
`userInterfaceStyle: "dark"` in `app.json` und `DarkTheme` im Root-Layout.

Den Rahmen des Web-Layouts stellt `src/components/screen.tsx`: `bg-base-200`,
darüber das Turnier-Hintergrundbild mit 20 % Deckkraft, darauf die Navbar mit
Logo und start.gg-Verweis. Die Bottom-Navigation ersetzt die Seitenlinks der
Navbar.

## Stand

Alle vier Screens des Originals sind portiert:

| Screen | Route | Inhalt |
| --- | --- | --- |
| Turner Overview | `(tabs)/index` | Event-Auswahl mit Suche, Endplatzierungen, Ranking-Tabelle |
| Power Ranking | `(tabs)/power-ranking` | Bereichs- und Zeitraumwechsel, Legende, Spielerkarten mit Kostüm-Overrides |
| Event-Detail | `(tabs)/events/[eventId]` | Turnierverlauf nach Bracket-Runden, Charakterwahl, Endplatzierungen |
| Spieler-Detail | `(tabs)/players/[playerId]` | Platzierungsverlauf, Events, Charaktere, H2H |

Die Detail-Routen liegen bewusst **innerhalb** der Tab-Gruppe (mit
`href: null`), damit die Bottom-Navigation auf ihnen stehen bleibt — im Web
bleibt die Navbar auf jeder Unterseite ebenfalls sichtbar.

### Bracket-Gruppierung

`src/lib/bracket.ts` ist der TypeScript-Port von
`reference/EventDetailBuilder.php` (329 Zeilen PHP). Die API liefert unter
`/api/v1/events/{id}` ein flaches `sets[]`; die Runden, ihre Reihenfolge vom
Grand Final hinunter zu den Pools und die Paarung von Winners- und
Losers-Runden desselben Schritts entstehen erst hier.

Zwei Abweichungen von der Vorlage, beide unvermeidbar: das Feld heißt in der
API `phase` statt `phaseName`, und `sortOrder` gibt es nicht — an seine Stelle
tritt der Array-Index, weil der Vertrag die Sets in Bracket-Reihenfolge zusagt.

Offen:

- **Anmeldezähler** auf der Übersicht — die Zahl kommt live von start.gg und ist
  in der API noch nicht exponiert. Braucht einen Endpunkt.
- **Push** — das Web nutzt Web-Push (VAPID); nativ braucht es FCM/APNs. Auf iOS
  erst mit einem bezahlten Apple-Developer-Account möglich.
