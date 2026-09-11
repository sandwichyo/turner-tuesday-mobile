---
name: project-inertia-migration
description: InertiaJS + SSR migration from Nuxt to Vite+Vue in this Symfony 8 project
metadata:
  type: project
---

InertiaJS wurde als manuell implementiertes Protokoll (kein Bundle) in Symfony 8 integriert. `rompetomp/inertia-bundle` unterstützt nur Symfony ≤6; deshalb eigene `App\Inertia\Inertia`-Klasse in `backend/src/Inertia/Inertia.php`.

**Why:** Clean SSR — Daten kommen jetzt als Inertia-Props von Symfony statt via `onMounted`+fetch.

**How to apply:** Bei neuen Seiten: Symfony-Route mit `$this->inertia->render('PageName', $props)` + Vue-Datei in `frontend/src/pages/PageName.vue`.

**Schlüssel-Entscheidungen:**
- Nuxt ersetzt durch Vite + Vue 3 + `@inertiajs/vue3`
- `pentatrion/vite-bundle` für Symfony-Vite-Integration (unterstützt Symfony 8)
- SSR läuft als separater Node.js-Container (`ssr`-Service in compose.yml) auf Port 13714
- Twig-Funktionen nutzen Entry-Name `'app'` (nicht den Dateipfad `'src/app.ts'`)
- Assets: `/characters/` → gemountetes `assets/`-Verzeichnis in Nginx; `/build/` → statisch aus `backend/public/build/`
- OAuth-Callback-Redirect zeigt jetzt auf `/approve` (Symfony-Route) statt alte Nuxt-URL
- `INERTIA_SSR_ENABLED=true` in compose.yml → SSR aktiv; `=false` → Client-only

**Build-Befehle (in `frontend/`):**
- `npm run build:client` → `backend/public/build/`
- `npm run build:ssr` → `backend/ssr/ssr.js`
- `npm run build` → beides
