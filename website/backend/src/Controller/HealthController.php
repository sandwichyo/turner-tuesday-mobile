<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class HealthController
{
    public function __construct(private readonly string $inertiaVersion)
    {
    }

    #[Route('/api/health', name: 'api_health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return new JsonResponse([
            'status' => 'ok',
            'service' => 'backend',
        ]);
    }

    /**
     * The version the server currently serves — the deploy's commit sha, since
     * CI passes it as INERTIA_VERSION. The installed app compares it with the
     * version its document was rendered with and reloads itself when they
     * differ (see frontend/src/appUpdate.ts).
     */
    #[Route('/api/version', name: 'api_version', methods: ['GET'])]
    public function version(): JsonResponse
    {
        $response = new JsonResponse(['version' => $this->inertiaVersion]);
        // Answering this from a cache would defeat the point.
        $response->headers->set('Cache-Control', 'no-store');

        return $response;
    }
}
