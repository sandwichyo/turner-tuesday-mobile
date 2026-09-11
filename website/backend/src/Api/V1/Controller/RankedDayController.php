<?php

declare(strict_types=1);

namespace App\Api\V1\Controller;

use App\Api\ApiVersion;
use App\Api\Http\ApiResponder;
use App\Api\V1\ReadModel\V1ReadModel;
use App\Api\V1\Resource\RankedDayResource;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Slippi's Free Ranked Day window. Computed from a fixed cadence, so this needs
 * no imported data — and it must not be cached across the window boundary,
 * which is why it carries its own short max-age.
 */
final class RankedDayController
{
    private const ApiVersion VERSION = ApiVersion::V1;

    /** Long enough to absorb a burst, short enough to flip on time. */
    private const int MAX_AGE = 60;

    public function __construct(
        private readonly ApiResponder $responder,
        private readonly V1ReadModel $readModel,
    ) {
    }

    #[Route(ApiVersion::PREFIX_V1.'/ranked-day', name: 'api_v1_ranked_day', methods: ['GET'])]
    public function show(): JsonResponse
    {
        $status = $this->readModel->rankedDay();

        return $this->responder->volatileData(
            self::VERSION,
            RankedDayResource::status($status),
            maxAge: self::MAX_AGE,
        );
    }
}
