<?php

declare(strict_types=1);

namespace App\Api\V1\Controller;

use App\Api\ApiVersion;
use App\Api\Http\ApiResponder;
use App\Api\V1\ReadModel\RankingScope;
use App\Api\V1\ReadModel\RankingType;
use App\Api\V1\ReadModel\V1ReadModel;
use App\Api\V1\Resource\RankingResource;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The ranking tables: `quarterly` (what the landing page shows) and `power`
 * (the half-year power ranking).
 */
final class RankingsController
{
    private const ApiVersion VERSION = ApiVersion::V1;

    public function __construct(
        private readonly ApiResponder $responder,
        private readonly V1ReadModel $readModel,
    ) {
    }

    /**
     * Catalog of the available tables, their scopes and the rules each applies.
     * Static — no ranking is computed for this.
     */
    #[Route(ApiVersion::PREFIX_V1.'/rankings', name: 'api_v1_rankings_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $rankings = array_map(
            static fn (RankingType $type): array => RankingResource::descriptor($type, self::VERSION->prefix().'/rankings'),
            RankingType::cases(),
        );

        return $this->responder->staticData($request, self::VERSION, $rankings);
    }

    /**
     * One table. `scope` picks the event set (default `qualified`), `period`
     * narrows the breakdown to a single quarter or half-year.
     */
    #[Route(ApiVersion::PREFIX_V1.'/rankings/{type}', name: 'api_v1_rankings_show', requirements: ['type' => 'quarterly|power'], methods: ['GET'])]
    public function show(Request $request, string $type): JsonResponse
    {
        $rankingType = RankingType::from($type);
        $scope = $this->resolveScope($request);
        $period = $request->query->getString('period');
        $period = '' !== $period ? $period : null;

        $group = $this->readModel->ranking($rankingType, $scope);

        if (null !== $period && !self::hasPeriod($group, $period)) {
            throw new NotFoundHttpException(\sprintf('Unbekannter Zeitraum "%s".', $period));
        }

        return $this->responder->data(
            $request,
            self::VERSION,
            RankingResource::table($rankingType, $scope, $group, $period),
        );
    }

    private function resolveScope(Request $request): RankingScope
    {
        $scope = $request->query->getString('scope');

        if ('' === $scope) {
            return RankingScope::Qualified;
        }

        return RankingScope::tryFrom($scope) ?? throw new BadRequestHttpException(\sprintf(
            'Unbekannter Scope "%s". Erlaubt: %s.',
            $scope,
            implode(', ', array_column(RankingScope::cases(), 'value')),
        ));
    }

    /**
     * @param array<string, mixed> $group
     */
    private static function hasPeriod(array $group, string $key): bool
    {
        foreach ($group['periods'] ?? [] as $candidate) {
            if ($key === ($candidate['key'] ?? null)) {
                return true;
            }
        }

        return false;
    }
}
