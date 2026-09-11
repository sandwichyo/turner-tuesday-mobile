<?php

declare(strict_types=1);

namespace App\Service\RankedDay;

/**
 * Slippi's "Free Ranked Day": every four days ranked play is open to everyone
 * for 24 hours. The schedule is a fixed cadence anchored to a known window, so
 * it is computed locally — there is no Slippi API to ask.
 *
 * The frontend indicator repeats these three constants in
 * `frontend/src/composables/useRankedDay.ts`; keep both sides in sync.
 */
final class RankedDayCalculator
{
    /** Start of a known ranked day window, in UTC. */
    public const ANCHOR = '2024-04-15 08:00:00';

    /** Days from one window start to the next. */
    public const CYCLE_DAYS = 4;

    /** Length of a single window. */
    public const DURATION_HOURS = 24;

    public function getStatus(?\DateTimeImmutable $now = null): RankedDayStatus
    {
        $utc = new \DateTimeZone('UTC');
        $now = ($now ?? new \DateTimeImmutable('now', $utc))->setTimezone($utc);

        $anchor = (new \DateTimeImmutable(self::ANCHOR, $utc))->getTimestamp();
        $cycle = self::CYCLE_DAYS * 86400;
        $duration = self::DURATION_HOURS * 3600;

        // Index of the most recently started window. intdiv() truncates towards
        // zero, so moments before the anchor need one extra step down.
        $elapsed = $now->getTimestamp() - $anchor;
        $index = intdiv($elapsed, $cycle);
        if ($elapsed < 0 && 0 !== $elapsed % $cycle) {
            --$index;
        }

        $start = $anchor + $index * $cycle;
        $active = $now->getTimestamp() < $start + $duration;

        if (!$active) {
            $start += $cycle;
        }

        // A '@timestamp' is always parsed as UTC but carries the offset "+00:00"
        // as its zone; setTimezone() puts the named zone back on it.
        return new RankedDayStatus(
            $active,
            (new \DateTimeImmutable('@'.$start))->setTimezone($utc),
            (new \DateTimeImmutable('@'.($start + $duration)))->setTimezone($utc),
            $now,
        );
    }
}
