<?php

declare(strict_types=1);

namespace App\Api\V1\ReadModel;

use App\Service\Ranking\RankingCalculator;

/**
 * The two ranking tables the site maintains, as v1 exposes them.
 *
 * The rule values are repeated here on purpose: they are part of the v1
 * contract. If the domain ever changes `RankingCalculator`'s constants, v1 keeps
 * describing what it actually returns and the change goes into a new version.
 */
enum RankingType: string
{
    /** Quarterly table shown on the landing page — no non-attendance malus. */
    case Quarterly = 'quarterly';

    /** Half-year power ranking — stricter attendance rule, malus applied. */
    case Power = 'power';

    public function label(): string
    {
        return match ($this) {
            self::Quarterly => 'Ranking',
            self::Power => 'Power Ranking',
        };
    }

    /** How the `periods` list is cut up. */
    public function periodType(): string
    {
        return match ($this) {
            self::Quarterly => 'quarter',
            self::Power => 'half-year',
        };
    }

    public function minimumAttendances(): int
    {
        return match ($this) {
            self::Quarterly => RankingCalculator::MIN_RANKING_ATTENDANCES,
            self::Power => RankingCalculator::MIN_POWER_RANKING_ATTENDANCES,
        };
    }

    /** Placement points added per missed event; 0.0 when no malus applies. */
    public function nonAttendancePenalty(): float
    {
        return match ($this) {
            self::Quarterly => 0.0,
            self::Power => RankingCalculator::NON_ATTENDANCE_PENALTY,
        };
    }
}
