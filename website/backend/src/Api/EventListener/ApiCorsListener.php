<?php

declare(strict_types=1);

namespace App\Api\EventListener;

use App\Api\Http\ApiPath;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * CORS for the public API. A native app never needs this, but a browser-based
 * client does, and the data served here is the same data the public website
 * already shows — so `API_ALLOWED_ORIGINS` defaults to `*`.
 *
 * The API is read-only and never reads a cookie, so no credentials are allowed;
 * that also keeps the wildcard safe.
 */
final class ApiCorsListener
{
    private const string ALLOWED_METHODS = 'GET, HEAD, OPTIONS';
    private const string ALLOWED_HEADERS = 'Accept, Content-Type, If-None-Match, If-Modified-Since';
    private const string EXPOSED_HEADERS = 'ETag, Last-Modified, Link, Deprecation, Sunset, X-API-Version';

    /** @var list<string> */
    private readonly array $allowed;

    public function __construct(string $apiAllowedOrigins)
    {
        $this->allowed = array_values(array_filter(
            array_map(trim(...), explode(',', $apiAllowedOrigins)),
            static fn (string $origin): bool => '' !== $origin,
        ));
    }

    /**
     * Answers the preflight before routing, so `OPTIONS` needs no route of its
     * own on every endpoint.
     */
    #[AsEventListener(event: KernelEvents::REQUEST, priority: 250)]
    public function onKernelRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();

        if (!$event->isMainRequest()
            || Request::METHOD_OPTIONS !== $request->getMethod()
            || !ApiPath::isPublicApi($request->getPathInfo())
        ) {
            return;
        }

        $origin = $this->resolveOrigin($request);
        if (null === $origin) {
            return;
        }

        $response = new Response('', Response::HTTP_NO_CONTENT);
        $response->headers->set('Access-Control-Allow-Origin', $origin);
        $response->headers->set('Access-Control-Allow-Methods', self::ALLOWED_METHODS);
        $response->headers->set('Access-Control-Allow-Headers', self::ALLOWED_HEADERS);
        $response->headers->set('Access-Control-Max-Age', '86400');
        $response->setVary(['Origin']);

        $event->setResponse($response);
    }

    #[AsEventListener(event: KernelEvents::RESPONSE)]
    public function onKernelResponse(ResponseEvent $event): void
    {
        $request = $event->getRequest();

        if (!$event->isMainRequest() || !ApiPath::isPublicApi($request->getPathInfo())) {
            return;
        }

        $origin = $this->resolveOrigin($request);
        if (null === $origin) {
            return;
        }

        $response = $event->getResponse();
        $response->headers->set('Access-Control-Allow-Origin', $origin);
        $response->headers->set('Access-Control-Expose-Headers', self::EXPOSED_HEADERS);
        $response->setVary(array_unique([...$response->getVary(), 'Origin']));
    }

    /**
     * The value for `Access-Control-Allow-Origin`, or null when the caller sent
     * no `Origin` or the configuration does not allow it.
     */
    private function resolveOrigin(Request $request): ?string
    {
        $origin = $request->headers->get('Origin');

        if (null === $origin || '' === $origin || [] === $this->allowed) {
            return null;
        }

        if (\in_array('*', $this->allowed, true)) {
            return '*';
        }

        return \in_array($origin, $this->allowed, true) ? $origin : null;
    }
}
