<?php

declare(strict_types=1);

namespace App\Api\Controller;

use App\Api\ApiVersion;
use App\Api\Http\ApiPath;
use App\Api\Http\ApiResponder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The one endpoint that is not itself versioned: it tells a client which
 * versions exist, which one to build against, and when an old one goes away.
 * An app should call this on start-up and warn its user before a sunset date.
 */
final class VersionsController
{
    public function __construct(private readonly ApiResponder $responder)
    {
    }

    #[Route(ApiPath::VERSIONS, name: 'api_versions', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $versions = array_map(
            static fn (ApiVersion $version): array => [
                'version' => $version->value,
                'status' => $version->status()->value,
                'basePath' => $version->prefix(),
                'documentation' => $version->openApiPath(),
                'releasedOn' => $version->releasedOn(),
                'deprecatedOn' => $version->deprecatedOn()?->format('Y-m-d'),
                'sunsetOn' => $version->sunsetOn()?->format('Y-m-d'),
                'successor' => $version->successor()?->value,
            ],
            ApiVersion::cases(),
        );

        return $this->responder->staticData($request, null, [
            'current' => ApiVersion::current()->value,
            'versions' => $versions,
        ]);
    }
}
