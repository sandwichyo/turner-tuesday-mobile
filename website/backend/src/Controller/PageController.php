<?php

declare(strict_types=1);

namespace App\Controller;

use App\Inertia\Inertia;
use App\Repository\ImportRunRepository;
use App\Security\AdminAccess;
use App\Service\Event\EventDetailBuilder;
use App\Service\Event\UpcomingEventProvider;
use App\Service\Import\ImportStatusSerializer;
use App\Service\Push\PushNotifier;
use App\Service\Ranking\EventDataProvider;
use App\Service\Ranking\RankingCalculator;
use App\Service\StartGgClient;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Inertia page routes. All ranking data is read from the database (populated by
 * the background import), no longer fetched from start.gg on page load.
 */
final class PageController
{
    private const DATA_LOAD_ERROR = 'Die Daten konnten aktuell nicht geladen werden. Bitte versuche es später erneut.';
    private const NO_DATA_HINT = 'Es sind noch keine Daten vorhanden. Starte einen Import unter /admin.';

    public function __construct(
        private readonly Inertia $inertia,
        private readonly EventDataProvider $eventDataProvider,
        private readonly EventDetailBuilder $eventDetailBuilder,
        private readonly UpcomingEventProvider $upcomingEventProvider,
        private readonly RankingCalculator $rankingCalculator,
        private readonly StartGgClient $startGgClient,
        private readonly ImportRunRepository $runRepository,
        private readonly ImportStatusSerializer $statusSerializer,
        private readonly PushNotifier $pushNotifier,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/', name: 'page_home', methods: ['GET'])]
    public function home(Request $request): Response
    {
        $requestedEventId = (int) $request->query->get('eventId', 0);

        try {
            $series = $this->eventDataProvider->getSeries();
        } catch (\Throwable $exception) {
            $this->logger->error('Failed to load event series.', ['exception' => $exception]);

            return $this->inertia->render('Home', [
                'events' => [],
                'selectedEvent' => null,
                'rankings' => null,
                'upcomingEvent' => $this->upcomingEventProvider->getUpcomingEvent(),
                'error' => self::DATA_LOAD_ERROR,
            ]);
        }

        if ([] === $series) {
            return $this->inertia->render('Home', [
                'events' => [],
                'selectedEvent' => null,
                'rankings' => null,
                'upcomingEvent' => $this->upcomingEventProvider->getUpcomingEvent(),
                'error' => self::NO_DATA_HINT,
            ]);
        }

        $selectedEventId = $requestedEventId > 0 && isset($series[$requestedEventId])
            ? $requestedEventId
            : (int) array_key_first($series);

        $allSeries = array_values($series);
        $qualifiedSeries = $this->rankingCalculator->filterSeriesByMinimumEntrants(
            $allSeries,
            RankingCalculator::MIN_QUALIFYING_ENTRANTS,
        );

        return $this->inertia->render('Home', [
            'events' => array_values(array_map(
                static fn (array $event): array => $event['summary'],
                $series,
            )),
            'selectedEvent' => $series[$selectedEventId]['selectedEvent'],
            // The next, not yet played Turner Tuesday. Comes straight from
            // start.gg (see UpcomingEventProvider) because the database only
            // holds events that already have results, and is null whenever
            // there is none or start.gg cannot be reached.
            'upcomingEvent' => $this->upcomingEventProvider->getUpcomingEvent(),
            'rankings' => [
                'qualified' => $this->rankingCalculator->buildRankingGroup(
                    '6+ Teilnehmer',
                    $qualifiedSeries,
                    RankingCalculator::MIN_QUALIFYING_ENTRANTS,
                    true,
                ),
                'all' => $this->rankingCalculator->buildRankingGroup('Alle Events', $allSeries, null, true),
            ],
        ]);
    }

    #[Route('/power-ranking', name: 'page_power_ranking', methods: ['GET'])]
    public function powerRanking(): Response
    {
        try {
            $series = $this->eventDataProvider->getSeries();
        } catch (\Throwable $exception) {
            $this->logger->error('Failed to load event series.', ['exception' => $exception]);

            return $this->inertia->render('PowerRanking', [
                'rankings' => null,
                'error' => self::DATA_LOAD_ERROR,
            ]);
        }

        $allSeries = array_values($series);
        $qualifiedSeries = $this->rankingCalculator->filterSeriesByMinimumEntrants(
            $allSeries,
            RankingCalculator::MIN_QUALIFYING_ENTRANTS,
        );

        return $this->inertia->render('PowerRanking', [
            'rankings' => [
                'qualified' => $this->rankingCalculator->buildRankingGroup(
                    '6+ Teilnehmer',
                    $qualifiedSeries,
                    RankingCalculator::MIN_QUALIFYING_ENTRANTS,
                ),
                'all' => $this->rankingCalculator->buildRankingGroup('Alle Events', $allSeries, null),
            ],
        ]);
    }

    /**
     * One event in full: its standings and every set it was decided by, grouped
     * back into the rounds of the bracket. `eventId` is the start.gg event id,
     * the same one the overview links with.
     */
    #[Route('/events/{eventId}', name: 'page_event', requirements: ['eventId' => '\d+'], methods: ['GET'])]
    public function event(int $eventId): Response
    {
        try {
            $series = $this->eventDataProvider->getSeries();
        } catch (\Throwable $exception) {
            $this->logger->error('Failed to load event series.', ['exception' => $exception]);

            return $this->inertia->render('Events/Show', [
                'event' => null,
                'error' => self::DATA_LOAD_ERROR,
            ]);
        }

        $entry = $series[$eventId] ?? null;

        if (null === $entry) {
            return $this->inertia->render('Events/Show', [
                'event' => null,
                'error' => 'Event nicht gefunden.',
            ]);
        }

        return $this->inertia->render('Events/Show', $this->eventDetailBuilder->build($entry));
    }

    #[Route('/participants/{playerId}', name: 'page_participant', methods: ['GET'])]
    public function participant(string $playerId): Response
    {
        $playerId = trim($playerId);

        try {
            $series = $this->eventDataProvider->getSeries();
        } catch (\Throwable $exception) {
            $this->logger->error('Failed to load event series.', ['exception' => $exception]);

            return $this->inertia->render('Participants/Show', [
                'player' => null,
                'error' => self::DATA_LOAD_ERROR,
            ]);
        }

        $player = $this->rankingCalculator->buildPlayerHistory(array_values($series), $playerId);

        if (null === $player) {
            return $this->inertia->render('Participants/Show', [
                'player' => null,
                'error' => 'Spieler nicht gefunden.',
            ]);
        }

        return $this->inertia->render('Participants/Show', $player);
    }

    #[Route('/admin', name: 'page_admin', methods: ['GET'])]
    public function approve(Request $request): Response
    {
        // Reaching this route means nginx Basic-Auth succeeded → remember the
        // admin in the session so the SPA can reveal admin-only controls.
        AdminAccess::grant($request);

        $latestRun = $this->runRepository->findLatest();

        return $this->inertia->render('Approve', [
            'status' => $this->startGgClient->getStatus(),
            'importStatus' => null !== $latestRun ? $this->statusSerializer->serialize($latestRun) : null,
            'push' => [
                'configured' => $this->pushNotifier->isConfigured(),
                'subscriptions' => $this->pushNotifier->countSubscriptions(),
            ],
        ]);
    }
}
