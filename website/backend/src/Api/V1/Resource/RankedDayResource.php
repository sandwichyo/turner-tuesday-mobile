<?php

declare(strict_types=1);

namespace App\Api\V1\Resource;

use App\Api\Support\Iso8601;
use App\Service\RankedDay\RankedDayCalculator;
use App\Service\RankedDay\RankedDayStatus;

/**
 * v1 wire format for Slippi's Free Ranked Day window.
 *
 * The schedule constants travel with the payload so a client can keep counting
 * down offline instead of polling.
 */
final class RankedDayResource
{
    /**
     * @return array<string, mixed>
     */
    public static function status(RankedDayStatus $status): array
    {
        return [
            'active' => $status->active,
            'windowId' => $status->windowId(),
            'startsAt' => Iso8601::fromDateTime($status->startsAt),
            'endsAt' => Iso8601::fromDateTime($status->endsAt),
            'secondsRemaining' => $status->secondsRemaining(),
            'schedule' => [
                'anchor' => Iso8601::fromDateTime(
                    new \DateTimeImmutable(RankedDayCalculator::ANCHOR, new \DateTimeZone('UTC')),
                ),
                'cycleDays' => RankedDayCalculator::CYCLE_DAYS,
                'durationHours' => RankedDayCalculator::DURATION_HOURS,
            ],
        ];
    }
}
