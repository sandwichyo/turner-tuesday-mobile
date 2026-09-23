# Build-Artefakte

Hier landen die fertigen Installationspakete:

| Datei | Erzeugt mit |
| --- | --- |
| `TurnerTuesdays-<version>.ipa` | `npm run build:ipa` |
| `TurnerTuesdays-<version>.apk` | `npm run build:apk` |

Die Versionsnummer kommt aus `app.json` (`expo.version`).

Die Artefakte selbst sind nicht versioniert — nur dieser Ordner und diese
Datei. Zwischenmaterial (Xcode-Archiv, `Payload/`) liegt während des Builds
unter `.work/` und wird nach einem erfolgreichen Lauf entfernt; nach einem
Fehlschlag bleibt es zur Fehlersuche liegen.

**IPA:** unsigniert. Die Signatur setzt erst der Installationsweg
(AltStore, Sideloadly o. ä.) mit der eigenen Apple-ID; mit einer kostenlosen
Apple-ID hält sie sieben Tage.

**APK:** mit dem Debug-Keystore der Expo-Vorlage signiert. Unbegrenzt
lauffähig, aber nicht für den Play Store geeignet.
