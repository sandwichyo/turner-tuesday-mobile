<?php

declare(strict_types=1);

namespace App\Service\RankedDay;

/**
 * One evaluation of the ranked day schedule at a given moment.
 *
 * `startsAt`/`endsAt` always describe the *relevant* window: the running one
 * while it is active, the upcoming one otherwise.
 */
final readonly class RankedDayStatus
{
    public function __construct(
        public bool $active,
        public \DateTimeImmutable $startsAt,
        public \DateTimeImmutable $endsAt,
        private \DateTimeImmutable $now,
    ) {
    }

    /**
     * Seconds until the running window ends, or until the next one starts.
     */
    public function secondsRemaining(): int
    {
        $target = $this->active ? $this->endsAt : $this->startsAt;

        return max(0, $target->getTimestamp() - $this->now->getTimestamp());
    }

    /**
     * Stable identifier of the window, used to notify about it only once.
     */
    public function windowId(): string
    {
        return $this->startsAt->format(\DateTimeInterface::ATOM);
    }
}
