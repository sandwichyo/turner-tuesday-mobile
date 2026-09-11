<?php

declare(strict_types=1);

namespace App\Api\Http;

use App\Api\ApiVersion;
use App\Api\ApiVersionStatus;
use App\Api\Snapshot\DataSnapshotProvider;
use App\Api\Support\Iso8601;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The single place that turns a payload into an API response.
 *
 * Every body is `{"data": …, "meta": {…}}`; `meta.dataVersion` is also the
 * validator behind the ETag, so a phone that polls on a bad connection gets a
 * 304 instead of the whole ranking again. Deprecation and sunset headers are
 * derived from ApiVersion, so announcing them later is a one-line change there.
 */
final class ApiResponder
{
    /** Data endpoints: the import runs once a night, so a few minutes is safe. */
    public const int MAX_AGE_DATA = 300;

    /** Freshness probes should notice a fresh import quickly. */
    public const int MAX_AGE_META = 60;

    /** Pure metadata (version catalog, OpenAPI) only changes with a deploy. */
    public const int MAX_AGE_STATIC = 3600;

    public function __construct(
        private readonly DataSnapshotProvider $snapshots,
        private readonly string $inertiaVersion,
    ) {
    }

    /**
     * A response carrying imported data. Cached against the data snapshot.
     *
     * @param array<string, mixed> $meta extra members merged into `meta`
     */
    public function data(
        Request $request,
        ApiVersion $version,
        mixed $data,
        array $meta = [],
        int $maxAge = self::MAX_AGE_DATA,
    ): JsonResponse {
        $snapshot = $this->snapshots->get();

        $response = self::json([
            'data' => $data,
            'meta' => [
                'apiVersion' => $version->value,
                'dataUpdatedAt' => Iso8601::fromDateTime($snapshot->updatedAt),
                'dataVersion' => $snapshot->version,
            ] + $meta,
        ]);

        if (null !== $snapshot->updatedAt) {
            $response->setLastModified($snapshot->updatedAt);
        }

        return $this->finish($request, $response, $version, $maxAge, $snapshot->version);
    }

    /**
     * A response that does not depend on imported data (version catalog, index
     * pages, the OpenAPI document) — validated against the deployed version
     * alone, so it never touches the database.
     *
     * @param array<string, mixed> $meta
     */
    public function staticData(
        Request $request,
        ?ApiVersion $version,
        mixed $data,
        array $meta = [],
        int $maxAge = self::MAX_AGE_STATIC,
    ): JsonResponse {
        $response = self::json([
            'data' => $data,
            'meta' => ['apiVersion' => $version?->value] + $meta,
        ]);

        return $this->finish($request, $response, $version, $maxAge, $this->inertiaVersion);
    }

    /**
     * A response whose body moves with the clock (the ranked-day countdown).
     * It gets a short max-age but deliberately no validator: answering a
     * conditional request with 304 would hand the client a stale number.
     *
     * @param array<string, mixed> $meta
     */
    public function volatileData(
        ApiVersion $version,
        mixed $data,
        array $meta = [],
        int $maxAge = self::MAX_AGE_META,
    ): JsonResponse {
        $response = self::json([
            'data' => $data,
            'meta' => ['apiVersion' => $version->value] + $meta,
        ]);

        $response->setPublic();
        $response->setMaxAge($maxAge);
        $response->setVary(['Accept-Encoding', 'Origin']);
        $this->applyVersionHeaders($response, $version);

        return $response;
    }

    /**
     * Applies the version headers to any response — used by the error listener
     * so a problem+json is labelled just like a successful answer.
     */
    public function applyVersionHeaders(Response $response, ?ApiVersion $version): void
    {
        if (null === $version) {
            return;
        }

        $response->headers->set('X-API-Version', $version->value);

        $links = [\sprintf('<%s>; rel="service-desc"', $version->openApiPath())];

        if (ApiVersionStatus::Deprecated === $version->status()) {
            // RFC 9745 expects a structured-field date: an "@" plus a Unix
            // timestamp. RFC 8594's Sunset uses an HTTP-date instead.
            $deprecatedOn = $version->deprecatedOn();
            if (null !== $deprecatedOn) {
                $response->headers->set('Deprecation', '@'.$deprecatedOn->getTimestamp());
            }

            $sunsetOn = $version->sunsetOn();
            if (null !== $sunsetOn) {
                $response->headers->set('Sunset', $sunsetOn->setTimezone(new \DateTimeZone('UTC'))->format('D, d M Y H:i:s \G\M\T'));
            }

            $successor = $version->successor();
            if (null !== $successor) {
                $links[] = \sprintf('<%s>; rel="successor-version"', $successor->prefix());
            }
        }

        $response->headers->set('Link', implode(', ', $links));
    }

    /**
     * Shared tail: cache directives, the ETag and the conditional-request check
     * that turns a repeat call into an empty 304.
     */
    private function finish(
        Request $request,
        JsonResponse $response,
        ?ApiVersion $version,
        int $maxAge,
        string $validator,
    ): JsonResponse {
        $response->setPublic();
        $response->setMaxAge($maxAge);
        $response->headers->addCacheControlDirective('stale-while-revalidate', (string) $maxAge);
        $response->setVary(['Accept-Encoding', 'Origin']);
        $response->setEtag($this->etag($request, $validator), true);

        $this->applyVersionHeaders($response, $version);

        // Mutates the response into an empty 304 when the client already has it.
        $response->isNotModified($request);

        return $response;
    }

    /**
     * `JSON_PRESERVE_ZERO_FRACTION` keeps a field documented as a float a float:
     * an average of exactly 1 stays `1.0` instead of turning into `1`.
     *
     * @param array<string, mixed> $payload
     */
    private static function json(array $payload): JsonResponse
    {
        $response = new JsonResponse();
        $response->setEncodingOptions(JsonResponse::DEFAULT_ENCODING_OPTIONS | \JSON_PRESERVE_ZERO_FRACTION);

        return $response->setData($payload);
    }

    private function etag(Request $request, string $validator): string
    {
        $query = $request->query->all();
        ksort($query);

        return substr(hash('sha256', implode('|', [
            $validator,
            $request->getPathInfo(),
            http_build_query($query),
        ])), 0, 32);
    }
}
