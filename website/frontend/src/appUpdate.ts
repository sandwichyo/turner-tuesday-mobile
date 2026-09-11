import { isStandaloneDisplay } from "./composables/usePwaInstall";

/**
 * Keeps the installed app on the version the server actually serves.
 *
 * A standalone window can stay open for days without a single navigation, so
 * it would otherwise keep running the bundle it started with. CI passes the
 * deploy's commit sha as `INERTIA_VERSION`, which the server hands out at
 * `/api/version` and also embeds in the rendered document — if the two differ,
 * the app reloads itself and picks up the new build.
 *
 * Only the installed app does this: an automatic reload in an ordinary browser
 * tab would be an interruption rather than an app update.
 */
const VERSION_ENDPOINT = "/api/version";

/** Remembers the target of a reload, so a stale page can never loop. */
const RELOADED_KEY = "tt.version-reload";

/** The version this document was rendered with, from Inertia's page object. */
function renderedVersion(): string | null {
  const encoded = document.getElementById("app")?.dataset.page;
  if (!encoded) return null;

  try {
    const page = JSON.parse(encoded) as { version?: unknown };

    return "string" == typeof page.version && "" !== page.version ? page.version : null;
  } catch {
    return null;
  }
}

/** Reloading mid-input would throw away whatever is being typed. */
function isEditing(): boolean {
  const element = document.activeElement;

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

export function watchForNewVersion(): void {
  if (typeof window === "undefined" || !isStandaloneDisplay()) return;

  const rendered = renderedVersion();
  if (null === rendered) return;

  let reloading = false;

  async function check(): Promise<void> {
    if (reloading || isEditing()) return;

    let deployed: unknown;
    try {
      const response = await fetch(VERSION_ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;

      ({ version: deployed } = (await response.json()) as { version?: unknown });
    } catch {
      // Offline or the backend is down — try again on the next check.
      return;
    }

    if ("string" != typeof deployed || "" === deployed || deployed === rendered) return;

    // If a reload somehow lands on the old version again (a cached document,
    // a half-finished deploy), stop instead of reloading in circles.
    try {
      if (window.sessionStorage.getItem(RELOADED_KEY) === deployed) return;
      window.sessionStorage.setItem(RELOADED_KEY, deployed);
    } catch {
      // Storage unavailable — one reload without the loop guard is still right.
    }

    reloading = true;
    window.location.reload();
  }

  void check();

  // A standalone window is rarely reloaded by hand, so returning to the
  // foreground is what "opening the app" amounts to there.
  document.addEventListener("visibilitychange", () => {
    if ("visible" === document.visibilityState) void check();
  });
}
