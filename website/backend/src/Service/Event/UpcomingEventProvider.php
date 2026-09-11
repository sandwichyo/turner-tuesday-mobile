<?php

declare(strict_types=1);

namespace App\Service\Event;

use App\Service\StartGgClient;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;

/**
 * The next Turner Tuesday that has not been played yet, together with its live
 * sign-up count.
 *
 * Unlike everything else on the site this is *not* read from the database. The
 * import only keeps events that already have standings (see EventDataProvider),
 * and a sign-up counter frozen between two manual imports would be worse than
 * no counter at all — it would tell people a tournament is empty hours after it
 * filled up. So it is asked from start.gg directly and cached for a few
 * minutes, which keeps the page fast and stays far below the ~80 requests per
 * minute start.gg allows.
 *
 * Every failure degrades to null: no token, no upcoming tournament, start.gg
 * down — the homepage then renders exactly as it did before this existed.
 *
 * The seat limit does not come from start.gg: its API exposes no registration
 * cap (Event::entrantSizeMax is the number of players *per entrant* — 1 for
 * singles, which is why it once showed up as "7/1"). The Turner Tuesday cap is
 * therefore configured locally via TURNER_TUESDAY_CAPACITY.
 */
final class UpcomingEventProvider
{
    public const CACHE_KEY = 'melee.upcoming_event.v2';

    private const STARTGG_BASE_URL = 'https://www.start.gg/';

    /** Short enough that a fresh sign-up shows up quickly, long enough to keep start.gg out of the render path. */
    private const CACHE_TTL = 300;

    /** A failed lookup is cached briefly too, so an outage does not hit start.gg on every single page view. */
    private const FAILURE_CACHE_TTL = 60;

    /** The next Turner Tuesday is among the first few upcoming ones; no need to page. */
    private const SEARCH_PER_PAGE = 10;

    private const UPCOMING_QUERY = <<<'GRAPHQL'
    query UpcomingTurnerTuesday($query: TournamentQuery!) {
      tournaments(query: $query) {
        nodes {
          name
          slug
          startAt
          events {
            id
            name
            slug
            startAt
            numEntrants
            videogame { id }
            teamRosterSize { minPlayers maxPlayers }
          }
        }
      }
    }
    GRAPHQL;

    public function __construct(
        private readonly StartGgClient $startGgClient,
        private readonly CacheInterface $appCache,
        private readonly LoggerInterface $logger,
        private readonly int $upcomingEventCapacity = 0,
    ) {
    }

    /**
     * @return array{
     *     eventId: int,
     *     name: string,
     *     tournamentName: string,
     *     label: string,
     *     startAt: int,
     *     numEntrants: int,
     *     capacity: ?int,
     *     startggUrl: ?string
     * }|null
     */
    public function getUpcomingEvent(): ?array
    {
        return $this->appCache->get(self::CACHE_KEY, function (ItemInterface $item): ?array {
            try {
                $event = $this->fetchUpcomingEvent();
            } catch (\Throwable $exception) {
                $this->logger->warning(
                    'Could not load the upcoming Turner Tuesday from start.gg.',
                    ['exception' => $exception],
                );
                $item->expiresAfter(self::FAILURE_CACHE_TTL);

                return null;
            }

            $item->expiresAfter(self::CACHE_TTL);

            return $event;
        });
    }

    public function invalidate(): void
    {
        $this->appCache->delete(self::CACHE_KEY);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchUpcomingEvent(): ?array
    {
        $data = $this->startGgClient->query(self::UPCOMING_QUERY, [
            'query' => [
                'page' => 1,
                'perPage' => self::SEARCH_PER_PAGE,
                'sortBy' => 'startAt asc',
                'filter' => [
                    'name' => TurnerTuesdayCriteria::SEARCH_TERM,
                    'upcoming' => true,
                ],
            ],
        ]);

        $nodes = $data['tournaments']['nodes'] ?? null;

        if (!\is_array($nodes)) {
            return null;
        }

        $now = time();
        $candidates = [];

        foreach ($nodes as $tournament) {
            if (!\is_array($tournament)) {
                continue;
            }

            $tournamentName = trim((string) ($tournament['name'] ?? ''));

            if ('' === $tournamentName || !TurnerTuesdayCriteria::matchesTournamentName($tournamentName)) {
                continue;
            }

            $events = \is_array($tournament['events'] ?? null) ? $tournament['events'] : [];

            foreach ($events as $event) {
                if (!\is_array($event) || !isset($event['id'])) {
                    continue;
                }

                $candidate = $this->toCandidate($tournament, $tournamentName, $event, $now);

                if (null !== $candidate) {
                    $candidates[] = $candidate;
                }
            }
        }

        usort($candidates, static fn (array $left, array $right): int => $left['startAt'] <=> $right['startAt']);

        return $candidates[0] ?? null;
    }

    /**
     * @param array<string, mixed> $tournament
     * @param array<string, mixed> $event
     *
     * @return array<string, mixed>|null
     */
    private function toCandidate(array $tournament, string $tournamentName, array $event, int $now): ?array
    {
        if (!TurnerTuesdayCriteria::isMeleeSingles($event)) {
            return null;
        }

        $eventId = (int) $event['id'];

        if ($eventId <= 0) {
            return null;
        }

        $eventName = trim((string) ($event['name'] ?? 'Event'));

        if (null !== TurnerTuesdayCriteria::matchedExcludedKeyword($eventName)) {
            return null;
        }

        $startAt = isset($event['startAt']) && is_numeric($event['startAt'])
            ? (int) $event['startAt']
            : (isset($tournament['startAt']) && is_numeric($tournament['startAt']) ? (int) $tournament['startAt'] : null);

        // start.gg's "upcoming" filter is a tournament-level flag: a tournament
        // still counting as upcoming can already hold an event that started
        // (side events run on different days), so the event decides.
        if (null === $startAt || $startAt < $now) {
            return null;
        }

        $slug = trim((string) ($event['slug'] ?? ''));

        return [
            'eventId' => $eventId,
            'name' => $eventName,
            'tournamentName' => $tournamentName,
            'label' => TurnerTuesdayCriteria::label($tournamentName, $eventName),
            'startAt' => $startAt,
            'numEntrants' => max(0, (int) ($event['numEntrants'] ?? 0)),
            // TURNER_TUESDAY_CAPACITY=0 means "no limit": the counter then shows
            // the sign-ups alone, without a number to divide by.
            'capacity' => $this->upcomingEventCapacity > 0 ? $this->upcomingEventCapacity : null,
            'startggUrl' => '' !== $slug ? self::STARTGG_BASE_URL.$slug : null,
        ];
    }
}
