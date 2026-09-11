<?php

declare(strict_types=1);

namespace App\Api\V1\Resource;

use App\Api\V1\ReadModel\RankingScope;
use App\Api\V1\ReadModel\RankingType;

/**
 * v1 wire format for the ranking tables.
 */
final class RankingResource
{
    /**
     * @param array<string, mixed> $group the RankingCalculator group
     * @param ?string              $only  restrict `periods` to this period key
     *
     * @return array<string, mixed>
     */
    public static function table(RankingType $type, RankingScope $scope, array $group, ?string $only = null): array
    {
        $periods = [];
        foreach ($group['periods'] ?? [] as $period) {
            if (null !== $only && $only !== ($period['key'] ?? null)) {
                continue;
            }

            $periods[] = [
                'key' => (string) ($period['key'] ?? ''),
                'label' => (string) ($period['label'] ?? ''),
                'eventsConsidered' => (int) ($period['eventsConsidered'] ?? 0),
                'rows' => self::rows($period['rows'] ?? []),
            ];
        }

        return [
            'type' => $type->value,
            'scope' => $scope->value,
            'label' => $type->label(),
            'scopeLabel' => $scope->label(),
            'periodType' => $type->periodType(),
            'rules' => self::rules($type, $scope),
            'overall' => [
                'eventsConsidered' => (int) ($group['eventsConsidered'] ?? 0),
                'rows' => self::rows($group['rows'] ?? []),
            ],
            'periods' => $periods,
        ];
    }

    /**
     * The catalog entry for one ranking table — enough for a client to build its
     * own navigation without fetching a single row.
     *
     * @return array<string, mixed>
     */
    public static function descriptor(RankingType $type, string $basePath): array
    {
        return [
            'type' => $type->value,
            'label' => $type->label(),
            'path' => $basePath.'/'.$type->value,
            'periodType' => $type->periodType(),
            'scopes' => array_map(
                static fn (RankingScope $scope): array => [
                    'scope' => $scope->value,
                    'label' => $scope->label(),
                    'minimumEntrants' => $scope->minimumEntrants(),
                ],
                RankingScope::cases(),
            ),
            'rules' => [
                'minimumAttendances' => $type->minimumAttendances(),
                'nonAttendancePenalty' => $type->nonAttendancePenalty(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function rules(RankingType $type, RankingScope $scope): array
    {
        return [
            'minimumEntrants' => $scope->minimumEntrants(),
            'minimumAttendances' => $type->minimumAttendances(),
            'nonAttendancePenalty' => $type->nonAttendancePenalty(),
        ];
    }

    /**
     * @param iterable<array<string, mixed>> $rows
     *
     * @return list<array<string, mixed>>
     */
    private static function rows(iterable $rows): array
    {
        $result = [];
        foreach ($rows as $row) {
            $result[] = [
                'rank' => (int) ($row['rank'] ?? 0),
                'playerId' => (string) ($row['playerId'] ?? ''),
                'displayName' => (string) ($row['displayName'] ?? ''),
                'attendances' => (int) ($row['attendances'] ?? 0),
                'averagePlacement' => (float) ($row['averagePlacement'] ?? 0),
                'topCharacter' => PlayerResource::character($row['topCharacter'] ?? null),
            ];
        }

        return $result;
    }
}
