<?php

declare(strict_types=1);

namespace App\Service\Ranking;

use App\Repository\CharacterSelectionRepository;
use App\Repository\EventRepository;
use App\Repository\SetCharacterPickRepository;
use App\Repository\SetResultRepository;
use App\Repository\StandingRepository;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;

/**
 * Assembles the in-memory "series" (one entry per event, newest first) from the
 * database and caches it. This is the single read model the ranking pages and
 * the RankingCalculator consume; it replaces the old on-the-fly start.gg fetch.
 *
 * Events without participants (no stored standings) are left out of the series
 * entirely — they are neither listed nor counted in any ranking.
 */
final class EventDataProvider
{
    // Bumped when what the series contains changes, so a deploy does not keep
    // serving a stale build of it.
    public const CACHE_KEY = 'melee.series.v3';
    private const CACHE_TTL = 900; // 15 min; invalidated explicitly after an import

    public function __construct(
        private readonly EventRepository $eventRepository,
        private readonly StandingRepository $standingRepository,
        private readonly SetResultRepository $setResultRepository,
        private readonly SetCharacterPickRepository $setCharacterPickRepository,
        private readonly CharacterSelectionRepository $characterSelectionRepository,
        private readonly CacheInterface $appCache,
    ) {
    }

    /**
     * @return array<int, array<string, mixed>> keyed by start.gg event id, newest first
     */
    public function getSeries(): array
    {
        return $this->appCache->get(self::CACHE_KEY, function (ItemInterface $item): array {
            $item->expiresAfter(self::CACHE_TTL);

            return $this->buildSeries();
        });
    }

    public function invalidate(): void
    {
        $this->appCache->delete(self::CACHE_KEY);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildSeries(): array
    {
        $standingsByEvent = $this->groupStandings();
        $setsByEvent = $this->groupSets();
        $charactersByEvent = $this->groupCharacterSelections();

        $series = [];
        foreach ($this->eventRepository->findAllOrderedByStartAtDesc() as $event) {
            $eventId = $event->getStartggEventId();
            $standings = $standingsByEvent[$eventId] ?? [];

            // Events without participants are dropped here, which is the single
            // place that keeps them out of everything downstream: the event
            // list, every ranking table and the public API. They carry no
            // result and would only inflate the event total the power-ranking
            // non-attendance malus divides by.
            if ([] === $standings) {
                continue;
            }

            $summary = [
                'eventId' => $eventId,
                'eventName' => $event->getName(),
                'eventSlug' => $event->getSlug() ?? '',
                'tournamentId' => null,
                'tournamentName' => $event->getTournamentName(),
                'tournamentSlug' => $event->getTournamentSlug() ?? '',
                'startAt' => $event->getStartAt(),
                'numEntrants' => $event->getNumEntrants(),
                'label' => $event->getLabel(),
            ];

            $series[$eventId] = [
                'summary' => $summary,
                'selectedEvent' => [
                    'eventId' => $eventId,
                    'eventName' => $event->getName(),
                    'eventSlug' => $event->getSlug() ?? '',
                    'tournamentName' => $event->getTournamentName(),
                    'tournamentSlug' => $event->getTournamentSlug() ?? '',
                    'startAt' => $event->getStartAt(),
                    'numEntrants' => $event->getNumEntrants(),
                    'standings' => $standings,
                ],
                'standings' => $standings,
                'sets' => $setsByEvent[$eventId] ?? [],
                'characterSelections' => $charactersByEvent[$eventId] ?? [],
            ];
        }

        return $series;
    }

    /**
     * Standings grouped per event. Each entry keeps the absolute start.gg
     * `placement` (used for display) and gets a `rankPlacement`: the placement
     * re-ranked among the stored players (best = 1, next = 2, …), used
     * by the ranking average. Ties on the absolute placement keep an equal
     * rankPlacement (standard competition ranking).
     *
     * @return array<int, list<array{placement: int, rankPlacement: int, playerId: string, displayName: string, entrantName: string}>>
     */
    private function groupStandings(): array
    {
        $grouped = [];
        foreach ($this->standingRepository->findRows() as $row) {
            $eventId = (int) $row['eventId'];
            $displayName = (string) $row['displayName'];
            $grouped[$eventId][] = [
                'placement' => (int) $row['placement'],
                'playerId' => (string) $row['playerId'],
                'displayName' => $displayName,
                'entrantName' => $displayName,
            ];
        }

        foreach ($grouped as $eventId => $standings) {
            usort(
                $standings,
                static fn (array $a, array $b): int => $a['placement'] <=> $b['placement'],
            );

            $rank = 0;
            $index = 0;
            $previousPlacement = null;
            foreach ($standings as $i => $standing) {
                ++$index;
                if (null === $previousPlacement || $standing['placement'] !== $previousPlacement) {
                    $rank = $index;
                }
                $standings[$i]['rankPlacement'] = $rank;
                $previousPlacement = $standing['placement'];
            }

            $grouped[$eventId] = $standings;
        }

        return $grouped;
    }

    /**
     * Sets per event, in start.gg's bracket order. The rankings read only the
     * winner/loser pair; everything else is what the event detail page needs to
     * show who played whom, how it ended and with which characters.
     *
     * @return array<int, list<array<string, mixed>>>
     */
    private function groupSets(): array
    {
        $picksBySet = $this->groupSetCharacterPicks();

        $grouped = [];
        foreach ($this->setResultRepository->findRows() as $row) {
            $eventId = (int) $row['eventId'];
            $setId = (int) $row['setId'];

            $grouped[$eventId][] = [
                'setId' => $setId,
                'winnerPlayerId' => (string) $row['winnerPlayerId'],
                'loserPlayerId' => (string) $row['loserPlayerId'],
                'winnerName' => (string) $row['winnerName'],
                'loserName' => (string) $row['loserName'],
                'round' => self::nullableInt($row['round'] ?? null),
                'roundText' => self::nullableString($row['roundText'] ?? null),
                'phaseName' => self::nullableString($row['phaseName'] ?? null),
                'winnerScore' => self::nullableInt($row['winnerScore'] ?? null),
                'loserScore' => self::nullableInt($row['loserScore'] ?? null),
                'displayScore' => self::nullableString($row['displayScore'] ?? null),
                'sortOrder' => (int) ($row['sortOrder'] ?? 0),
                'characters' => $picksBySet[$setId] ?? [],
            ];
        }

        return $grouped;
    }

    /**
     * Character picks per set, most-played first.
     *
     * @return array<int, list<array{playerId: string, characterId: int, characterName: string, games: int}>>
     */
    private function groupSetCharacterPicks(): array
    {
        $grouped = [];
        foreach ($this->setCharacterPickRepository->findRows() as $row) {
            $grouped[(int) $row['setId']][] = [
                'playerId' => (string) $row['playerId'],
                'characterId' => (int) $row['characterId'],
                'characterName' => (string) $row['characterName'],
                'games' => (int) $row['games'],
            ];
        }

        return $grouped;
    }

    private static function nullableInt(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }

    private static function nullableString(mixed $value): ?string
    {
        if (!\is_string($value)) {
            return null;
        }

        return '' !== $value ? $value : null;
    }

    /**
     * Character usage is stored aggregated (count per event/player/character);
     * expand it back into one entry per pick so the aggregation math stays
     * identical to the original per-selection counting.
     *
     * @return array<int, list<array{playerId: string, characterId: int, characterName: string}>>
     */
    private function groupCharacterSelections(): array
    {
        $grouped = [];
        foreach ($this->characterSelectionRepository->findRows() as $row) {
            $eventId = (int) $row['eventId'];
            $entry = [
                'playerId' => (string) $row['playerId'],
                'characterId' => (int) $row['characterId'],
                'characterName' => (string) $row['characterName'],
            ];

            for ($i = 0, $count = (int) $row['cnt']; $i < $count; ++$i) {
                $grouped[$eventId][] = $entry;
            }
        }

        return $grouped;
    }
}
