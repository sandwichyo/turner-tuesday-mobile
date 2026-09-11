<?php

declare(strict_types=1);

namespace App\Controller;

use App\Security\AdminAccess;
use App\Service\Ranking\EventDataProvider;
use App\Service\StartGgClient;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * start.gg OAuth approval flow plus a couple of small admin/status endpoints.
 * All ranking/data reads now live in PageController; this controller only owns
 * the connection to start.gg used by the background importer.
 */
final class StartGgController
{
    private const OAUTH_STATE_SESSION_KEY = 'startgg_oauth_state';

    public function __construct(
        private readonly StartGgClient $startGgClient,
        private readonly EventDataProvider $eventDataProvider,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/admin/context', name: 'api_admin_context', methods: ['GET'])]
    public function adminContext(Request $request): JsonResponse
    {
        return $this->corsJson(['isAdmin' => AdminAccess::isGranted($request)]);
    }

    #[Route('/api/startgg/status', name: 'api_startgg_status', methods: ['GET'])]
    public function status(): JsonResponse
    {
        return $this->corsJson($this->startGgClient->getStatus());
    }

    #[Route('/api/startgg/oauth/connect', name: 'api_startgg_oauth_connect', methods: ['GET'])]
    public function connect(Request $request): RedirectResponse
    {
        $state = bin2hex(random_bytes(16));
        $request->getSession()->set(self::OAUTH_STATE_SESSION_KEY, $state);

        return new RedirectResponse($this->startGgClient->getAuthorizationUrl($state));
    }

    #[Route('/api/startgg/oauth/callback', name: 'api_startgg_oauth_callback', methods: ['GET'])]
    public function callback(Request $request): RedirectResponse
    {
        $error = trim((string) $request->query->get('error', ''));

        if ('' !== $error) {
            return new RedirectResponse($this->buildFrontendUrl(['startgg' => 'error', 'message' => $error]));
        }

        $session = $request->getSession();
        $expectedState = (string) $session->get(self::OAUTH_STATE_SESSION_KEY, '');
        $session->remove(self::OAUTH_STATE_SESSION_KEY);
        $state = trim((string) $request->query->get('state', ''));

        if ('' === $expectedState || !hash_equals($expectedState, $state)) {
            return new RedirectResponse($this->buildFrontendUrl([
                'startgg' => 'error',
                'message' => 'Ungültiger OAuth-State. Bitte erneut verbinden.',
            ]));
        }

        $code = trim((string) $request->query->get('code', ''));

        if ('' === $code) {
            return new RedirectResponse($this->buildFrontendUrl([
                'startgg' => 'error',
                'message' => 'Missing OAuth authorization code.',
            ]));
        }

        try {
            $this->startGgClient->exchangeAuthorizationCode($code);

            return new RedirectResponse($this->buildFrontendUrl(['startgg' => 'connected']));
        } catch (RuntimeException $exception) {
            $this->startGgClient->clearTokens();
            $this->logger->error('start.gg OAuth token exchange failed.', ['exception' => $exception]);

            return new RedirectResponse($this->buildFrontendUrl([
                'startgg' => 'error',
                'message' => 'Verbindung mit start.gg fehlgeschlagen.',
            ]));
        }
    }

    #[Route('/api/startgg/disconnect', name: 'api_startgg_disconnect', methods: ['POST'])]
    public function disconnect(): JsonResponse
    {
        $this->startGgClient->clearTokens();

        return $this->corsJson(['success' => true]);
    }

    #[Route('/api/startgg/cache/flush', name: 'api_startgg_cache_flush', methods: ['POST'])]
    public function flushCache(): JsonResponse
    {
        // Drop the cached read model so the next page load re-reads from the DB.
        $this->eventDataProvider->invalidate();

        return $this->corsJson(['success' => true]);
    }

    /**
     * @param array<string, string> $query
     */
    private function buildFrontendUrl(array $query): string
    {
        return '/admin?'.http_build_query($query, '', '&', \PHP_QUERY_RFC3986);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function corsJson(array $payload, int $statusCode = 200): JsonResponse
    {
        $response = new JsonResponse($payload, $statusCode);
        $origin = $this->startGgClient->getFrontendOrigin();

        if (null !== $origin) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
            $response->setVary('Origin', false);
        }

        return $response;
    }
}
