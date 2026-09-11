<?php

declare(strict_types=1);

namespace App\Service\Ranking;

/**
 * Pure aggregation over the in-memory event "series" (built from the database
 * by EventDataProvider). Produces ranking groups and per-player histories.
 *
 * The half-year power ranking applies a non-attendance malus: per missed event
 * NON_ATTENDANCE_PENALTY is added to the average placement. The quarterly
 * landing-page ranking stays malus-free.
 */
final class RankingCalculator
{
    public const MIN_QUALIFYING_ENTRANTS = 6;
    public const MIN_RANKING_ATTENDANCES = 2; // quarterly / landing-page ranking
    public const MIN_POWER_RANKING_ATTENDANCES = 3; // half-year power ranking
    public const NON_ATTENDANCE_PENALTY = 0.05; // added to the average placement per missed event (power ranking only)

    /**
     * @param list<array<string, mixed>> $series
     *
     * @return array{
     *     label: string,
     *     minimumEntrants: ?int,
     *     minimumAttendances: int,
     *     nonAttendancePenalty: float,
     *     eventsConsidered: int,
     *     rows: list<array<string, mixed>>,
     *     periods: list<array{key: string, label: string, eventsConsidered: int, rows: list<array<string, mixed>>}>
     * }
     */
    public function buildRankingGroup(
        string $label,
        array $series,
        ?int $minimumEntrants,
        bool $useQuarters = false,
    ): array {
        // The quarterly landing-page ranking keeps the original rules; the
        // half-year power ranking requires more attendances and applies a
        // non-attendance malus.
        $minAttendances = $useQuarters
            ? self::MIN_RANKING_ATTENDANCES
            : self::MIN_POWER_RANKING_ATTENDANCES;
        $applyMalus = !$useQuarters;

        return [
            'label' => $label,
            'minimumEntrants' => $minimumEntrants,
            'minimumAttendances' => $minAttendances,
            'nonAttendancePenalty' => $applyMalus ? self::NON_ATTENDANCE_PENALTY : 0.0,
            'eventsConsidered' => \count($series),
            'rows' => $this->buildAggregateRanking($series, $minAttendances, $applyMalus),
            'periods' => $useQuarters
                ? $this->buildQuarterPeriods($series, $minAttendances, $applyMalus)
                : $this->buildHalfYearPeriods($series, $minAttendances, $applyMalus),
        ];
    }

    /**
     * @param list<array<string, mixed>> $series
     *
     * @return list<array<string, mixed>>
     */
    public function filterSeriesByMinimumEntrants(array $series, int $minimumEntrants): array
    {
        return array_values(
            array_filter($series, static function (array $event) use ($minimumEntrants): bool {
                $numEntrants = $event['selectedEvent']['numEntrants']
                    ?? ($event['summary']['numEntrants'] ?? null);

                return \is_int($numEntrants) && $numEntrants >= $minimumEntrants;
            }),
        );
    }

    /**
     * Every player in the series, aggregated with the same rules as a ranking
     * table but without the attendance threshold and without the malus — a
     * roster rather than a ranking. Consumed by the public API.
     *
     * @param list<array<string, mixed>> $series
     *
     * @return list<array<string, mixed>>
     */
    public function buildPlayerIndex(array $series): array
    {
        return $this->buildAggregateRanking($series, 1, false);
    }

    /**
     * @param list<array<string, mixed>> $series
     *
     * @return list<array<string, mixed>>
     */
    private function buildAggregateRanking(array $series, int $minAttendances, bool $applyMalus): array
    {
        $totalEvents = \count($series);
        $players = [];
        $headToHead = [];
        $playerCharacterCounts = [];

        foreach ($series as $event) {
            foreach ($event['standings'] as $standing) {
                $playerId = (string) $standing['playerId'];
                // Ranking uses the tie-aware rank placement, falling back to
                // the absolute placement if not provided.
                $placement = (int) ($standing['rankPlacement'] ?? $standing['placement']);

                if (!isset($players[$playerId])) {
                    $players[$playerId] = [
                        'playerId' => $playerId,
                        'displayName' => (string) $standing['displayName'],
                        'attendances' => 0,
                        'placementSum' => 0,
                        'placements' => [],
                        'bestPlacement' => null,
                    ];
                }

                ++$players[$playerId]['attendances'];
                $players[$playerId]['placementSum'] += $placement;
                $players[$playerId]['placements'][] = $placement;
                $players[$playerId]['bestPlacement'] = null === $players[$playerId]['bestPlacement']
                    ? $placement
                    : min((int) $players[$playerId]['bestPlacement'], $placement);
            }

            foreach ($event['sets'] as $set) {
                $winner = (string) ($set['winnerPlayerId'] ?? '');
                $loser = (string) ($set['loserPlayerId'] ?? '');

                if ('' === $winner || '' === $loser || $winner === $loser) {
                    continue;
                }

                $headToHead[$winner][$loser] = (int) ($headToHead[$winner][$loser] ?? 0) + 1;
            }

            foreach ($event['characterSelections'] ?? [] as $selection) {
                if (!\is_array($selection)) {
                    continue;
                }

                $selPlayerId = (string) ($selection['playerId'] ?? '');
                $characterId = (int) ($selection['characterId'] ?? 0);
                $characterName = trim((string) ($selection['characterName'] ?? ''));

                if ('' === $selPlayerId || $characterId <= 0 || '' === $characterName) {
                    continue;
                }

                if (!isset($playerCharacterCounts[$selPlayerId][$characterId])) {
                    $playerCharacterCounts[$selPlayerId][$characterId] = [
                        'characterId' => $characterId,
                        'characterName' => $characterName,
                        'count' => 0,
                    ];
                }

                ++$playerCharacterCounts[$selPlayerId][$characterId]['count'];
            }
        }

        $ranking = array_values(
            array_map(function (array $player) use ($playerCharacterCounts, $totalEvents, $applyMalus): array {
                $attendances = max(1, (int) $player['attendances']);
                $playerId = (string) $player['playerId'];

                $topCharacter = null;
                if (!empty($playerCharacterCounts[$playerId])) {
                    $chars = array_values($playerCharacterCounts[$playerId]);
                    usort($chars, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);
                    $totalSelections = (int) array_sum(array_column($chars, 'count'));
                    $top = $chars[0];
                    $topCharacter = [
                        'characterId' => $top['characterId'],
                        'characterName' => $top['characterName'],
                        'count' => $top['count'],
                        'percentage' => $totalSelections > 0
                            ? round(($top['count'] / $totalSelections) * 100, 1)
                            : 0.0,
                    ];
                }

                $baseAverage = ((int) $player['placementSum']) / $attendances;
                $missedEvents = max(0, $totalEvents - (int) $player['attendances']);
                $placementPenalty = $applyMalus
                    ? round($missedEvents * self::NON_ATTENDANCE_PENALTY, 2)
                    : 0.0;

                return [
                    'playerId' => $player['playerId'],
                    'displayName' => $player['displayName'],
                    'attendances' => (int) $player['attendances'],
                    'averagePlacement' => round($baseAverage + $placementPenalty, 2),
                    'placements' => $player['placements'],
                    'bestPlacement' => (int) ($player['bestPlacement'] ?? 0),
                    'topCharacter' => $topCharacter,
                ];
            }, $players),
        );

        $ranking = array_values(
            array_filter($ranking, static function (array $player) use ($minAttendances): bool {
                return (int) ($player['attendances'] ?? 0) >= $minAttendances;
            }),
        );

        usort($ranking, function (array $left, array $right) use ($headToHead): int {
            if ($left['averagePlacement'] !== $right['averagePlacement']) {
                return $left['averagePlacement'] <=> $right['averagePlacement'];
            }

            $leftWins = (int) ($headToHead[$left['playerId']][$right['playerId']] ?? 0);
            $rightWins = (int) ($headToHead[$right['playerId']][$left['playerId']] ?? 0);

            if ($leftWins !== $rightWins) {
                return $leftWins > $rightWins ? -1 : 1;
            }

            if ($left['attendances'] !== $right['attendances']) {
                return $right['attendances'] <=> $left['attendances'];
            }

            if ($left['bestPlacement'] !== $right['bestPlacement']) {
                return $left['bestPlacement'] <=> $right['bestPlacement'];
            }

            return strnatcasecmp($left['displayName'], $right['displayName']);
        });

        $result = [];
        foreach ($ranking as $index => $row) {
            $result[] = [
                'rank' => $index + 1,
                'playerId' => $row['playerId'],
                'displayName' => $row['displayName'],
                'attendances' => $row['attendances'],
                'averagePlacement' => $row['averagePlacement'],
                'topCharacter' => $row['topCharacter'],
            ];
        }

        return $result;
    }

    /**
     * @param list<array<string, mixed>> $series
     *
     * @return list<array{key: string, label: string, eventsConsidered: int, rows: list<array<string, mixed>>}>
     */
    private function buildHalfYearPeriods(array $series, int $minAttendances, bool $applyMalus): array
    {
        $halves = [];

        foreach ($series as $event) {
            $startAt = $event['selectedEvent']['startAt'] ?? ($event['summary']['startAt'] ?? null);

            if (!\is_int($startAt) || $startAt <= 0) {
                continue;
            }

            $date = (new \DateTimeImmutable('@'.$startAt))->setTimezone(new \DateTimeZone('UTC'));
            $month = (int) $date->format('n');
            $half = $month <= 6 ? 1 : 2;
            $year = (int) $date->format('Y');
            $key = sprintf('%d-H%d', $year, $half);

            if (!isset($halves[$key])) {
                $halves[$key] = [
                    'key' => $key,
                    'label' => sprintf('%d. Halbjahr %d', $half, $year),
                    'series' => [],
                    'sortYear' => $year,
                    'sortHalf' => $half,
                ];
            }

            $halves[$key]['series'][] = $event;
        }

        uasort($halves, static function (array $left, array $right): int {
            if ($left['sortYear'] !== $right['sortYear']) {
                return $right['sortYear'] <=> $left['sortYear'];
            }

            return $right['sortHalf'] <=> $left['sortHalf'];
        });

        return array_values(
            array_map(function (array $half) use ($minAttendances, $applyMalus): array {
                $halfSeries = array_values($half['series']);

                return [
                    'key' => $half['key'],
                    'label' => $half['label'],
                    'eventsConsidered' => \count($halfSeries),
                    'rows' => $this->buildAggregateRanking($halfSeries, $minAttendances, $applyMalus),
                ];
            }, $halves),
        );
    }

    /**
     * @param list<array<string, mixed>> $series
     *
     * @return list<array{key: string, label: string, eventsConsidered: int, rows: list<array<string, mixed>>}>
     */
    private function buildQuarterPeriods(array $series, int $minAttendances, bool $applyMalus): array
    {
        $quarters = [];

        foreach ($series as $event) {
            $startAt = $event['selectedEvent']['startAt'] ?? ($event['summary']['startAt'] ?? null);

            if (!\is_int($startAt) || $startAt <= 0) {
                continue;
            }

            $date = (new \DateTimeImmutable('@'.$startAt))->setTimezone(new \DateTimeZone('UTC'));
            $month = (int) $date->format('n');
            $quarter = (int) ceil($month / 3);
            $year = (int) $date->format('Y');
            $key = sprintf('%d-Q%d', $year, $quarter);

            if (!isset($quarters[$key])) {
                $quarters[$key] = [
                    'key' => $key,
                    'label' => sprintf('Q%d %d', $quarter, $year),
                    'series' => [],
                    'sortYear' => $year,
                    'sortQuarter' => $quarter,
                ];
            }

            $quarters[$key]['series'][] = $event;
        }

        uasort($quarters, static function (array $left, array $right): int {
            if ($left['sortYear'] !== $right['sortYear']) {
                return $right['sortYear'] <=> $left['sortYear'];
            }

            return $right['sortQuarter'] <=> $left['sortQuarter'];
        });

        return array_values(
            array_map(function (array $quarter) use ($minAttendances, $applyMalus): array {
                $quarterSeries = array_values($quarter['series']);

                return [
                    'key' => $quarter['key'],
                    'label' => $quarter['label'],
                    'eventsConsidered' => \count($quarterSeries),
                    'rows' => $this->buildAggregateRanking($quarterSeries, $minAttendances, $applyMalus),
                ];
            }, $quarters),
        );
    }

    /**
     * @param list<array<string, mixed>> $series
     *
     * @return array<string, mixed>|null
     */
    public function buildPlayerHistory(array $series, string $playerId): ?array
    {
        $placements = [];
        $displayName = null;
        $placementSum = 0;
        $bestPlacement = null;
        $playerNames = [];
        $opponents = [];
        $totalWins = 0;
        $totalLosses = 0;
        $characterCounts = [];
        $totalCharacterSelections = 0;

        foreach ($series as $event) {
            $playerRecordedForEvent = false;

            foreach ($event['standings'] as $standing) {
                $standingPlayerId = (string) ($standing['playerId'] ?? '');
                $standingDisplayName = (string) ($standing['displayName'] ?? 'Unknown player');

                if ('' !== $standingPlayerId) {
                    $playerNames[$standingPlayerId] = $standingDisplayName;
                }

                if ($playerRecordedForEvent || $playerId !== (string) ($standing['playerId'] ?? '')) {
                    continue;
                }

                $displayName ??= $standingDisplayName;
                $absPlacement = (int) ($standing['placement'] ?? 0);

                if ($absPlacement <= 0) {
                    continue;
                }

                // Displayed history keeps the actual (absolute) placement; the
                // average uses the tie-aware rank so the summary matches the
                // ranking tables.
                $rankPlacement = (int) ($standing['rankPlacement'] ?? $absPlacement);

                $placements[] = [
                    'eventId' => (int) ($event['selectedEvent']['eventId'] ?? ($event['summary']['eventId'] ?? 0)),
                    'eventName' => (string) ($event['selectedEvent']['eventName'] ?? ($event['summary']['eventName'] ?? 'Event')),
                    'tournamentName' => (string) ($event['selectedEvent']['tournamentName'] ?? ($event['summary']['tournamentName'] ?? 'Tournament')),
                    'label' => (string) ($event['summary']['label'] ?? ($event['selectedEvent']['eventName'] ?? 'Event')),
                    'startAt' => \is_int($event['selectedEvent']['startAt'] ?? null)
                        ? $event['selectedEvent']['startAt']
                        : (\is_int($event['summary']['startAt'] ?? null) ? $event['summary']['startAt'] : null),
                    'numEntrants' => \is_int($event['selectedEvent']['numEntrants'] ?? null)
                        ? $event['selectedEvent']['numEntrants']
                        : (\is_int($event['summary']['numEntrants'] ?? null) ? $event['summary']['numEntrants'] : null),
                    'placement' => $absPlacement,
                ];

                $placementSum += $rankPlacement;
                $bestPlacement = null === $bestPlacement ? $rankPlacement : min($bestPlacement, $rankPlacement);
                $playerRecordedForEvent = true;
            }

            foreach ($event['sets'] as $set) {
                $winnerPlayerId = (string) ($set['winnerPlayerId'] ?? '');
                $loserPlayerId = (string) ($set['loserPlayerId'] ?? '');

                if ('' === $winnerPlayerId || '' === $loserPlayerId || $winnerPlayerId === $loserPlayerId) {
                    continue;
                }

                if ($winnerPlayerId === $playerId) {
                    if (!isset($opponents[$loserPlayerId])) {
                        $opponents[$loserPlayerId] = [
                            'playerId' => $loserPlayerId,
                            'displayName' => $playerNames[$loserPlayerId] ?? 'Unknown player',
                            'wins' => 0,
                            'losses' => 0,
                        ];
                    }

                    ++$opponents[$loserPlayerId]['wins'];
                    ++$totalWins;
                }

                if ($loserPlayerId === $playerId) {
                    if (!isset($opponents[$winnerPlayerId])) {
                        $opponents[$winnerPlayerId] = [
                            'playerId' => $winnerPlayerId,
                            'displayName' => $playerNames[$winnerPlayerId] ?? 'Unknown player',
                            'wins' => 0,
                            'losses' => 0,
                        ];
                    }

                    ++$opponents[$winnerPlayerId]['losses'];
                    ++$totalLosses;
                }
            }

            foreach ($event['characterSelections'] as $selection) {
                if (!\is_array($selection) || $playerId !== (string) ($selection['playerId'] ?? '')) {
                    continue;
                }

                $characterId = (int) ($selection['characterId'] ?? 0);
                $characterName = trim((string) ($selection['characterName'] ?? ''));

                if ($characterId <= 0 || '' === $characterName) {
                    continue;
                }

                if (!isset($characterCounts[$characterId])) {
                    $characterCounts[$characterId] = [
                        'characterId' => $characterId,
                        'characterName' => $characterName,
                        'count' => 0,
                    ];
                }

                ++$characterCounts[$characterId]['count'];
                ++$totalCharacterSelections;
            }
        }

        if ([] === $placements) {
            return null;
        }

        usort($placements, static function (array $left, array $right): int {
            $leftStartAt = (int) ($left['startAt'] ?? 0);
            $rightStartAt = (int) ($right['startAt'] ?? 0);

            if ($leftStartAt !== $rightStartAt) {
                return $leftStartAt <=> $rightStartAt;
            }

            return ($left['eventId'] ?? 0) <=> ($right['eventId'] ?? 0);
        });

        $attendances = \count($placements);
        $headToHead = array_values(
            array_map(static function (array $opponent): array {
                $wins = (int) ($opponent['wins'] ?? 0);
                $losses = (int) ($opponent['losses'] ?? 0);
                $totalSets = $wins + $losses;

                return [
                    'playerId' => (string) ($opponent['playerId'] ?? ''),
                    'displayName' => (string) ($opponent['displayName'] ?? 'Unknown player'),
                    'wins' => $wins,
                    'losses' => $losses,
                    'totalSets' => $totalSets,
                    'winRate' => $totalSets > 0 ? round(($wins / $totalSets) * 100, 1) : 0.0,
                ];
            }, $opponents),
        );

        usort($headToHead, static function (array $left, array $right): int {
            if ($left['totalSets'] !== $right['totalSets']) {
                return $right['totalSets'] <=> $left['totalSets'];
            }

            if ($left['wins'] !== $right['wins']) {
                return $right['wins'] <=> $left['wins'];
            }

            if ($left['losses'] !== $right['losses']) {
                return $left['losses'] <=> $right['losses'];
            }

            return strnatcasecmp((string) $left['displayName'], (string) $right['displayName']);
        });

        $topCharacters = array_values(
            array_map(static function (array $character) use ($totalCharacterSelections): array {
                $count = (int) ($character['count'] ?? 0);

                return [
                    'characterId' => (int) ($character['characterId'] ?? 0),
                    'characterName' => (string) ($character['characterName'] ?? 'Unknown character'),
                    'count' => $count,
                    'percentage' => $totalCharacterSelections > 0
                        ? round(($count / $totalCharacterSelections) * 100, 1)
                        : 0.0,
                ];
            }, $characterCounts),
        );

        usort($topCharacters, static function (array $left, array $right): int {
            if ($left['count'] !== $right['count']) {
                return $right['count'] <=> $left['count'];
            }

            return strnatcasecmp((string) $left['characterName'], (string) $right['characterName']);
        });

        return [
            'player' => [
                'playerId' => $playerId,
                'displayName' => $displayName ?? 'Unknown player',
                'attendances' => $attendances,
                'averagePlacement' => round($placementSum / max(1, $attendances), 2),
                'bestPlacement' => (int) ($bestPlacement ?? 0),
            ],
            'placements' => $placements,
            'h2h' => [
                'summary' => ['wins' => $totalWins, 'losses' => $totalLosses],
                'opponents' => $headToHead,
            ],
            'characters' => [
                'totalSelections' => $totalCharacterSelections,
                'top' => $topCharacters,
            ],
        ];
    }
}
