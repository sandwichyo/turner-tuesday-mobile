<?php

declare(strict_types=1);

namespace App\Api\V1\Resource;

use App\Api\Support\Iso8601;

/**
 * v1 wire format for events. The internal series entries carry names the Inertia
 * pages grew into ("eventName", epoch "startAt"); the API states them once, in
 * its own shape, so the pages stay free to move.
 */
final class EventResource
{
    private const string STARTGG_BASE_URL = 'https://www.start.gg/';

    /**
     * @param array<string, mixed> $summary the `summary` part of a series entry
     *
     * @return array<string, mixed>
     */
    public static function summary(array $summary): array
    {
        $eventSlug = self::nullableString($summary['eventSlug'] ?? null);

        return [
            'eventId' => (int) ($summary['eventId'] ?? 0),
            'name' => (string) ($summary['eventName'] ?? ''),
            'slug' => $eventSlug,
            'label' => (string) ($summary['label'] ?? ''),
            'startAt' => Iso8601::fromTimestamp($summary['startAt'] ?? null),
            'numEntrants' => \is_int($summary['numEntrants'] ?? null) ? $summary['numEntrants'] : null,
            'tournament' => [
                'name' => (string) ($summary['tournamentName'] ?? ''),
                'slug' => self::nullableString($summary['tournamentSlug'] ?? null),
            ],
            'startggUrl' => null !== $eventSlug ? self::STARTGG_BASE_URL.$eventSlug : null,
        ];
    }

    /**
     * The full event: its summary plus the raw material every ranking is built
     * from, so a client can recompute figures of its own.
     *
     * @param array<string, mixed> $entry a complete series entry
     *
     * @return array<string, mixed>
     */
    public static function detail(array $entry): array
    {
        /** @var array<string, mixed> $summary */
        $summary = $entry['summary'] ?? [];

        return self::summary($summary) + [
            'standings' => self::standings($entry['standings'] ?? []),
            'sets' => self::sets($entry['sets'] ?? []),
            'characters' => self::characters($entry['characterSelections'] ?? []),
        ];
    }

    /**
     * @param iterable<array<string, mixed>> $standings
     *
     * @return list<array<string, mixed>>
     */
    private static function standings(iterable $standings): array
    {
        $rows = [];
        foreach ($standings as $standing) {
            $placement = (int) ($standing['placement'] ?? 0);
            $rows[] = [
                'playerId' => (string) ($standing['playerId'] ?? ''),
                'displayName' => (string) ($standing['displayName'] ?? ''),
                // The absolute start.gg placement …
                'placement' => $placement,
                // … and the placement re-ranked among the stored (German)
                // players, which is what the ranking average uses.
                'rankPlacement' => (int) ($standing['rankPlacement'] ?? $placement),
            ];
        }

        return $rows;
    }

    /**
     * One entry per set, in the bracket order start.gg played them: who beat
     * whom, in which round, with what score and on which characters. Sets
     * imported before that context was collected report it as null.
     *
     * @param iterable<array<string, mixed>> $sets
     *
     * @return list<array<string, mixed>>
     */
    private static function sets(iterable $sets): array
    {
        $rows = [];
        foreach ($sets as $set) {
            $rows[] = [
                'setId' => (int) ($set['setId'] ?? 0),
                'winnerPlayerId' => (string) ($set['winnerPlayerId'] ?? ''),
                'loserPlayerId' => (string) ($set['loserPlayerId'] ?? ''),
                'winnerName' => (string) ($set['winnerName'] ?? ''),
                'loserName' => (string) ($set['loserName'] ?? ''),
                'round' => \is_int($set['round'] ?? null) ? $set['round'] : null,
                'roundText' => self::nullableString($set['roundText'] ?? null),
                'phase' => self::nullableString($set['phaseName'] ?? null),
                'winnerScore' => \is_int($set['winnerScore'] ?? null) ? $set['winnerScore'] : null,
                'loserScore' => \is_int($set['loserScore'] ?? null) ? $set['loserScore'] : null,
                'displayScore' => self::nullableString($set['displayScore'] ?? null),
                'characters' => self::setCharacters($set['characters'] ?? []),
            ];
        }

        return $rows;
    }

    /**
     * The characters both sides of a single set picked, with the number of
     * games each was picked in.
     *
     * @param iterable<array<string, mixed>> $picks
     *
     * @return list<array<string, mixed>>
     */
    private static function setCharacters(iterable $picks): array
    {
        $rows = [];
        foreach ($picks as $pick) {
            $rows[] = [
                'playerId' => (string) ($pick['playerId'] ?? ''),
                'characterId' => (int) ($pick['characterId'] ?? 0),
                'characterName' => (string) ($pick['characterName'] ?? ''),
                'games' => (int) ($pick['games'] ?? 0),
            ];
        }

        return $rows;
    }

    /**
     * Character usage per player. The series expands the stored counts into one
     * entry per pick for the aggregation math; the API reports the counts.
     *
     * @param iterable<array<string, mixed>> $selections
     *
     * @return list<array<string, mixed>>
     */
    private static function characters(iterable $selections): array
    {
        $counts = [];
        foreach ($selections as $selection) {
            $playerId = (string) ($selection['playerId'] ?? '');
            $characterId = (int) ($selection['characterId'] ?? 0);

            if ('' === $playerId || $characterId <= 0) {
                continue;
            }

            $key = $playerId.'|'.$characterId;
            $counts[$key] ??= [
                'playerId' => $playerId,
                'characterId' => $characterId,
                'characterName' => (string) ($selection['characterName'] ?? ''),
                'count' => 0,
            ];
            ++$counts[$key]['count'];
        }

        return array_values($counts);
    }

    private static function nullableString(mixed $value): ?string
    {
        return \is_string($value) && '' !== $value ? $value : null;
    }
}
