/**
 * Turner Tuesdays service worker.
 *
 * Three jobs:
 *   1. keep the app installable and usable when the network drops,
 *   2. serve the hashed Vite assets and character images from cache,
 *   3. show the Web Push notifications the backend sends (see PushNotifier).
 *
 * Bump CACHE_VERSION whenever the caching rules or the offline page change —
 * activate() then drops every cache that does not belong to this version.
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `tt-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tt-runtime-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

const OFFLINE_URL = "/offline.html";
const NOTIFICATION_ICON = "/web-app-manifest-192x192.png";
const NOTIFICATION_BADGE = "/favicon-96x96.png";

/** Cached during install so the offline fallback never depends on the network. */
const SHELL_ASSETS = [OFFLINE_URL, NOTIFICATION_ICON, "/favicon.svg"];

/** Paths that must always hit the network (live data, auth, dev server). */
const NETWORK_ONLY = ["/api/", "/admin", "/@vite/", "/@fs/", "/@id/", "/node_modules/"];

/** Long-lived assets: hashed builds, character art, icons and fonts. */
const CACHEABLE_ASSET = /\.(?:js|css|png|jpe?g|svg|webp|ico|woff2?)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tt-") && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.some((prefix) => url.pathname.startsWith(prefix))) return;

  // Full page loads: always try the network first so rankings stay current,
  // and fall back to the last successful render (or the offline page).
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Inertia visits are XHR and carry this header — they must never be served
  // from the HTML cache.
  if (request.headers.get("X-Inertia")) return;

  if (
    url.pathname.startsWith("/build/") ||
    url.pathname.startsWith("/characters/") ||
    CACHEABLE_ASSET.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ??
      (await caches.match(OFFLINE_URL)) ??
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await network) ?? Response.error();
}

// ─── Push ────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  const payload = readPayload(event);

  const options = {
    body: payload.body ?? "",
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    lang: "de",
    data: { url: payload.url ?? "/" },
  };

  // A tag collapses repeated notifications of the same kind into one entry;
  // without it every message stays visible on its own.
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Turner Tuesdays", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url ?? "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ("navigate" in client && client.url !== target.href) {
          await client.navigate(target.href);
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * Push services rotate endpoints occasionally. Re-subscribe with the same
 * application server key and hand the new endpoint to the backend, otherwise
 * the device silently stops receiving notifications.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey =
        event.oldSubscription?.options?.applicationServerKey ??
        (await fetchApplicationServerKey());

      if (!applicationServerKey) return;

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(subscription.toJSON()),
      });
    })(),
  );
});

function readPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch {
    return { title: "Turner Tuesdays", body: event.data.text() };
  }
}

async function fetchApplicationServerKey() {
  try {
    const response = await fetch("/api/push/public-key", { credentials: "same-origin" });
    const data = await response.json();
    return data.publicKey ? urlBase64ToUint8Array(data.publicKey) : null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}
