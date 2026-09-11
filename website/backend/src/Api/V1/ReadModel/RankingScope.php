<?php

declare(strict_types=1);

namespace App\Api\V1\ReadModel;

use App\Service\Ranking\RankingCalculator;

/**
 * Which events a ranking table is built from.
 */
enum RankingScope: string
{
    /** Only events that reached the qualifying entrant count. */
    case Qualified = 'qualified';

    /** Every imported event, regardless of size. */
    case All = 'all';

    /** Entrant threshold an event must reach, or null when there is none. */
    public function minimumEntrants(): ?int
    {
        return match ($this) {
            self::Qualified => RankingCalculator::MIN_QUALIFYING_ENTRANTS,
            self::All => null,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Qualified => '6+ Teilnehmer',
            self::All => 'Alle Events',
        };
    }
}
