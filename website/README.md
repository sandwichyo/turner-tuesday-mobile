# MeleeImNorden

Monorepo with:

- Symfony backend (PHP-FPM) served by Nginx via Docker Compose
- Nuxt frontend (npm) with Tailwind CSS + daisyUI
- Minimal start.gg OAuth + GraphQL integration
- MariaDB (Doctrine ORM) as the persistent store

## Data model & import

Rankings are **no longer fetched from start.gg on page load**. Instead the data
is imported once per event into MariaDB and the pages read from there.

- **Event discovery:** the import searches start.gg for tournaments matching
  "Turner Tuesday" (from 2026-01-01 on) and imports every Melee singles event
  it finds. Amateur/Ladder side events are skipped.
- **Events without participants:** an event that has no standings is dropped in
  [EventDataProvider](backend/src/Service/Ranking/EventDataProvider.php) — the
  one place that keeps it out of the event list, out of every ranking and out
  of the API. The row stays in the database and an incremental import fetches
  it again (the skip list only covers events that already have standings), so
  results published after the import still arrive.
- **Background import:** open `/admin` (behind Basic-Auth), connect start.gg,
  then press **Import starten**. The import runs as a detached CLI worker
  (`app:import`); the page shows live progress and an activity log via polling.
- **Manually / cron:** `php bin/console app:import` (or `make import`) runs the
  same import in the foreground.

### Event detail page

`/events/{startggEventId}` shows a single event the way it was played: every set
grouped back into its bracket round, with who beat whom, the game score and the
characters both sides picked, followed by the final standings. It is linked from
the event card on the overview and from every event in a participant's history.

The data behind it lives on the set itself — `set_result` carries the round, the
phase and the score, and `set_character_pick` carries the characters of one set,
counted per game (`CharacterSelection` stays the per-event aggregate the
rankings read). Both are filled by the import:

- **After deploying this, run a full import once.** Sets stored before it have
  no round and no score; they still count for every ranking, but the detail page
  can only list them under "Weitere Sets" until a full (non-incremental) run has
  refreshed them.

### Database configuration

The connection is configured via `DATABASE_URL` (see `backend/.env` for the
default shape). In production the database is **external** — provide
`DATABASE_URL` through the server `.env` that `compose.prod.yml` loads via
`env_file`. The production `php` image runs pending migrations on start-up
before booting PHP-FPM.

For local development, `compose.yml` includes a `mariadb` service. Apply
migrations with:

```bash
make migrate            # docker compose exec php php bin/console doctrine:migrations:migrate
```

## PWA & push notifications

The app installs to a phone or desktop home screen and can send push
notifications to everyone who opted in.

What makes it work:

- [backend/public/site.webmanifest](backend/public/site.webmanifest) — name,
  icons (`any` **and** `maskable`), `start_url`, `scope` and `display:
  standalone`, the metadata browsers require before offering an install.
- [backend/public/sw.js](backend/public/sw.js) — the service worker. Navigations
  are network-first with [offline.html](backend/public/offline.html) as
  fallback, `/build/` and `/characters/` are served stale-while-revalidate, and
  `push` / `notificationclick` / `pushsubscriptionchange` handle notifications.
  It is served from the web root (never from `/build/`) so its scope covers the
  whole site, and nginx sends it with `Cache-Control: no-cache`.
- The bell in the navbar
  ([PushBell.vue](frontend/src/components/PushBell.vue)) and the floating
  install hint ([InstallPrompt.vue](frontend/src/components/InstallPrompt.vue)),
  a card that slides in bottom-right (full width on phones) and can be dismissed
  for good — it stays hidden once the app runs standalone, and on iOS, which has
  no install prompt, it explains the share-sheet route instead.

- [appUpdate.ts](frontend/src/appUpdate.ts) — the update check. A standalone
  window can stay open for days without a navigation, so it would keep running
  the bundle it started with. CI passes the deploy's commit sha as
  `INERTIA_VERSION`; the server embeds it in the rendered document and serves it
  from `/api/version`, and when the two differ the installed app reloads itself.
  It checks on load and whenever the app returns to the foreground, skips the
  reload while something is being typed, and records the target version in
  `sessionStorage` so a stale document can never reload in circles. Ordinary
  browser tabs are left alone — there an automatic reload would interrupt rather
  than update.

Both features need **https** (or `localhost`); on iOS notifications only arrive
once the app has actually been added to the home screen (iOS 16.4+).

### VAPID setup (once per environment)

Push messages are signed with a VAPID keypair the backend owns:

```bash
make vapid-keys            # docker compose exec php php bin/console app:push:vapid-keys
```

Put the output into the environment that runs the `php` container:

- local: the root [.env](.env) (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`), which `compose.yml` forwards
- production: the server-side `.env` next to the compose file

`VAPID_SUBJECT` is a contact for the push services — a `mailto:` address or a
https URL. Keep the private key out of Git, and keep the keypair stable:
**changing the public key invalidates every existing browser subscription.**

Without keys the site still installs; only the push part stays switched off and
the /admin form says so.

### Sending

- **/admin** has a *Push-Benachrichtigungen* card: title, text, the path opened
  on tap, and an optional tag that replaces an earlier message of the same kind.
- **Test an dieses Gerät** (same card) sends to the admin's own browser only —
  the button posts that browser's push endpoint to `/api/push/test`, which
  refuses anything else. A filled-in form is previewed exactly as it would be
  broadcast, an empty one gets a stock message. It needs the bell in the navbar
  to be switched on in the same browser.
- **CLI / cron**, same code path:

  ```bash
  php bin/console app:push:send --title="Heute ist Turner Tuesday" \
      --body="Ab 19 Uhr geht es los." --url=/ --tag=turner-tuesday
  ```

  On the server this can be wired to the existing deck-chores scheduler the same
  way the import is (see the `cron.*` labels in
  [compose.prod.yml](compose.prod.yml)).

Subscriptions live in the `push_subscription` table. Endpoints the push service
reports as gone (404/410) are deleted automatically during the next send, so the
list stays clean without maintenance.

## Slippi Free Ranked Day

Slippi opens ranked play to everyone every four days for 24 hours. The cadence
is fixed and anchored to a known window (**2024-04-15 08:00 UTC**), so both ends
compute it locally — there is nothing to ask Slippi for.

- **Indicator:** a floating button in the bottom-right corner
  ([RankedDayIndicator.vue](frontend/src/components/RankedDayIndicator.vue),
  [useRankedDay.ts](frontend/src/composables/useRankedDay.ts)) — a red dot
  while waiting, a green pulsing "Ranked Day" pill while a window runs. Tapping
  it opens the exact countdown and the window's start/end upwards; the popover
  closes via its ✕, a tap outside, Escape or a second tap on the button (daisyUI's
  `:focus-within` dropdown does not close reliably on touch). It renders
  client-side only, because the countdown depends on the visitor's clock.
- **Notification:** `app:push:ranked-day` announces a running window once. It is
  safe to run at any interval: outside a window it does nothing, and the window
  it announced is remembered in the app cache, so a rerun stays silent.

  ```bash
  make ranked-day                             # show the window, send nothing
  php bin/console app:push:ranked-day         # what cron runs
  php bin/console app:push:ranked-day --force # ignore window and marker (testing)
  ```

  In production the deck-chores label runs it daily at **08:05 UTC** — scheduled
  in UTC on purpose, since the window would otherwise drift by an hour across
  DST (see `cron.meleeimnorden-ranked-day.*` in
  [compose.prod.yml](compose.prod.yml)).

The schedule lives in two places that must stay in sync:
[RankedDayCalculator.php](backend/src/Service/RankedDay/RankedDayCalculator.php)
for the notification and `useRankedDay.ts` for the indicator.

## Public API (versioned)

Everything the site shows is also available as JSON, so a separate client — the
planned smartphone app — can stay in sync without scraping the Inertia pages.

The API is **read-only, unauthenticated and versioned by path**. Versioning is
the point: the way events are discovered and the way rankings are computed are
expected to change, and a released app must not break when they do.

```
GET /api/versions                 which versions exist, and until when
GET /api/v1                       index of the v1 resources
GET /api/v1/meta                  how current the data is (cheap to poll)
GET /api/v1/openapi.json|yaml     the OpenAPI 3.1 description
GET /api/v1/events                imported events, newest first
GET /api/v1/events/{eventId}      one event: standings, sets, character usage
GET /api/v1/rankings              the ranking tables and the rules each applies
GET /api/v1/rankings/{type}       quarterly | power, ?scope=qualified|all
GET /api/v1/players               roster, ?q= ?sort=name|average|attendances
GET /api/v1/players/{playerId}    placements, head-to-head, characters
GET /api/v1/ranked-day            the Slippi Free Ranked Day window
```

Collections take `limit`/`offset` and report `meta.pagination`.

### The contract

- Every payload is `{"data": …, "meta": {…}}`. Errors are
  `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)),
  never an envelope — branch on the status code.
- All timestamps are ISO-8601 in **UTC**.
- Within a version only *additive* changes happen: new endpoints, new fields. A
  client must ignore fields it does not know.
- Anything that changes what an existing field **means** — including a change to
  the import or to a ranking formula — gets a new version. `GET /api/versions`
  then reports v1 as `deprecated` with a `sunsetOn` date, and every v1 response
  repeats it in the `Deprecation`, `Sunset` and `Link: rel="successor-version"`
  headers. An app should check that endpoint on start-up.

### Staying up to date cheaply

`meta.dataVersion` is a fingerprint of the served data (it also folds in the
deployed version, since a deploy can change the numbers on its own). Poll
`GET /api/v1/meta`, compare it with the last one seen, and refetch nothing when
it is unchanged.

Every data response also carries `ETag` and `Last-Modified`; sending them back as
`If-None-Match` / `If-Modified-Since` gets a `304` with no body. `/api/v1/ranked-day`
is the exception — its countdown moves with the clock, so it has a short
`max-age` and no validator.

```bash
curl -i https://melee.sandwichyo.com/api/v1/rankings/power?scope=qualified
curl -s https://melee.sandwichyo.com/api/v1/meta | jq .meta.dataVersion
```

### Where the code lives

| Path | Role |
| --- | --- |
| [ApiVersion.php](backend/src/Api/ApiVersion.php) | the version registry — status, dates, successor, and the checklist for adding v2 |
| [Api/Http/](backend/src/Api/Http) | envelope, ETag handling, problem+json, paging |
| [Api/V1/ReadModel/V1ReadModel.php](backend/src/Api/V1/ReadModel/V1ReadModel.php) | **the freeze point**: the only class in `Api/V1` that touches a domain service |
| [Api/V1/Controller/](backend/src/Api/V1/Controller) | the routes |
| [Api/V1/Resource/](backend/src/Api/V1/Resource) | the wire format |
| [config/api/openapi_v1.yaml](backend/config/api/openapi_v1.yaml) | the OpenAPI description that is served |

`V1ReadModel` is what makes the versioning real. Today it delegates to
`EventDataProvider` and `RankingCalculator`, the same services the Inertia pages
use. When those change in a way v1 must not follow, pin v1 there — keep a frozen
copy of the calculation and inject it — instead of touching the controllers or
the resources.

### Adding v2

`ApiVersion` carries the full checklist. In short: add the enum case and its
prefix, copy `src/Api/V1` to `src/Api/V2`, give v1 a successor and a sunset date,
and add `config/api/openapi_v2.yaml`. Both versions are then served side by side
and `GET /api/versions` tells clients which to use.

### CORS

A native app never needs it, but a browser client does: `API_ALLOWED_ORIGINS`
(comma-separated, default `*`) controls it. The API is read-only and reads no
cookie, so no credentials are allowed and the wildcard stays safe. Preflights are
answered before routing — see
[ApiCorsListener.php](backend/src/Api/EventListener/ApiCorsListener.php).

## start.gg integration

This repo now includes a minimal start.gg setup with these boundaries:

- OAuth redirect + token exchange happen in Symfony
- start.gg GraphQL requests are executed only in Symfony
- Nuxt renders JSON returned by the backend

### Required local environment variables

For local Docker development, add these variables to a local root `.env` file that is not committed:

```bash
START_GG_CLIENT_ID=your-client-id
START_GG_CLIENT_SECRET=your-client-secret
START_GG_REDIRECT_URI=http://localhost:8080/api/startgg/oauth/callback
START_GG_SCOPES=user.identity
FRONTEND_APP_URL=http://localhost:3000
```

For the local Nuxt dev server, set this variable when needed:

```bash
NUXT_PUBLIC_BACKEND_API_BASE=http://localhost:8080/api
```

Local `/admin` access is also protected with HTTP basic auth through `docker/nginx/.htpasswd` when using the Dockerized backend.
To use that protection locally, open the app through `http://localhost:8080`, not directly through Nuxt on port `3000`.

For production, pass the same `START_GG_*` values into the `php` container and set the public frontend base like this:

```bash
NUXT_PUBLIC_BACKEND_API_BASE=/api
FRONTEND_APP_URL=https://your-domain.example
START_GG_REDIRECT_URI=https://your-domain.example/api/startgg/oauth/callback
```

### Sign-up counter and seat limit

The homepage shows the sign-ups for the next Turner Tuesday as `x/y`, read live
from start.gg and cached for five minutes
([UpcomingEventProvider](backend/src/Service/Event/UpcomingEventProvider.php)).

The limit `y` does **not** come from start.gg: its API has no registration-cap
field (`Event.entrantSizeMax` is the number of players *per entrant* — 1 for
singles). The cap is configured instead:

```bash
TURNER_TUESDAY_CAPACITY=8   # 0 = no limit, the counter then shows only x
```

### OAuth note

According to the start.gg docs, OAuth currently uses the authorization-code flow with refresh tokens. The backend implementation in this repo follows that model and stores the returned access token in the Symfony session.

### What was added

- Backend endpoints under `/api/startgg/*`
- OAuth connect + callback handling in Symfony
- A sample tournament query in Symfony using the start.gg GraphQL API
- A Nuxt/Vue screen that connects, fetches, and renders tournament data

## Prereqs

- Docker Desktop (with `docker compose`)
- PHP 8.4+ + Composer
- Node.js + npm

## First-time setup

### Backend (Symfony)

Create the Symfony project:

```bash
composer create-project symfony/skeleton backend
```

Install PHP dependencies:

```bash
cd backend
composer install
```

Start backend:

```bash
docker compose up -d --build php nginx
```

Backend URL: http://localhost:8080

### Frontend (Nuxt)

Create the Nuxt project (defaults):

```bash
npx nuxi@latest init frontend
```

Install deps and run dev server locally:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: http://localhost:3000

If you want local Nginx protection for `/admin`, access the app via http://localhost:8080 while the Nuxt dev server is running.

## Docker layout

The Docker files are now split by target:

- `docker/development/*` for local Compose development
- `docker/deployment/*` for production image builds used by GitHub Actions

Local development still uses:

- Docker for Symfony + Nginx
- local Nuxt dev server on port `3000`

## Production (Docker)

This repo includes a production compose file that runs:

- Nuxt as a Node container image
- Symfony as a PHP-FPM container image
- Nginx as a container image that routes `/` -> Nuxt and `/api` -> Symfony

### Protecting `/admin` with basic auth

The production Nginx image protects `/admin` with HTTP basic auth using the `NGINX_HTPASSWD` GitHub secret at image build time.

For local development, copy [docker/development/nginx/.htpasswd.example](docker/development/nginx/.htpasswd.example) to `docker/nginx/.htpasswd` and replace it with output from one of these commands:

```bash
htpasswd -nbB your-user your-password
docker run --rm httpd:2.4-alpine htpasswd -nbB your-user your-password
```

The real `docker/nginx/.htpasswd` file is ignored by Git.

### GitHub Actions staging deployment

The staging workflow lives in [.github/workflows/staging.yml](.github/workflows/staging.yml) and does two things:

1. Builds and pushes `php`, `nuxt`, and `nginx` images to GHCR from `docker/deployment/*`
2. Uploads [compose.prod.yml](compose.prod.yml) and a generated `.env` file to the remote server and starts the stack via Docker Compose

Expected GitHub secrets:

- `SSH_PRIVATE_KEY`
- `REMOTE_HOST`
- `REMOTE_USER`
- `REMOTE_APP_DIR`
- `APP_NETWORK`
- `HTTP_NETWORK`
- `NGINX_HTPASSWD`
- `START_GG_CLIENT_ID`
- `START_GG_CLIENT_SECRET`
- `START_GG_REDIRECT_URI`
- `START_GG_SCOPES`
- `FRONTEND_APP_URL`
- `NUXT_PUBLIC_BACKEND_API_BASE`

### Run on a server that already has a global reverse-proxy

If you have a global stack (e.g. https-portal) that routes traffic to containers via a shared Docker network, connect this stack’s `nginx` service to that network.

1. Push to the `staging` branch or trigger the staging workflow manually.
2. The workflow uploads [compose.prod.yml](compose.prod.yml) and a generated `.env` file into `REMOTE_APP_DIR` on the server.
3. The remote host then runs:

```bash
docker compose --env-file .env -f compose.prod.yml up -d --remove-orphans
```

The global reverse-proxy should route your domain to this stack’s `nginx` container.
