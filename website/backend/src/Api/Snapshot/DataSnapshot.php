<?php

declare(strict_types=1);

namespace App\Api\Snapshot;

use App\Entity\ImportRun;

/**
 * How current the stored start.gg data is, evaluated once per request.
 *
 * `version` is the fingerprint every API response is cached against: as long as
 * it is unchanged, a client's `If-None-Match` gets a 304 and the phone saves the
 * download. It folds in the deployed app version too, because a new deploy can
 * change the numbers without the underlying rows moving.
 */
final readonly class DataSnapshot
{
    public function __construct(
        public ?\DateTimeImmutable $updatedAt,
        public string $version,
        public int $eventCount,
        public int $playerCount,
        public ?ImportRun $lastImport,
    ) {
    }
}
