<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { Head, Link, router } from "@inertiajs/vue3";
import { usePushSubscription } from "../composables/usePushSubscription";

type StartGgStatus = {
  configured: boolean;
  authenticated: boolean;
  expiresAt: number | null;
  scopes: string[];
  connectUrl: string | null;
};

type ImportLogLine = {
  at: number;
  level: "info" | "success" | "warning" | "error" | string;
  message: string;
};

type ImportMode = "full" | "incremental";

type PushStatus = {
  configured: boolean;
  subscriptions: number;
};

type PushSendResult = {
  sent: number;
  failed: number;
  removed: number;
  errors: string[];
  subscriptions: number;
};

type ImportRunStatus = {
  id: number;
  status: "queued" | "running" | "completed" | "failed" | string;
  mode: ImportMode | string;
  active: boolean;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  totalTournaments: number;
  totalEvents: number;
  processedEvents: number;
  percent: number;
  currentLabel: string | null;
  error: string | null;
  logs: ImportLogLine[];
};

const props = defineProps<{
  status: StartGgStatus;
  importStatus: ImportRunStatus | null;
  push: PushStatus;
}>();

// ─── start.gg OAuth ──────────────────────────────────────────────────────
const feedbackMessage = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const disconnecting = ref(false);

const isAuthenticated = computed(() => props.status.authenticated);
const isConfigured = computed(() => props.status.configured);
const connectUrl = computed(
  () => props.status.connectUrl ?? "/api/startgg/oauth/connect",
);
const expiresAtLabel = computed(() => {
  if (!props.status.expiresAt) return "Nicht verbunden";
  return new Date(props.status.expiresAt * 1000).toLocaleString();
});

function consumeCallbackState(): void {
  const url = new URL(window.location.href);
  const state = url.searchParams.get("startgg");
  const message = url.searchParams.get("message");

  if (state === "connected") {
    feedbackMessage.value = "start.gg-Freigabe erfolgreich abgeschlossen.";
  }
  if (state === "error") {
    errorMessage.value = message ?? "start.gg-Freigabe fehlgeschlagen.";
  }
  if (state || message) {
    router.replace("/admin");
  }
}

async function disconnect(): Promise<void> {
  disconnecting.value = true;
  errorMessage.value = null;
  feedbackMessage.value = null;
  try {
    const response = await fetch("/api/startgg/disconnect", { method: "POST" });
    let payload: { success?: boolean; error?: string };
    try {
      payload = (await response.json()) as { success?: boolean; error?: string };
    } catch {
      throw new Error(
        `Der Server hat eine ungültige Antwort zurückgegeben (HTTP ${response.status}).`,
      );
    }
    if (!response.ok) {
      throw new Error(payload.error ?? "Verbindung konnte nicht getrennt werden.");
    }
    feedbackMessage.value = "Gespeicherte start.gg-Freigabe wurde entfernt.";
    router.reload();
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Verbindung konnte nicht getrennt werden.";
  } finally {
    disconnecting.value = false;
  }
}

// ─── Import ──────────────────────────────────────────────────────────────
const run = ref<ImportRunStatus | null>(props.importStatus);
const pendingMode = ref<ImportMode | null>(null);
const importError = ref<string | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const isRunning = computed(() => run.value?.active === true);
const isRunningIncremental = computed(
  () => isRunning.value && run.value?.mode === "incremental",
);
const isRunningFull = computed(
  () => isRunning.value && run.value?.mode !== "incremental",
);
const modeLabel = computed(() =>
  run.value?.mode === "incremental" ? "Nur neue Events" : "Vollständiger Import",
);

const statusLabel = computed(() => {
  switch (run.value?.status) {
    case "queued":
      return "In Warteschlange";
    case "running":
      return "Läuft";
    case "completed":
      return "Abgeschlossen";
    case "failed":
      return "Fehlgeschlagen";
    default:
      return "—";
  }
});

const statusBadgeClass = computed(() => {
  switch (run.value?.status) {
    case "completed":
      return "badge-success";
    case "failed":
      return "badge-error";
    case "running":
    case "queued":
      return "badge-info";
    default:
      return "badge-ghost";
  }
});

function logClass(level: string): string {
  switch (level) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "error":
      return "text-error";
    default:
      return "text-base-content/70";
  }
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function pollStatus(): Promise<void> {
  const runId = run.value?.id;
  const url = runId ? `/api/import/status?runId=${runId}` : "/api/import/status";
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    const data = (await response.json()) as { run: ImportRunStatus | null };
    if (data.run) {
      run.value = data.run;
    }
  } catch {
    // transient — keep polling
  }

  if (run.value?.active) {
    pollTimer = setTimeout(pollStatus, 2000);
  } else {
    stopPolling();
    // Reflect freshly imported data on the rest of the app.
    if (run.value?.status === "completed") {
      fetch("/api/startgg/cache/flush", { method: "POST" }).catch(() => {});
    }
  }
}

async function startImport(mode: ImportMode = "full"): Promise<void> {
  if (pendingMode.value !== null || isRunning.value) return;
  pendingMode.value = mode;
  importError.value = null;
  try {
    const response = await fetch("/api/import/start", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const payload = (await response.json()) as {
      runId?: number;
      alreadyRunning?: boolean;
      mode?: ImportMode | string;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Import konnte nicht gestartet werden.");
    }
    // Prime the local run so polling has an id to follow, then poll.
    if (payload.runId && (!run.value || run.value.id !== payload.runId)) {
      run.value = {
        id: payload.runId,
        status: "queued",
        mode: payload.mode ?? mode,
        active: true,
        createdAt: Math.floor(Date.now() / 1000),
        startedAt: null,
        finishedAt: null,
        totalTournaments: 0,
        totalEvents: 0,
        processedEvents: 0,
        percent: 0,
        currentLabel: null,
        error: null,
        logs: [],
      };
    }
    stopPolling();
    void pollStatus();
  } catch (err) {
    importError.value =
      err instanceof Error ? err.message : "Import konnte nicht gestartet werden.";
  } finally {
    pendingMode.value = null;
  }
}

// ─── Push-Benachrichtigungen ─────────────────────────────────────────────
const pushTitle = ref("");
const pushBody = ref("");
const pushUrl = ref("/");
const pushTag = ref("");
const sendingPush = ref(false);
const pushError = ref<string | null>(null);
const pushResult = ref<PushSendResult | null>(null);
const subscriberCount = ref(props.push.subscriptions);

const canSendPush = computed(
  () =>
    props.push.configured &&
    subscriberCount.value > 0 &&
    pushTitle.value.trim().length > 0 &&
    !sendingPush.value,
);

async function sendPush(): Promise<void> {
  if (!canSendPush.value) return;

  sendingPush.value = true;
  pushError.value = null;
  pushResult.value = null;

  try {
    const response = await fetch("/api/push/send", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: pushTitle.value.trim(),
        body: pushBody.value.trim(),
        url: pushUrl.value.trim() || "/",
        tag: pushTag.value.trim() || null,
      }),
    });

    const payload = (await response.json()) as Partial<PushSendResult> & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Die Nachricht konnte nicht versendet werden.");
    }

    pushResult.value = payload as PushSendResult;
    subscriberCount.value = payload.subscriptions ?? subscriberCount.value;
    pushTitle.value = "";
    pushBody.value = "";
  } catch (err) {
    pushError.value =
      err instanceof Error ? err.message : "Die Nachricht konnte nicht versendet werden.";
  } finally {
    sendingPush.value = false;
  }
}

// The test push goes to this browser's own subscription only, so it needs the
// same state the navbar bell keeps (shared at module level).
const {
  endpoint: deviceEndpoint,
  busy: deviceBusy,
  supported: deviceSupported,
} = usePushSubscription();

const sendingTest = ref(false);
const testError = ref<string | null>(null);
const testMessage = ref<string | null>(null);

const canSendTest = computed(
  () =>
    props.push.configured &&
    !deviceBusy.value &&
    deviceEndpoint.value !== null &&
    !sendingTest.value,
);

async function sendTest(): Promise<void> {
  if (!canSendTest.value) return;

  sendingTest.value = true;
  testError.value = null;
  testMessage.value = null;

  try {
    const response = await fetch("/api/push/test", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: deviceEndpoint.value,
        // A filled form is previewed as-is; an empty one gets a stock message.
        title: pushTitle.value.trim(),
        body: pushBody.value.trim(),
        url: pushUrl.value.trim() || "/",
        tag: pushTag.value.trim() || null,
      }),
    });

    const payload = (await response.json()) as Partial<PushSendResult> & {
      preview?: boolean;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Die Testnachricht konnte nicht versendet werden.");
    }

    subscriberCount.value = payload.subscriptions ?? subscriberCount.value;

    if ((payload.sent ?? 0) > 0) {
      testMessage.value = payload.preview
        ? "Testnachricht mit dem Formularinhalt an dieses Gerät gesendet."
        : "Testnachricht an dieses Gerät gesendet.";
    } else if ((payload.removed ?? 0) > 0) {
      throw new Error(
        "Die Anmeldung dieses Geräts war abgelaufen und wurde entfernt. Bitte die Glocke oben erneut aktivieren.",
      );
    } else {
      throw new Error(payload.errors?.[0] ?? "Die Testnachricht wurde nicht zugestellt.");
    }
  } catch (err) {
    testError.value =
      err instanceof Error ? err.message : "Die Testnachricht konnte nicht versendet werden.";
  } finally {
    sendingTest.value = false;
  }
}

onMounted(() => {
  consumeCallbackState();
  if (run.value?.active) {
    void pollStatus();
  }
});

onBeforeUnmount(stopPolling);
</script>

<template>
  <Head title="Freigabe · Turner Tuesdays" />

  <main class="container mx-auto max-w-3xl space-y-6 p-6">
    <!-- start.gg connection -->
    <section class="card bg-base-100 shadow-xl">
      <div class="card-body gap-5">
        <div class="space-y-2">
          <p class="badge badge-secondary badge-outline">start.gg Freigabe</p>
          <h1 class="text-3xl font-bold">Backend-Zugriff freigeben</h1>
          <p class="text-base-content/70">
            Verbinde das Backend einmalig mit start.gg. Nach der Freigabe
            speichert der Server den Refresh-Token und kann Daten importieren,
            ohne erneut nachzufragen.
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-xl bg-base-200 p-4">
            <div class="text-xs uppercase text-base-content/50">Status</div>
            <div class="mt-1 font-medium">
              {{ isAuthenticated ? "Freigegeben" : "Nicht freigegeben" }}
            </div>
          </div>
          <div class="rounded-xl bg-base-200 p-4">
            <div class="text-xs uppercase text-base-content/50">Läuft ab</div>
            <div class="mt-1 font-medium">{{ expiresAtLabel }}</div>
          </div>
        </div>

        <div
          class="rounded-xl border border-base-300 p-4 text-sm text-base-content/70"
        >
          <p>
            Konfiguriert:
            <strong>{{ isConfigured ? "ja" : "nein" }}</strong>
          </p>
          <p>
            Scopes:
            <strong>{{ status.scopes?.join(", ") || "user.identity" }}</strong>
          </p>
        </div>

        <div v-if="feedbackMessage" class="alert alert-success shadow-sm">
          <span>{{ feedbackMessage }}</span>
        </div>

        <div v-if="errorMessage" class="alert alert-error shadow-sm">
          <span>{{ errorMessage }}</span>
        </div>

        <div class="card-actions justify-between">
          <Link class="btn btn-ghost" href="/">Zurück zur Startseite</Link>

          <div class="flex gap-2">
            <a
              v-if="!isAuthenticated"
              :href="connectUrl"
              class="btn btn-primary"
              :class="{ 'btn-disabled': !isConfigured }"
            >
              Verbinden und freigeben
            </a>
            <button
              v-else
              class="btn btn-outline"
              :disabled="disconnecting"
              @click="disconnect"
            >
              Verbindung trennen
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Import -->
    <section class="card bg-base-100 shadow-xl">
      <div class="card-body gap-5">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-2">
            <p class="badge badge-primary badge-outline">Daten-Import</p>
            <h2 class="text-2xl font-bold">Turniere importieren</h2>
            <p class="text-base-content/70">
              Lädt die gepflegten Turniere einzeln von start.gg und speichert
              die Ergebnisse deutscher Spieler in der Datenbank. Der Import läuft
              im Hintergrund – du kannst diese Seite verlassen.
            </p>
            <p class="text-sm text-base-content/60">
              <strong>Alles importieren</strong> aktualisiert jedes gefundene
              Event neu. <strong>Nur neue Events</strong> überspringt bereits
              importierte Events und lädt ausschließlich noch fehlende.
            </p>
          </div>
          <div class="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="pendingMode !== null || isRunning || !isAuthenticated"
              @click="startImport('full')"
            >
              <span
                v-if="pendingMode === 'full' || isRunningFull"
                class="loading loading-spinner loading-xs"
              />
              {{ isRunningFull ? "Import läuft…" : "Alles importieren" }}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-primary"
              :disabled="pendingMode !== null || isRunning || !isAuthenticated"
              @click="startImport('incremental')"
            >
              <span
                v-if="pendingMode === 'incremental' || isRunningIncremental"
                class="loading loading-spinner loading-xs"
              />
              {{ isRunningIncremental ? "Import läuft…" : "Nur neue Events" }}
            </button>
          </div>
        </div>

        <div v-if="!isAuthenticated" class="alert alert-warning shadow-sm">
          <span>Bitte zuerst start.gg oben verbinden.</span>
        </div>

        <div v-if="importError" class="alert alert-error shadow-sm">
          <span>{{ importError }}</span>
        </div>

        <template v-if="run">
          <div class="flex flex-wrap items-center gap-3">
            <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
            <span class="badge badge-ghost">{{ modeLabel }}</span>
            <span class="text-sm text-base-content/60">
              {{ run.processedEvents }} / {{ run.totalEvents }} Events
              <template v-if="run.totalTournaments > 0">
                · {{ run.totalTournaments }} Turniere
              </template>
            </span>
          </div>

          <div class="space-y-1">
            <progress
              class="progress progress-primary w-full"
              :value="run.percent"
              max="100"
            />
            <div class="flex justify-between text-xs text-base-content/50">
              <span>{{ run.currentLabel ?? "—" }}</span>
              <span>{{ run.percent }}%</span>
            </div>
          </div>

          <div v-if="run.error" class="alert alert-error shadow-sm">
            <span>{{ run.error }}</span>
          </div>

          <div>
            <div class="mb-2 text-xs uppercase text-base-content/50">
              Aktivitätslog
            </div>
            <div
              class="h-64 overflow-y-auto rounded-xl bg-base-200/60 p-3 font-mono text-xs leading-relaxed"
            >
              <div v-if="run.logs.length === 0" class="text-base-content/40">
                Noch keine Einträge.
              </div>
              <div
                v-for="(line, index) in run.logs"
                :key="index"
                class="whitespace-pre-wrap"
                :class="logClass(line.level)"
              >
                <span class="text-base-content/40">{{ formatTime(line.at) }}</span>
                {{ line.message }}
              </div>
            </div>
          </div>
        </template>

        <div
          v-else
          class="rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/60"
        >
          Noch kein Import durchgeführt.
        </div>
      </div>
    </section>
    <!-- Push notifications -->
    <section class="card bg-base-100 shadow-xl">
      <div class="card-body gap-5">
        <div class="space-y-2">
          <p class="badge badge-accent badge-outline">Push-Benachrichtigungen</p>
          <h2 class="text-2xl font-bold">Nachricht an alle senden</h2>
          <p class="text-base-content/70">
            Geht an jedes Gerät, das die App installiert und Benachrichtigungen
            erlaubt hat. Abgelaufene Anmeldungen werden beim Senden automatisch
            entfernt.
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-xl bg-base-200 p-4">
            <div class="text-xs uppercase text-base-content/50">Empfänger</div>
            <div class="mt-1 font-medium">{{ subscriberCount }}</div>
          </div>
          <div class="rounded-xl bg-base-200 p-4">
            <div class="text-xs uppercase text-base-content/50">VAPID-Schlüssel</div>
            <div class="mt-1 font-medium">
              {{ push.configured ? "Konfiguriert" : "Fehlt" }}
            </div>
          </div>
        </div>

        <div v-if="!push.configured" class="alert alert-warning shadow-sm">
          <span>
            Es sind keine VAPID-Schlüssel hinterlegt. Einmalig
            <code class="font-mono">php bin/console app:push:vapid-keys</code>
            ausführen und das Ergebnis als <code class="font-mono">VAPID_PUBLIC_KEY</code>
            und <code class="font-mono">VAPID_PRIVATE_KEY</code> in der Umgebung setzen.
          </span>
        </div>

        <div
          v-else-if="subscriberCount === 0"
          class="alert alert-info shadow-sm"
        >
          <span>
            Noch niemand hat Benachrichtigungen aktiviert – dazu auf der
            Startseite auf das Glocken-Symbol tippen.
          </span>
        </div>

        <div class="grid gap-3">
          <label class="form-control">
            <div class="label">
              <span class="label-text">Titel</span>
              <span class="label-text-alt text-base-content/50">
                {{ pushTitle.length }}/100
              </span>
            </div>
            <input
              v-model="pushTitle"
              type="text"
              maxlength="100"
              class="input input-bordered"
              placeholder="Heute ist Turner Tuesday!"
              :disabled="!push.configured"
            />
          </label>

          <label class="form-control">
            <div class="label">
              <span class="label-text">Text</span>
              <span class="label-text-alt text-base-content/50">
                {{ pushBody.length }}/400
              </span>
            </div>
            <textarea
              v-model="pushBody"
              rows="3"
              maxlength="400"
              class="textarea textarea-bordered"
              placeholder="Ab 19 Uhr geht es los – meldet euch auf start.gg an."
              :disabled="!push.configured"
            ></textarea>
          </label>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="form-control">
              <div class="label"><span class="label-text">Ziel beim Antippen</span></div>
              <input
                v-model="pushUrl"
                type="text"
                class="input input-bordered"
                placeholder="/"
                :disabled="!push.configured"
              />
              <div class="label">
                <span class="label-text-alt text-base-content/50">
                  Pfad innerhalb der App, z. B. /power-ranking
                </span>
              </div>
            </label>

            <label class="form-control">
              <div class="label"><span class="label-text">Kennzeichen (optional)</span></div>
              <input
                v-model="pushTag"
                type="text"
                maxlength="32"
                class="input input-bordered"
                placeholder="turner-tuesday"
                :disabled="!push.configured"
              />
              <div class="label">
                <span class="label-text-alt text-base-content/50">
                  Ersetzt eine ältere Nachricht mit demselben Kennzeichen.
                </span>
              </div>
            </label>
          </div>
        </div>

        <!-- Hidden while the "nobody subscribed yet" hint above already says it. -->
        <div
          v-if="
            push.configured && subscriberCount > 0 && !deviceBusy && deviceEndpoint === null
          "
          class="alert alert-info shadow-sm"
        >
          <span>
            <template v-if="deviceSupported">
              Für den Test muss auf diesem Gerät die Glocke oben in der
              Navigation aktiviert sein.
            </template>
            <template v-else>
              Dieser Browser unterstützt keine Push-Benachrichtigungen – ein Test
              ist hier nicht möglich.
            </template>
          </span>
        </div>

        <div v-if="testError" class="alert alert-error shadow-sm">
          <span>{{ testError }}</span>
        </div>

        <div v-if="testMessage" class="alert alert-success shadow-sm">
          <span>{{ testMessage }}</span>
        </div>

        <div v-if="pushError" class="alert alert-error shadow-sm">
          <span>{{ pushError }}</span>
        </div>

        <div v-if="pushResult" class="alert alert-success shadow-sm">
          <span>
            {{ pushResult.sent }} zugestellt<template v-if="pushResult.failed > 0">
              · {{ pushResult.failed }} fehlgeschlagen</template
            ><template v-if="pushResult.removed > 0">
              · {{ pushResult.removed }} abgelaufene Anmeldungen entfernt</template
            >.
          </span>
        </div>

        <ul
          v-if="pushResult && pushResult.errors.length > 0"
          class="list-disc space-y-1 rounded-xl bg-base-200/60 p-4 ps-8 text-xs text-base-content/70"
        >
          <li v-for="(reason, index) in pushResult.errors" :key="index">{{ reason }}</li>
        </ul>

        <div class="card-actions justify-end">
          <button
            type="button"
            class="btn btn-outline"
            :disabled="!canSendTest"
            :title="
              pushTitle.trim().length > 0
                ? 'Sendet den Formularinhalt nur an dieses Gerät'
                : 'Sendet eine Beispielnachricht nur an dieses Gerät'
            "
            @click="sendTest"
          >
            <span v-if="sendingTest" class="loading loading-spinner loading-xs" />
            Test an dieses Gerät
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canSendPush"
            @click="sendPush"
          >
            <span v-if="sendingPush" class="loading loading-spinner loading-xs" />
            Nachricht senden
          </button>
        </div>
      </div>
    </section>
  </main>
</template>
