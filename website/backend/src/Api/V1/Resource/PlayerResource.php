<?php

declare(strict_types=1);

namespace App\Api\V1\Resource;

use App\Api\Support\Iso8601;

/**
 * v1 wire format for the player roster and a single player's history.
 */
final class PlayerResource
{
    /**
     * One roster entry. `averagePlacement` is the overall, malus-free average
     * across every imported event — the ranking tables apply their own rules.
     *
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function summary(array $row): array
    {
        return [
            'playerId' => (string) ($row['playerId'] ?? ''),
            'displayName' => (string) ($row['displayName'] ?? ''),
            'attendances' => (int) ($row['attendances'] ?? 0),
            'averagePlacement' => (float) ($row['averagePlacement'] ?? 0),
            'topCharacter' => self::character($row['topCharacter'] ?? null),
        ];
    }

    /**
     * A player's full history: every placement, the head-to-head record and the
     * character usage.
     *
     * @param array<string, mixed> $history as built by RankingCalculator
     *
     * @return array<string, mixed>
     */
    public static function detail(array $history): array
    {
        /** @var array<string, mixed> $player */
        $player = $history['player'] ?? [];
        /** @var array<string, mixed> $h2h */
        $h2h = $history['h2h'] ?? [];
        /** @var array<string, mixed> $characters */
        $characters = $history['characters'] ?? [];
        /** @var array<string, mixed> $summary */
        $summary = $h2h['summary'] ?? [];

        return [
            'playerId' => (string) ($player['playerId'] ?? ''),
            'displayName' => (string) ($player['displayName'] ?? ''),
            'attendances' => (int) ($player['attendances'] ?? 0),
            'averagePlacement' => (float) ($player['averagePlacement'] ?? 0),
            'bestPlacement' => (int) ($player['bestPlacement'] ?? 0),
            'placements' => self::placements($history['placements'] ?? []),
            'headToHead' => [
                'summary' => [
                    'wins' => (int) ($summary['wins'] ?? 0),
                    'losses' => (int) ($summary['losses'] ?? 0),
                ],
                'opponents' => self::opponents($h2h['opponents'] ?? []),
            ],
            'characters' => [
                'totalSelections' => (int) ($characters['totalSelections'] ?? 0),
                'top' => array_values(array_filter(array_map(
                    self::character(...),
                    $characters['top'] ?? [],
                ))),
            ],
        ];
    }

    /**
     * @param array<string, mixed>|null $character
     *
     * @return array<string, mixed>|null
     */
    public static function character(?array $character): ?array
    {
        if (null === $character || [] === $character) {
            return null;
        }

        return [
            'characterId' => (int) ($character['characterId'] ?? 0),
            'characterName' => (string) ($character['characterName'] ?? ''),
            'count' => (int) ($character['count'] ?? 0),
            'percentage' => (float) ($character['percentage'] ?? 0),
        ];
    }

    /**
     * Oldest first, matching the history the participant page draws.
     *
     * @param iterable<array<string, mixed>> $placements
     *
     * @return list<array<string, mixed>>
     */
    private static function placements(iterable $placements): array
    {
        $rows = [];
        foreach ($placements as $placement) {
            $rows[] = [
                'eventId' => (int) ($placement['eventId'] ?? 0),
                'eventName' => (string) ($placement['eventName'] ?? ''),
                'tournamentName' => (string) ($placement['tournamentName'] ?? ''),
                'label' => (string) ($placement['label'] ?? ''),
                'startAt' => Iso8601::fromTimestamp($placement['startAt'] ?? null),
                'numEntrants' => \is_int($placement['numEntrants'] ?? null) ? $placement['numEntrants'] : null,
                'placement' => (int) ($placement['placement'] ?? 0),
            ];
        }

        return $rows;
    }

    /**
     * @param iterable<array<string, mixed>> $opponents
     *
     * @return list<array<string, mixed>>
     */
    private static function opponents(iterable $opponents): array
    {
        $rows = [];
        foreach ($opponents as $opponent) {
            $rows[] = [
                'playerId' => (string) ($opponent['playerId'] ?? ''),
                'displayName' => (string) ($opponent['displayName'] ?? ''),
                'wins' => (int) ($opponent['wins'] ?? 0),
                'losses' => (int) ($opponent['losses'] ?? 0),
                'totalSets' => (int) ($opponent['totalSets'] ?? 0),
                'winRate' => (float) ($opponent['winRate'] ?? 0),
            ];
        }

        return $rows;
    }
}
