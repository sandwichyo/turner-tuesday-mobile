# Referenz aus dem Web-Frontend

Diese Dateien stammen aus dem abgelösten Projekt (Symfony + Vue/Inertia) und
sind die Vorlage für die Screens, die noch nicht portiert sind. Sie werden von
der App **nicht** importiert und laufen auch nicht durch die Typprüfung
(siehe `exclude` in tsconfig.json) — sie liegen hier, weil das Ursprungsprojekt
entfernt wurde und dies die einzige verbliebene Kopie ist.

| Datei | Wofür |
| --- | --- |
| `EventDetailBuilder.php` | Die Bracket-Gruppierung (Winners/Losers-Paarung, Stage-Ranking, Pools). Muss nach TypeScript portiert werden — die API liefert unter `/api/v1/events/{id}` nur ein flaches `sets[]`. |
| `EventsShow.vue` | Vorlage für den Event-Detail-Screen. |
| `ParticipantsShow.vue` | Vorlage für den Spieler-Detail-Screen, inkl. Platzierungsverlauf (im Web chart.js). Bereits portiert; die Kopie ist auf dem Stand der Kronendarstellung. |
| `TimeRangeSlider.vue` | Der Zwei-Griff-Regler der Spieler-Detail-Seite. Portiert nach `src/components/ui/range-slider.tsx`. |
| `Home.vue` | Vorlage für die Übersicht. Der Anmeldezähler ist portiert; woher die Zahl kommt, steht in `src/lib/api/upcoming.ts`. |
| `PowerRanking.vue` | Bereits portiert nach `src/app/(tabs)/power-ranking.tsx`. |
| `characters.ts` | Bereits portiert nach `src/lib/characters.ts` und `src/lib/player-images.ts`. |
| `useRankedDay.ts` | Bereits portiert nach `src/lib/ranked-day.ts` — dort kommt der Takt aus `/api/v1/ranked-day` statt aus Konstanten. |
| `openapi_v1.yaml` | Kopie der Spec. Die maßgebliche Fassung liegt in `openapi/melee-v1.yaml`. |

Sobald alle Screens portiert sind, kann dieser Ordner weg.
