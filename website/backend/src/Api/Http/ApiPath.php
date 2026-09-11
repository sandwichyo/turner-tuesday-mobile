<?php

declare(strict_types=1);

namespace App\Api\Http;

use App\Api\ApiVersion;

/**
 * Recognises the public API by its path. The CORS and error listeners are
 * deliberately scoped this way so the older internal `/api/import`,
 * `/api/push` and `/api/startgg` endpoints keep behaving exactly as before.
 */
final class ApiPath
{
    /** `/api/versions`, the unversioned discovery endpoint. */
    public const string VERSIONS = '/api/versions';

    public static function isPublicApi(string $path): bool
    {
        return self::VERSIONS === $path || 1 === preg_match('#^/api/v\d+(/|$)#', $path);
    }

    /** The version a path addresses, or null for `/api/versions` and non-API paths. */
    public static function versionOf(string $path): ?ApiVersion
    {
        if (1 !== preg_match('#^/api/(v\d+)(/|$)#', $path, $matches)) {
            return null;
        }

        return ApiVersion::tryFrom($matches[1]);
    }
}
