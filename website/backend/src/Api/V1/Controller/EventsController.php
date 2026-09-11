<?php

declare(strict_types=1);

namespace App\Api\V1\Controller;

use App\Api\ApiVersion;
use App\Api\Http\ApiResponder;
use App\Api\Http\Pagination;
use App\Api\V1\ReadModel\V1ReadModel;
use App\Api\V1\Resource\EventResource;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The imported events, newest first, and the full result set of a single one.
 */
final class EventsController
{
    private const ApiVersion VERSION = ApiVersion::V1;
    private const int DEFAULT_LIMIT = 50;
    private const int MAX_LIMIT = 200;

    public function __construct(
        private readonly ApiResponder $responder,
        private readonly V1ReadModel $readModel,
    ) {
    }

    #[Route(ApiVersion::PREFIX_V1.'/events', name: 'api_v1_events_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $series = $this->readModel->series();

        $minEntrants = $request->query->getInt('minEntrants');
        if ($minEntrants > 0) {
            $series = array_values(array_filter(
                $series,
                static fn (array $entry): bool => (int) ($entry['summary']['numEntrants'] ?? 0) >= $minEntrants,
            ));
        }

        $pagination = Pagination::fromRequest($request, self::DEFAULT_LIMIT, self::MAX_LIMIT);

        $events = array_map(
            static fn (array $entry): array => EventResource::summary($entry['summary'] ?? []),
            $pagination->slice($series),
        );

        return $this->responder->data($request, self::VERSION, $events, [
            'pagination' => $pagination->meta(\count($series)),
        ]);
    }

    /**
     * `eventId` is the start.gg event id — the same id the list returns and the
     * one the participant history refers to.
     */
    #[Route(ApiVersion::PREFIX_V1.'/events/{eventId}', name: 'api_v1_events_show', requirements: ['eventId' => '\d+'], methods: ['GET'])]
    public function show(Request $request, int $eventId): JsonResponse
    {
        $entry = $this->readModel->event($eventId);

        if (null === $entry) {
            throw new NotFoundHttpException(\sprintf('Kein Event mit der ID %d.', $eventId));
        }

        return $this->responder->data($request, self::VERSION, EventResource::detail($entry));
    }
}
