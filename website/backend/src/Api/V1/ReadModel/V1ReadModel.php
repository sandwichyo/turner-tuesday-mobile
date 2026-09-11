<?php

declare(strict_types=1);

namespace App\Api\V1\ReadModel;

use App\Service\RankedDay\RankedDayCalculator;
use App\Service\RankedDay\RankedDayStatus;
use App\Service\Ranking\EventDataProvider;
use App\Service\Ranking\RankingCalculator;

/**
 * The contract freeze point for API v1.
 *
 * This is the *only* class in `src/Api/V1` that touches a domain service, and
 * therefore the only place where a change to how the data is gathered or how a
 * ranking is computed can reach v1 clients.
 *
 * When the domain changes in a way that would alter what v1 promises:
 *   - keep `src/Api/V2` (the new version) on the new services, and
 *   - pin this class to the old behaviour — either by inlining the previous
 *     calculation here or by keeping a frozen copy of the service under
 *     `App\Service\Ranking\Frozen\` and injecting that instead.
 * Purely additive domain changes (a new field, more imported events) may keep
 * flowing through unchanged.
 */
final class V1ReadModel
{
    public function __construct(
        private readonly EventDataProvider $eventDataProvider,
        private readonly RankingCalculator $rankingCalculator,
        private readonly RankedDayCalculator $rankedDayCalculator,
    ) {
    }

    /**
     * Every imported event, newest first.
     *
     * @return list<array<string, mixed>>
     */
    public function series(): array
    {
        return array_values($this->eventDataProvider->getSeries());
    }

    /**
     * @return array<string, mixed>|null
     */
    public function event(int $startggEventId): ?array
    {
        return $this->eventDataProvider->getSeries()[$startggEventId] ?? null;
    }

    /**
     * One ranking table: the overall aggregate plus the per-period breakdown.
     *
     * @return array<string, mixed>
     */
    public function ranking(RankingType $type, RankingScope $scope): array
    {
        $series = $this->series();
        $minimumEntrants = $scope->minimumEntrants();

        if (null !== $minimumEntrants) {
            $series = $this->rankingCalculator->filterSeriesByMinimumEntrants($series, $minimumEntrants);
        }

        return $this->rankingCalculator->buildRankingGroup(
            $scope->label(),
            $series,
            $minimumEntrants,
            RankingType::Quarterly === $type,
        );
    }

    /**
     * Every player that ever appeared in a standing, with their overall figures
     * — no attendance threshold and no malus, so this is a roster rather than a
     * ranking table.
     *
     * @return list<array<string, mixed>>
     */
    public function playerIndex(): array
    {
        return $this->rankingCalculator->buildPlayerIndex($this->series());
    }

    /**
     * @return array<string, mixed>|null
     */
    public function player(string $playerId): ?array
    {
        return $this->rankingCalculator->buildPlayerHistory($this->series(), $playerId);
    }

    public function rankedDay(): RankedDayStatus
    {
        return $this->rankedDayCalculator->getStatus();
    }
}
