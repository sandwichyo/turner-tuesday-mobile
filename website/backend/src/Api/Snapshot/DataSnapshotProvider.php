<?php

declare(strict_types=1);

namespace App\Api\Snapshot;

use App\Entity\ImportRun;
use App\Repository\EventRepository;
use App\Repository\ImportRunRepository;
use App\Repository\PlayerRepository;

/**
 * Builds the DataSnapshot from a handful of cheap aggregate queries and keeps
 * it for the rest of the request — every API response consults it.
 */
final class DataSnapshotProvider
{
    private ?DataSnapshot $snapshot = null;

    public function __construct(
        private readonly EventRepository $events,
        private readonly PlayerRepository $players,
        private readonly ImportRunRepository $runs,
        private readonly string $inertiaVersion,
    ) {
    }

    public function get(): DataSnapshot
    {
        return $this->snapshot ??= $this->build();
    }

    private function build(): DataSnapshot
    {
        $latestRun = $this->runs->findLatest();
        $completedAt = null !== $latestRun && ImportRun::STATUS_COMPLETED === $latestRun->getStatus()
            ? $latestRun->getFinishedAt()
            : null;

        $updatedAt = self::newer($this->events->findLatestImportedAt(), $completedAt);
        $eventCount = $this->events->count([]);
        $playerCount = $this->players->count([]);

        $version = substr(hash('sha256', implode('|', [
            $this->inertiaVersion,
            (string) ($updatedAt?->getTimestamp() ?? 0),
            (string) $eventCount,
            (string) $playerCount,
        ])), 0, 16);

        return new DataSnapshot($updatedAt, $version, $eventCount, $playerCount, $latestRun);
    }

    private static function newer(?\DateTimeImmutable $left, ?\DateTimeImmutable $right): ?\DateTimeImmutable
    {
        if (null === $left || null === $right) {
            return $left ?? $right;
        }

        return $left >= $right ? $left : $right;
    }
}
