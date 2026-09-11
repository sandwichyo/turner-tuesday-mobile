import { computed, onMounted, readonly, ref } from "vue";

/**
 * Opt-in/opt-out for Web Push. State lives at module level so every mounted
 * bell shows the same thing, and the browser subscription is always mirrored
 * to the backend (`/api/push/*`) which is what actually sends notifications.
 */
type SubscribePayload = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  contentEncoding: string;
};

/** `navigator.serviceWorker.ready` never settles without a registration. */
const REGISTRATION_TIMEOUT_MS = 5000;

const supported = ref(false);
const permission = ref<NotificationPermission>("default");
const subscribed = ref(false);
/** Endpoint of this device's subscription — the address of a test push. */
const endpoint = ref<string | null>(null);
const busy = ref(true);
const error = ref<string | null>(null);

let initialised = false;

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), REGISTRATION_TIMEOUT_MS)),
  ]);
}

async function initialise(): Promise<void> {
  supported.value =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  if (!supported.value) {
    busy.value = false;
    return;
  }

  permission.value = Notification.permission;

  try {
    const registration = await readyRegistration();
    if (!registration) {
      // No service worker (e.g. the bare Vite dev server) — nothing to offer.
      supported.value = false;
      return;
    }

    const existing = await registration.pushManager.getSubscription();
    subscribed.value = existing !== null;
    endpoint.value = existing?.endpoint ?? null;
  } catch {
    supported.value = false;
  } finally {
    busy.value = false;
  }
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

/** Detects a subscription left over from an earlier (rotated) VAPID key. */
function usesKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;

  const bytes = new Uint8Array(current);

  return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
}

function preferredEncoding(): string {
  const encodings = (PushManager as unknown as { supportedContentEncodings?: string[] })
    .supportedContentEncodings;

  return !encodings || encodings.includes("aes128gcm") ? "aes128gcm" : encodings[0];
}

async function fetchApplicationServerKey(): Promise<Uint8Array> {
  const response = await fetch("/api/push/public-key", { credentials: "same-origin" });
  const data = (await response.json()) as { configured: boolean; publicKey: string | null };

  if (!data.configured || !data.publicKey) {
    throw new Error("Push-Benachrichtigungen sind auf dem Server noch nicht eingerichtet.");
  }

  return urlBase64ToUint8Array(data.publicKey);
}

async function subscribe(): Promise<void> {
  permission.value = await Notification.requestPermission();

  if (permission.value !== "granted") {
    throw new Error(
      "denied" === permission.value
        ? "Benachrichtigungen sind für diese Seite blockiert. Bitte in den Browser-Einstellungen erlauben."
        : "Ohne Erlaubnis können keine Benachrichtigungen zugestellt werden.",
    );
  }

  const applicationServerKey = await fetchApplicationServerKey();
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !usesKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  });

  const payload: SubscribePayload = {
    ...(subscription.toJSON() as SubscribePayload),
    contentEncoding: preferredEncoding(),
  };

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // A subscription the backend does not know about would never receive
    // anything, so it is rolled back right away.
    await subscription.unsubscribe();
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Die Anmeldung konnte nicht gespeichert werden.");
  }

  subscribed.value = true;
  endpoint.value = subscription.endpoint;
}

async function unsubscribe(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);

    await subscription.unsubscribe();
  }

  subscribed.value = false;
  endpoint.value = null;
}

export function usePushSubscription() {
  onMounted(() => {
    if (initialised) return;
    initialised = true;
    void initialise();
  });

  const blocked = computed(() => permission.value === "denied");

  async function toggle(): Promise<void> {
    if (busy.value) return;

    busy.value = true;
    error.value = null;

    try {
      await (subscribed.value ? unsubscribe() : subscribe());
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Die Einstellung konnte nicht geändert werden.";
    } finally {
      busy.value = false;
    }
  }

  return {
    supported: readonly(supported),
    subscribed: readonly(subscribed),
    endpoint: readonly(endpoint),
    busy: readonly(busy),
    blocked,
    error,
    toggle,
  };
}
