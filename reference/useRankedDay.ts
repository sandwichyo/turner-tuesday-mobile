import { computed, onBeforeUnmount, onMounted, readonly, ref } from "vue";

/**
 * Slippi's "Free Ranked Day": every four days ranked play is open to everyone
 * for 24 hours. The cadence is fixed and anchored to a known window, so the
 * indicator computes it locally instead of asking a server.
 *
 * These three constants mirror
 * `backend/src/Service/RankedDay/RankedDayCalculator.php` — keep both in sync.
 */
const ANCHOR_MS = Date.UTC(2024, 3, 15, 8, 0, 0); // 2024-04-15 08:00 UTC
const CYCLE_MS = 4 * 24 * 60 * 60 * 1000;
const DURATION_MS = 24 * 60 * 60 * 1000;

/** How often the countdown is refreshed while the tab is mounted. */
const TICK_MS = 1000;

export type RankedDayWindow = {
  /** Whether a window is running right now. */
  active: boolean;
  /** The running window, or the next one once the current has passed. */
  startsAt: Date;
  endsAt: Date;
  /** Until the running window ends, or until the next one starts. */
  remainingMs: number;
};

export function evaluateRankedDay(nowMs: number): RankedDayWindow {
  // Math.floor (not a truncating division) so moments before the anchor land in
  // the window that precedes it rather than the one after.
  const index = Math.floor((nowMs - ANCHOR_MS) / CYCLE_MS);

  let start = ANCHOR_MS + index * CYCLE_MS;
  const active = nowMs < start + DURATION_MS;

  if (!active) start += CYCLE_MS;

  const end = start + DURATION_MS;

  return {
    active,
    startsAt: new Date(start),
    endsAt: new Date(end),
    remainingMs: Math.max(0, (active ? end : start) - nowMs),
  };
}

/**
 * "5 Std. 12 Min." — the largest two units that still carry information. Days
 * only ever show up while waiting for the next window (the gap is up to three
 * days), and read as the dative the "in …" phrasing needs.
 */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tagen"} ${hours} Std.`;
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  if (minutes > 0) return `${minutes} Min. ${seconds} Sek.`;

  return `${seconds} Sek.`;
}

function formatMoment(date: Date): string {
  return date.toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useRankedDay() {
  // Rendered only after mounting: the server would bake in its own clock and
  // the countdown would not survive hydration.
  const mounted = ref(false);
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    mounted.value = true;
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, TICK_MS);
  });

  onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  });

  const current = computed(() => evaluateRankedDay(now.value));

  const remainingLabel = computed(() => formatRemaining(current.value.remainingMs));

  /** One sentence, used as the tooltip and inside the details popover. */
  const statusLabel = computed(() =>
    current.value.active
      ? `Ranked Day läuft noch ${remainingLabel.value}`
      : `Ranked Day startet in ${remainingLabel.value}`,
  );

  const windowLabel = computed(
    () => `${formatMoment(current.value.startsAt)} – ${formatMoment(current.value.endsAt)} Uhr`,
  );

  return {
    mounted: readonly(mounted),
    active: computed(() => current.value.active),
    remainingLabel,
    statusLabel,
    windowLabel,
  };
}
