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
in `src/global.css` und als Tokens in `tailwind.config.js`. Hell/Dunkel folgt
dem Systemschema. Die Komponenten liegen in `src/components/ui/`.

## Stand

Portiert: Power Ranking, Event-Liste.

Offen:

- **Event-Detail** — braucht die Bracket-Gruppierung aus
  `reference/EventDetailBuilder.php` in TypeScript; die API liefert ein flaches
  `sets[]`.
- **Spieler-Detail** — inkl. Platzierungsverlauf (im Web chart.js, hier
  `react-native-svg`).
- **Anmeldezähler** auf der Übersicht — die Zahl kommt live von start.gg und ist
  in der API noch nicht exponiert. Braucht einen Endpunkt.
- **Push** — das Web nutzt Web-Push (VAPID); nativ braucht es FCM/APNs. Auf iOS
  erst mit einem bezahlten Apple-Developer-Account möglich.
