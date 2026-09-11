<?php

declare(strict_types=1);

namespace App\Api\V1\Controller;

use App\Api\ApiVersion;
use App\Api\Http\ApiResponder;
use App\Api\Http\Pagination;
use App\Api\V1\ReadModel\V1ReadModel;
use App\Api\V1\Resource\PlayerResource;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The player roster and a single player's full history.
 */
final class PlayersController
{
    private const ApiVersion VERSION = ApiVersion::V1;
    private const int DEFAULT_LIMIT = 100;
    private const int MAX_LIMIT = 500;

    /** Sort keys accepted by the roster, mapped to a comparison. */
    private const array SORTS = ['name', 'average', 'attendances'];

    public function __construct(
        private readonly ApiResponder $responder,
        private readonly V1ReadModel $readModel,
    ) {
    }

    /**
     * Every player that ever entered an imported event. `q` filters by name,
     * `sort` is one of name (default), average, attendances.
     */
    #[Route(ApiVersion::PREFIX_V1.'/players', name: 'api_v1_players_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $players = $this->readModel->playerIndex();

        $query = trim($request->query->getString('q'));
        if ('' !== $query) {
            $players = array_values(array_filter(
                $players,
                static fn (array $player): bool => false !== mb_stripos((string) $player['displayName'], $query),
            ));
        }

        usort($players, $this->comparator($request));

        $pagination = Pagination::fromRequest($request, self::DEFAULT_LIMIT, self::MAX_LIMIT);

        return $this->responder->data(
            $request,
            self::VERSION,
            array_map(PlayerResource::summary(...), $pagination->slice($players)),
            ['pagination' => $pagination->meta(\count($players))],
        );
    }

    /**
     * `playerId` is the prefixed start.gg identity ("player:12345") every other
     * payload refers to.
     */
    #[Route(ApiVersion::PREFIX_V1.'/players/{playerId}', name: 'api_v1_players_show', requirements: ['playerId' => '[A-Za-z0-9:_-]+'], methods: ['GET'])]
    public function show(Request $request, string $playerId): JsonResponse
    {
        $history = $this->readModel->player($playerId);

        if (null === $history) {
            throw new NotFoundHttpException(\sprintf('Kein Spieler mit der ID "%s".', $playerId));
        }

        return $this->responder->data($request, self::VERSION, PlayerResource::detail($history));
    }

    /**
     * @return callable(array<string, mixed>, array<string, mixed>): int
     */
    private function comparator(Request $request): callable
    {
        $sort = $request->query->getString('sort', 'name');

        if (!\in_array($sort, self::SORTS, true)) {
            throw new BadRequestHttpException(\sprintf(
                'Unbekannte Sortierung "%s". Erlaubt: %s.',
                $sort,
                implode(', ', self::SORTS),
            ));
        }

        return match ($sort) {
            // Best average first; the read model has already broken ties.
            'average' => static fn (array $a, array $b): int => $a['averagePlacement'] <=> $b['averagePlacement'],
            'attendances' => static fn (array $a, array $b): int => $b['attendances'] <=> $a['attendances']
                ?: strnatcasecmp((string) $a['displayName'], (string) $b['displayName']),
            default => static fn (array $a, array $b): int => strnatcasecmp(
                (string) $a['displayName'],
                (string) $b['displayName'],
            ),
        };
    }
}
