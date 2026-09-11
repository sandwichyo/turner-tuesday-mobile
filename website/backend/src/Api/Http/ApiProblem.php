<?php

declare(strict_types=1);

namespace App\Api\Http;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Errors are reported as `application/problem+json` (RFC 9457) so a client can
 * branch on one shape for every failure instead of parsing prose.
 */
final class ApiProblem
{
    /**
     * @param array<string, mixed> $extensions additional, endpoint-specific members
     */
    public static function response(
        int $status,
        string $detail,
        string $instance,
        array $extensions = [],
    ): JsonResponse {
        $response = new JsonResponse([
            'type' => 'about:blank',
            'title' => self::title($status),
            'status' => $status,
            'detail' => $detail,
            'instance' => $instance,
        ] + $extensions, $status);

        $response->headers->set('Content-Type', 'application/problem+json');
        // An error is never a cacheable representation of the resource.
        $response->headers->set('Cache-Control', 'no-store');

        return $response;
    }

    /** The reason phrase RFC 9457 expects as the problem's title. */
    public static function title(int $status): string
    {
        return Response::$statusTexts[$status] ?? 'Error';
    }
}
