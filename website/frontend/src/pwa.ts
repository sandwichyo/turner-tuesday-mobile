/**
 * Registers the service worker that makes the app installable and receives
 * push notifications. The worker itself lives at `backend/public/sw.js` so its
 * URL stays stable (a hashed bundle name would re-register on every deploy)
 * and its scope covers the whole site.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      // Not fatal: without a worker the site simply behaves like a normal page.
      console.warn("Service Worker konnte nicht registriert werden.", error);
    });
  });
}
