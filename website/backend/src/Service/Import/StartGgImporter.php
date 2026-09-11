<?php

declare(strict_types=1);

namespace App\Service\Import;

use App\Entity\CharacterSelection;
use App\Entity\Event;
use App\Entity\ImportLog;
use App\Entity\ImportRun;
use App\Entity\Player;
use App\Entity\SetCharacterPick;
use App\Entity\SetResult;
use App\Entity\Standing;
use App\Repository\CharacterSelectionRepository;
use App\Repository\EventRepository;
use App\Repository\PlayerRepository;
use App\Repository\SetCharacterPickRepository;
use App\Repository\SetResultRepository;
use App\Repository\StandingRepository;
use App\Service\Event\TurnerTuesdayCriteria;
use App\Service\Ranking\EventDataProvider;
use App\Service\StartGgClient;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Discovers the Turner Tuesday tournaments via the start.gg search, fetches
 * them one event at a time and stores standings, head-to-head sets and
 * character usage in the database. Progress and an activity log are written to
 * the ImportRun as it goes, so /admin can display live status while this
 * runs in the background.
 */
final class StartGgImporter
{
    private const STANDINGS_PER_PAGE = 50;
    // Sets carry the most nested selection of all queries (entrants, their
    // participants, every game's picks and both slot scores), so the page stays
    // small enough to keep start.gg's query-complexity budget.
    private const SETS_PER_PAGE = 12;
    private const MAX_PAGES = 200;

    private const TURNER_TUESDAY_SEARCH_PER_PAGE = 35;
    private const TURNER_TUESDAY_MIN_START_AT = 1767225600; // 2026-01-01 00:00:00 UTC

    // Keep comfortably below start.gg's ~80 requests/minute budget.
    private const REQUEST_DELAY_MICROSECONDS = 800_000;

    private const TURNER_TUESDAY_SEARCH_QUERY = <<<'GRAPHQL'
    query SearchTurnerTuesdayTournaments($query: TournamentQuery!) {
      tournaments(query: $query) {
        nodes {
          id
          name
          slug
          startAt
          events {
            id
            name
            slug
            numEntrants
            startAt
            videogame { id }
            teamRosterSize { minPlayers maxPlayers }
          }
        }
      }
    }
    GRAPHQL;

    private const EVENT_STANDINGS_QUERY = <<<'GRAPHQL'
    query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
      event(id: $eventId) {
        id
        standings(query: { page: $page, perPage: $perPage }) {
          pageInfo { totalPages }
          nodes {
            placement
            entrant {
              id
              name
              participants {
                id
                gamerTag
                user { location { country } }
                player { id user { location { country } } }
              }
            }
          }
        }
      }
    }
    GRAPHQL;

    private const EVENT_SETS_QUERY = <<<'GRAPHQL'
    query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
      event(id: $eventId) {
        id
        sets(page: $page, perPage: $perPage, sortType: STANDARD) {
          pageInfo { totalPages }
          nodes {
            id
            winnerId
            round
            fullRoundText
            displayScore
            phaseGroup { phase { name } }
            games {
              id
              selections {
                entrant {
                  id
                  name
                  participants {
                    id
                    gamerTag
                    user { location { country } }
                    player { id user { location { country } } }
                  }
                }
                character { id name }
              }
            }
            slots(includeByes: false) {
              entrant {
                id
                name
                participants {
                  id
                  gamerTag
                  user { location { country } }
                  player { id user { location { country } } }
                }
              }
              standing { stats { score { value } } }
            }
          }
        }
      }
    }
    GRAPHQL;

    /** @var array<string, Player> in-run cache of managed players, keyed by start.gg player id */
    private array $playerCache = [];

    public function __construct(
        private readonly StartGgClient $startGgClient,
        private readonly EntityManagerInterface $em,
        private readonly EventRepository $eventRepository,
        private readonly PlayerRepository $playerRepository,
        private readonly StandingRepository $standingRepository,
        private readonly SetResultRepository $setResultRepository,
        private readonly SetCharacterPickRepository $setCharacterPickRepository,
        private readonly CharacterSelectionRepository $characterSelectionRepository,
        private readonly EventDataProvider $eventDataProvider,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function import(ImportRun $run): void
    {
        $this->playerCache = [];
        $run->markStarted();
        $this->em->persist($run);
        $this->em->flush();

        $this->log($run, ImportLog::LEVEL_INFO, sprintf('Starte Import: Suche nach "%s"-Turnieren.', TurnerTuesdayCriteria::SEARCH_TERM));

        if (!$this->startGgClient->getStatus()['authenticated']) {
            $this->log($run, ImportLog::LEVEL_ERROR, 'start.gg ist nicht verbunden. Bitte zuerst unter /admin freigeben.');
            $run->setError('start.gg not connected');
            $run->markFinished(ImportRun::STATUS_FAILED);
            $this->em->flush();

            return;
        }

        try {
            $eventSummaries = $this->discoverEvents($run);
            $discovered = \count($eventSummaries);

            if ($run->isIncremental()) {
                $eventSummaries = $this->filterToNewEvents($eventSummaries);
            }

            $tournamentSlugs = array_unique(array_map(
                static fn (array $summary): string => (string) $summary['tournamentSlug'],
                $eventSummaries,
            ));
            $run->setTotalTournaments(\count($tournamentSlugs));
            $run->setTotalEvents(\count($eventSummaries));

            if ($run->isIncremental()) {
                $this->log($run, ImportLog::LEVEL_INFO, sprintf(
                    'Inkrementeller Import: %d neue(s) Event(s) von %d gefundenen (bereits importierte werden übersprungen).',
                    \count($eventSummaries),
                    $discovered,
                ));
            } else {
                $this->log($run, ImportLog::LEVEL_INFO, sprintf('%d Melee-Einzel-Events gefunden.', $discovered));
            }
            $this->em->flush();

            foreach ($eventSummaries as $summary) {
                $run->setCurrentLabel($summary['label']);
                $this->em->flush();

                try {
                    $this->importEvent($run, $summary);
                } catch (\Throwable $exception) {
                    $this->logger->error('Event import failed.', ['eventId' => $summary['eventId'], 'exception' => $exception]);
                    $this->log($run, ImportLog::LEVEL_ERROR, sprintf('Event "%s" fehlgeschlagen: %s', $summary['label'], $exception->getMessage()));
                }

                $run->incrementProcessedEvents();
                $this->em->flush();
            }

            $run->setCurrentLabel(null);
            $this->log($run, ImportLog::LEVEL_SUCCESS, sprintf('Import abgeschlossen: %d/%d Events verarbeitet.', $run->getProcessedEvents(), $run->getTotalEvents()));
            $run->markFinished(ImportRun::STATUS_COMPLETED);
            $this->em->flush();
        } catch (\Throwable $exception) {
            $this->logger->error('Import run failed.', ['exception' => $exception]);
            $this->log($run, ImportLog::LEVEL_ERROR, 'Import abgebrochen: '.$exception->getMessage());
            $run->setError($exception->getMessage());
            $run->markFinished(ImportRun::STATUS_FAILED);
            $this->em->flush();
        } finally {
            // Data may have changed even on partial/failed runs → refresh reads.
            $this->eventDataProvider->invalidate();
        }
    }

    /**
     * Discovers all Turner Tuesday Melee singles events via the paginated
     * start.gg tournament search (name match, minimum start date), newest first.
     *
     * @return list<array{eventId: int, name: string, slug: ?string, tournamentName: string, tournamentSlug: ?string, startAt: ?int, numEntrants: ?int, label: string}>
     */
    private function discoverEvents(ImportRun $run): array
    {
        $summaries = [];

        for ($page = 1; $page <= self::MAX_PAGES; ++$page) {
            $data = $this->throttledQuery(self::TURNER_TUESDAY_SEARCH_QUERY, [
                'query' => [
                    'page' => $page,
                    'perPage' => self::TURNER_TUESDAY_SEARCH_PER_PAGE,
                    'filter' => [
                        'name' => TurnerTuesdayCriteria::SEARCH_TERM,
                        'past' => true,
                    ],
                ],
            ]);

            $nodes = $data['tournaments']['nodes'] ?? null;
            if (!\is_array($nodes) || [] === $nodes) {
                break;
            }

            foreach ($nodes as $tournament) {
                if (!\is_array($tournament)) {
                    continue;
                }

                $tournamentName = trim((string) ($tournament['name'] ?? ''));
                if ('' === $tournamentName || !TurnerTuesdayCriteria::matchesTournamentName($tournamentName)) {
                    continue;
                }

                $tournamentSlug = (string) ($tournament['slug'] ?? '');
                $events = \is_array($tournament['events'] ?? null) ? $tournament['events'] : [];
                $melee = 0;

                foreach ($events as $event) {
                    if (!\is_array($event) || !isset($event['id'])) {
                        continue;
                    }

                    if (!TurnerTuesdayCriteria::isMeleeSingles($event)) {
                        continue;
                    }

                    $eventId = (int) $event['id'];
                    if ($eventId <= 0) {
                        continue;
                    }

                    $eventName = trim((string) ($event['name'] ?? 'Event'));

                    $excludedKeyword = TurnerTuesdayCriteria::matchedExcludedKeyword($eventName);
                    if (null !== $excludedKeyword) {
                        $this->log($run, ImportLog::LEVEL_INFO, sprintf('Event "%s" übersprungen (Keyword "%s").', $eventName, $excludedKeyword));
                        continue;
                    }

                    $startAt = isset($event['startAt']) && is_numeric($event['startAt'])
                        ? (int) $event['startAt']
                        : (isset($tournament['startAt']) && is_numeric($tournament['startAt']) ? (int) $tournament['startAt'] : null);

                    if (null === $startAt || $startAt < self::TURNER_TUESDAY_MIN_START_AT) {
                        continue;
                    }

                    $summaries[$eventId] = [
                        'eventId' => $eventId,
                        'name' => $eventName,
                        'slug' => isset($event['slug']) ? (string) $event['slug'] : null,
                        'tournamentName' => $tournamentName,
                        'tournamentSlug' => $tournamentSlug,
                        'startAt' => $startAt,
                        'numEntrants' => isset($event['numEntrants']) ? (int) $event['numEntrants'] : null,
                        'label' => TurnerTuesdayCriteria::label($tournamentName, $eventName),
                    ];
                    ++$melee;
                }

                if ($melee > 0) {
                    $this->log($run, ImportLog::LEVEL_INFO, sprintf('Turnier "%s": %d Melee-Event(s).', $tournamentName, $melee));
                }
            }

            if (\count($nodes) < self::TURNER_TUESDAY_SEARCH_PER_PAGE) {
                break;
            }
        }

        uasort($summaries, static function (array $left, array $right): int {
            $leftStartAt = (int) ($left['startAt'] ?? 0);
            $rightStartAt = (int) ($right['startAt'] ?? 0);

            if ($leftStartAt !== $rightStartAt) {
                return $rightStartAt <=> $leftStartAt;
            }

            return strnatcasecmp((string) $right['tournamentName'], (string) $left['tournamentName']);
        });

        return array_values($summaries);
    }

    /**
     * Drops events that are already stored *with* participants, leaving only
     * the ones an incremental import still needs to fetch. Events stored
     * without a single standing are fetched again: they are hidden everywhere
     * until their results show up, so a later run has to be able to fill them.
     *
     * @param list<array{eventId: int, name: string, slug: ?string, tournamentName: string, tournamentSlug: ?string, startAt: ?int, numEntrants: ?int, label: string}> $summaries
     *
     * @return list<array{eventId: int, name: string, slug: ?string, tournamentName: string, tournamentSlug: ?string, startAt: ?int, numEntrants: ?int, label: string}>
     */
    private function filterToNewEvents(array $summaries): array
    {
        $existing = array_flip($this->eventRepository->findStartggEventIdsWithStandings());

        return array_values(array_filter(
            $summaries,
            static fn (array $summary): bool => !isset($existing[$summary['eventId']]),
        ));
    }

    /**
     * @param array{eventId: int, name: string, slug: ?string, tournamentName: string, tournamentSlug: ?string, startAt: ?int, numEntrants: ?int, label: string} $summary
     */
    private function importEvent(ImportRun $run, array $summary): void
    {
        $event = $this->eventRepository->findOneByStartggEventId($summary['eventId'])
            ?? new Event($summary['eventId'], $summary['name'], $summary['tournamentName']);

        $event->setName($summary['name'])
            ->setSlug($summary['slug'])
            ->setTournamentName($summary['tournamentName'])
            ->setTournamentSlug($summary['tournamentSlug'])
            ->setStartAt($summary['startAt'])
            ->setNumEntrants($summary['numEntrants'])
            ->touchImportedAt();

        $this->em->persist($event);
        $this->em->flush();

        // Idempotent re-import: drop previously stored children first. The
        // per-set picks hang off the sets, so they go before them.
        $this->characterSelectionRepository->deleteByEvent($event);
        $this->setCharacterPickRepository->deleteByEvent($event);
        $this->setResultRepository->deleteByEvent($event);
        $this->standingRepository->deleteByEvent($event);
        $this->em->flush();

        $standings = $this->importStandings($event);
        [$sets, $characterPicks] = $this->importSets($event);

        if (0 === $standings) {
            // Kept in the database (so a later run can fill it), but invisible
            // to the pages, the rankings and the API until it has participants.
            $this->log($run, ImportLog::LEVEL_INFO, sprintf(
                'Event "%s" hat keine Teilnehmer und wird nicht gewertet.',
                $summary['label'],
            ));

            return;
        }

        $this->log(
            $run,
            ImportLog::LEVEL_SUCCESS,
            sprintf(
                '%s: %d Platzierungen, %d Sets, %d Charakter-Einträge.',
                $summary['label'],
                $standings,
                $sets,
                $characterPicks,
            ),
        );
    }

    /**
     * @return int number of standings stored
     */
    private function importStandings(Event $event): int
    {
        $stored = 0;
        $seen = [];

        for ($page = 1; $page <= self::MAX_PAGES; ++$page) {
            $data = $this->throttledQuery(self::EVENT_STANDINGS_QUERY, [
                'eventId' => $event->getStartggEventId(),
                'page' => $page,
                'perPage' => self::STANDINGS_PER_PAGE,
            ]);

            $nodes = $data['event']['standings']['nodes'] ?? null;
            if (!\is_array($nodes) || [] === $nodes) {
                break;
            }

            foreach ($nodes as $node) {
                if (!\is_array($node)) {
                    continue;
                }

                $placement = (int) ($node['placement'] ?? 0);
                $entrant = \is_array($node['entrant'] ?? null) ? $node['entrant'] : null;
                if ($placement <= 0 || null === $entrant) {
                    continue;
                }

                $player = $this->resolvePlayer($entrant);
                if (null === $player) {
                    continue;
                }

                $key = $player->getStartggPlayerId();
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;

                $this->em->persist(new Standing($event, $player, $placement));
                ++$stored;
            }

            $this->em->flush();

            $totalPages = (int) ($data['event']['standings']['pageInfo']['totalPages'] ?? 0);
            if ($totalPages > 0 && $page >= $totalPages) {
                break;
            }
            if (\count($nodes) < self::STANDINGS_PER_PAGE) {
                break;
            }
        }

        return $stored;
    }

    /**
     * @return array{0: int, 1: int} [sets stored, character-selection rows stored]
     */
    private function importSets(Event $event): array
    {
        $setCount = 0;
        $position = 0;
        /** @var array<string, array<int, array{name: string, count: int}>> $characterCounts keyed by playerId, characterId */
        $characterCounts = [];

        for ($page = 1; $page <= self::MAX_PAGES; ++$page) {
            $data = $this->throttledQuery(self::EVENT_SETS_QUERY, [
                'eventId' => $event->getStartggEventId(),
                'page' => $page,
                'perPage' => self::SETS_PER_PAGE,
            ]);

            $nodes = $data['event']['sets']['nodes'] ?? null;
            if (!\is_array($nodes) || [] === $nodes) {
                break;
            }

            foreach ($nodes as $node) {
                if (!\is_array($node)) {
                    continue;
                }

                // start.gg returns the sets in bracket order; keeping the
                // running position is what lets the detail page redraw it.
                $set = $this->storeSetResult($event, $node, $position);
                ++$position;

                if (null !== $set) {
                    ++$setCount;
                    $this->storeSetCharacterPicks($set, $node);
                }

                $this->collectCharacterPicks($node, $characterCounts);
            }

            $this->em->flush();

            $totalPages = (int) ($data['event']['sets']['pageInfo']['totalPages'] ?? 0);
            if ($totalPages > 0 && $page >= $totalPages) {
                break;
            }
            if (\count($nodes) < self::SETS_PER_PAGE) {
                break;
            }
        }

        $characterRows = $this->persistCharacterCounts($event, $characterCounts);

        return [$setCount, $characterRows];
    }

    /**
     * Stores one completed set with the bracket context the detail page draws
     * from, or returns null when the set is not usable (no winner, a bye, or a
     * side without an identity we can resolve).
     *
     * @param array<string, mixed> $node
     */
    private function storeSetResult(Event $event, array $node, int $sortOrder): ?SetResult
    {
        $winnerEntrantId = (int) ($node['winnerId'] ?? 0);
        $slots = $node['slots'] ?? null;
        if ($winnerEntrantId <= 0 || !\is_array($slots) || 2 !== \count($slots)) {
            return null;
        }

        $winner = null;
        $loser = null;
        $winnerScore = null;
        $loserScore = null;

        foreach ($slots as $slot) {
            if (!\is_array($slot) || !\is_array($slot['entrant'] ?? null)) {
                return null;
            }

            $entrant = $slot['entrant'];
            $entrantId = (int) ($entrant['id'] ?? 0);
            $player = $this->resolvePlayer($entrant);

            if (null === $player) {
                // One side has no usable identity → this set is not considered.
                return null;
            }

            $score = $this->extractSlotScore($slot);

            if ($entrantId === $winnerEntrantId) {
                $winner = $player;
                $winnerScore = $score;
            } else {
                $loser = $player;
                $loserScore = $score;
            }
        }

        if (null === $winner || null === $loser || $winner === $loser) {
            return null;
        }

        // start.gg reports -1 for a DQ and null for a set nobody scored; in
        // both cases there is no game count to show, and displayScore carries
        // whatever start.gg would print instead.
        if (null === $winnerScore || null === $loserScore || $winnerScore < 0 || $loserScore < 0) {
            $winnerScore = null;
            $loserScore = null;
        }

        $set = new SetResult($event, $winner, $loser);
        $set->setStartggSetId($this->nullableString($node['id'] ?? null))
            ->setRound(isset($node['round']) && is_numeric($node['round']) ? (int) $node['round'] : null)
            ->setRoundText($this->nullableString($node['fullRoundText'] ?? null))
            ->setPhaseName($this->nullableString($node['phaseGroup']['phase']['name'] ?? null))
            ->setDisplayScore($this->nullableString($node['displayScore'] ?? null))
            ->setScores($winnerScore, $loserScore)
            ->setSortOrder($sortOrder);

        $this->em->persist($set);

        return $set;
    }

    /**
     * The games a slot's entrant won, or null when start.gg reports none.
     *
     * @param array<string, mixed> $slot
     */
    private function extractSlotScore(array $slot): ?int
    {
        $value = $slot['standing']['stats']['score']['value'] ?? null;

        return is_numeric($value) ? (int) $value : null;
    }

    /**
     * The characters the two players of this set picked, counted per game of
     * the set. Selections that belong to neither side are ignored — a set is
     * always between exactly the two stored players.
     *
     * @param array<string, mixed> $node
     */
    private function storeSetCharacterPicks(SetResult $set, array $node): void
    {
        $games = $node['games'] ?? null;
        if (!\is_array($games)) {
            return;
        }

        $players = [
            $set->getWinner()->getStartggPlayerId() => $set->getWinner(),
            $set->getLoser()->getStartggPlayerId() => $set->getLoser(),
        ];

        /** @var array<string, array<int, SetCharacterPick>> $picks keyed by playerId, characterId */
        $picks = [];

        foreach ($games as $game) {
            if (!\is_array($game) || !\is_array($game['selections'] ?? null)) {
                continue;
            }

            foreach ($game['selections'] as $selection) {
                if (!\is_array($selection) || !\is_array($selection['entrant'] ?? null) || !\is_array($selection['character'] ?? null)) {
                    continue;
                }

                $player = $this->resolvePlayer($selection['entrant']);
                if (null === $player) {
                    continue;
                }

                $playerId = $player->getStartggPlayerId();
                if (!isset($players[$playerId])) {
                    continue;
                }

                $characterId = (int) ($selection['character']['id'] ?? 0);
                $characterName = trim((string) ($selection['character']['name'] ?? ''));
                if ($characterId <= 0 || '' === $characterName) {
                    continue;
                }

                if (!isset($picks[$playerId][$characterId])) {
                    $pick = new SetCharacterPick($set, $players[$playerId], $characterId, $characterName);
                    $picks[$playerId][$characterId] = $pick;
                    $this->em->persist($pick);
                }

                $picks[$playerId][$characterId]->increment();
            }
        }
    }

    private function nullableString(mixed $value): ?string
    {
        if (!\is_string($value) && !is_numeric($value)) {
            return null;
        }

        $value = trim((string) $value);

        return '' !== $value ? $value : null;
    }

    /**
     * @param array<string, mixed>                                   $node
     * @param array<string, array<int, array{name: string, count: int}>> $characterCounts
     */
    private function collectCharacterPicks(array $node, array &$characterCounts): void
    {
        $games = $node['games'] ?? null;
        if (!\is_array($games)) {
            return;
        }

        foreach ($games as $game) {
            if (!\is_array($game) || !\is_array($game['selections'] ?? null)) {
                continue;
            }

            foreach ($game['selections'] as $selection) {
                if (!\is_array($selection) || !\is_array($selection['entrant'] ?? null) || !\is_array($selection['character'] ?? null)) {
                    continue;
                }

                $player = $this->resolvePlayer($selection['entrant']);
                if (null === $player) {
                    continue;
                }

                $characterId = (int) ($selection['character']['id'] ?? 0);
                $characterName = trim((string) ($selection['character']['name'] ?? ''));
                if ($characterId <= 0 || '' === $characterName) {
                    continue;
                }

                $playerId = $player->getStartggPlayerId();
                if (!isset($characterCounts[$playerId][$characterId])) {
                    $characterCounts[$playerId][$characterId] = ['name' => $characterName, 'count' => 0];
                }
                ++$characterCounts[$playerId][$characterId]['count'];
            }
        }
    }

    /**
     * @param array<string, array<int, array{name: string, count: int}>> $characterCounts
     *
     * @return int number of character-selection rows stored
     */
    private function persistCharacterCounts(Event $event, array $characterCounts): int
    {
        $rows = 0;

        foreach ($characterCounts as $playerId => $characters) {
            $player = $this->playerCache[$playerId] ?? null;
            if (null === $player) {
                continue;
            }

            foreach ($characters as $characterId => $info) {
                $selection = new CharacterSelection($event, $player, $characterId, $info['name']);
                $selection->increment($info['count']);
                $this->em->persist($selection);
                ++$rows;
            }
        }

        $this->em->flush();

        return $rows;
    }

    /**
     * Resolve an entrant to a managed Player, creating or updating it as
     * needed. Returns null only when no usable identity can be derived.
     *
     * @param array<string, mixed> $entrant
     */
    private function resolvePlayer(array $entrant): ?Player
    {
        $identity = $this->resolveIdentity($entrant);
        $playerId = $identity['playerId'];

        if ('' === $playerId) {
            return null;
        }

        $player = $this->playerCache[$playerId]
            ?? $this->playerRepository->findOneByStartggId($playerId);

        if (null === $player) {
            $player = new Player($playerId, $identity['displayName']);
            $this->em->persist($player);
        } else {
            $player->setDisplayName($identity['displayName']);
        }

        if (null !== $identity['country']) {
            $player->setCountry($identity['country']);
        }

        $this->playerCache[$playerId] = $player;

        return $player;
    }

    /**
     * @param array<string, mixed> $entrant
     *
     * @return array{playerId: string, displayName: string, country: ?string}
     */
    private function resolveIdentity(array $entrant): array
    {
        $participants = $entrant['participants'] ?? null;
        $participant = \is_array($participants) && isset($participants[0]) && \is_array($participants[0])
            ? $participants[0]
            : [];
        $player = \is_array($participant['player'] ?? null) ? $participant['player'] : [];

        $displayName = trim((string) ($participant['gamerTag'] ?? ($entrant['name'] ?? 'Unknown player')));
        if ('' === $displayName) {
            $displayName = 'Unknown player';
        }

        $country = $this->extractCountry($player['user'] ?? null)
            ?? $this->extractCountry($participant['user'] ?? null);

        if (isset($player['id']) && '' !== trim((string) $player['id'])) {
            $playerId = 'player:'.trim((string) $player['id']);
        } elseif (isset($participant['id']) && '' !== trim((string) $participant['id'])) {
            $playerId = 'participant:'.trim((string) $participant['id']);
        } else {
            $playerId = 'entrant:'.trim((string) ($entrant['id'] ?? $displayName));
        }

        return [
            'playerId' => $playerId,
            'displayName' => $displayName,
            'country' => $country,
        ];
    }

    private function extractCountry(mixed $user): ?string
    {
        if (!\is_array($user) || !\is_array($user['location'] ?? null)) {
            return null;
        }

        $country = trim((string) ($user['location']['country'] ?? ''));

        return '' !== $country ? $country : null;
    }

    /**
     * @param array<string, mixed> $variables
     *
     * @return array<string, mixed>
     */
    private function throttledQuery(string $query, array $variables): array
    {
        usleep(self::REQUEST_DELAY_MICROSECONDS);

        return $this->startGgClient->query($query, $variables);
    }

    private function log(ImportRun $run, string $level, string $message): void
    {
        new ImportLog($run, $level, $message);
        $this->em->flush();
    }
}
