import { onMounted, readonly, ref } from "vue";

/**
 * Chromium fires `beforeinstallprompt` shortly after load — usually before any
 * component has mounted — so the event is captured at module level and only
 * read by the components. Safari never fires it: there, installing means
 * "Zum Home-Bildschirm" from the share sheet, which `isIos` unlocks a hint for.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const canInstall = ref(false);
const isStandalone = ref(false);
const isIos = ref(false);

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keeping the event lets us open the install dialog from our own button
    // instead of relying on the browser's mini-infobar.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    canInstall.value = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    canInstall.value = false;
    isStandalone.value = true;
  });
}

/** True while the page runs as an installed app rather than a browser tab. */
export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari does not support the display-mode query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectDisplayMode(): void {
  isStandalone.value = isStandaloneDisplay();

  const ua = window.navigator.userAgent;
  isIos.value =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a desktop Mac.
    (ua.includes("Macintosh") && "ontouchend" in document);
}

export function usePwaInstall() {
  onMounted(detectDisplayMode);

  async function install(): Promise<boolean> {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    // The event can only be used once, whatever the user chose.
    deferredPrompt = null;
    canInstall.value = false;

    return outcome === "accepted";
  }

  return {
    canInstall: readonly(canInstall),
    isStandalone: readonly(isStandalone),
    isIos: readonly(isIos),
    install,
  };
}
