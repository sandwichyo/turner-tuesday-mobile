<?php

declare(strict_types=1);

namespace App\Api\V1\Controller;

use App\Api\ApiVersion;
use App\Api\Http\ApiResponder;
use App\Api\Snapshot\DataSnapshotProvider;
use App\Api\Support\Iso8601;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Yaml\Yaml;

/**
 * Entry points of v1: the resource index, the freshness probe and the OpenAPI
 * document generated clients are built from.
 */
final class IndexController
{
    private const ApiVersion VERSION = ApiVersion::V1;

    public function __construct(
        private readonly ApiResponder $responder,
        private readonly DataSnapshotProvider $snapshots,
        private readonly string $projectDir,
    ) {
    }

    #[Route(ApiVersion::PREFIX_V1, name: 'api_v1_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $base = self::VERSION->prefix();

        return $this->responder->staticData($request, self::VERSION, [
            'version' => self::VERSION->value,
            'status' => self::VERSION->status()->value,
            'documentation' => self::VERSION->openApiPath(),
            'resources' => [
                'meta' => $base.'/meta',
                'events' => $base.'/events',
                'event' => $base.'/events/{eventId}',
                'rankings' => $base.'/rankings',
                'ranking' => $base.'/rankings/{type}',
                'players' => $base.'/players',
                'player' => $base.'/players/{playerId}',
                'rankedDay' => $base.'/ranked-day',
            ],
        ]);
    }

    /**
     * How current the data is. Cheap enough to poll — a client that sees an
     * unchanged `dataVersion` can skip every other call.
     */
    #[Route(ApiVersion::PREFIX_V1.'/meta', name: 'api_v1_meta', methods: ['GET'])]
    public function meta(Request $request): JsonResponse
    {
        $snapshot = $this->snapshots->get();
        $lastImport = $snapshot->lastImport;

        return $this->responder->data($request, self::VERSION, [
            'eventCount' => $snapshot->eventCount,
            'playerCount' => $snapshot->playerCount,
            'lastImport' => null === $lastImport ? null : [
                'status' => $lastImport->getStatus(),
                'mode' => $lastImport->getMode(),
                'startedAt' => Iso8601::fromDateTime($lastImport->getStartedAt()),
                'finishedAt' => Iso8601::fromDateTime($lastImport->getFinishedAt()),
            ],
        ], maxAge: ApiResponder::MAX_AGE_META);
    }

    /**
     * The OpenAPI 3.1 description, served from `config/api/` in both formats so
     * a code generator can be pointed straight at the running app.
     */
    #[Route(ApiVersion::PREFIX_V1.'/openapi.{_format}', name: 'api_v1_openapi', requirements: ['_format' => 'json|yaml'], defaults: ['_format' => 'json'], methods: ['GET'])]
    public function openApi(Request $request, string $_format): Response
    {
        $file = $this->projectDir.'/config/api/'.self::VERSION->openApiFile();

        if (!is_file($file)) {
            throw new NotFoundHttpException('Für diese Version liegt keine OpenAPI-Beschreibung vor.');
        }

        // The spec is the payload itself, not a `data`/`meta` envelope —
        // tooling expects the bare document.
        $response = 'yaml' === $_format
            ? new Response(
                (string) file_get_contents($file),
                Response::HTTP_OK,
                ['Content-Type' => 'application/yaml'],
            )
            : new JsonResponse(Yaml::parseFile($file));

        $response->setPublic();
        $response->setMaxAge(ApiResponder::MAX_AGE_STATIC);
        $response->setEtag(substr(hash('sha256', $file.'|'.filemtime($file).'|'.$_format), 0, 32), true);
        $this->responder->applyVersionHeaders($response, self::VERSION);
        $response->isNotModified($request);

        return $response;
    }
}
