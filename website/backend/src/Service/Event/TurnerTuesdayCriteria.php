<?php

declare(strict_types=1);

namespace App\Service\Event;

/**
 * The rules that decide which start.gg events belong to the Turner Tuesday
 * series. The historical import and the upcoming-event lookup have to agree on
 * them exactly — an event the import counts but the lookup drops (or the other
 * way round) would silently show the wrong tournament — so they live here
 * instead of in either caller.
 */
final class TurnerTuesdayCriteria
{
    public const SEARCH_TERM = 'Turner Tuesday';

    public const MELEE_VIDEOGAME_ID = 1;

    /** Events whose name contains any of these keywords (case-insensitive) are not part of the series. */
    public const EXCLUDED_EVENT_KEYWORDS = ['Amateur', 'Ladder'];

    /**
     * start.gg's name filter is fuzzy, so the match is confirmed on our side.
     */
    public static function matchesTournamentName(string $tournamentName): bool
    {
        return false !== stripos($tournamentName, self::SEARCH_TERM);
    }

    /**
     * Melee, and one entrant = one player: doubles and crews carry a
     * teamRosterSize and are not part of the series.
     *
     * @param array<string, mixed> $event a start.gg event node
     */
    public static function isMeleeSingles(array $event): bool
    {
        if (self::MELEE_VIDEOGAME_ID !== (int) ($event['videogame']['id'] ?? 0)) {
            return false;
        }

        return !\is_array($event['teamRosterSize'] ?? null);
    }

    /**
     * The first excluded keyword found in the event name, or null when the
     * event qualifies.
     */
    public static function matchedExcludedKeyword(string $eventName): ?string
    {
        foreach (self::EXCLUDED_EVENT_KEYWORDS as $keyword) {
            if (false !== stripos($eventName, $keyword)) {
                return $keyword;
            }
        }

        return null;
    }

    /**
     * "Turner Tuesday #12" + "Melee Singles" → "Turner Tuesday #12 · Melee Singles";
     * an event named like its tournament stays undoubled.
     */
    public static function label(string $tournamentName, string $eventName): string
    {
        return $tournamentName.(0 !== strcasecmp($eventName, $tournamentName) ? ' · '.$eventName : '');
    }
}
