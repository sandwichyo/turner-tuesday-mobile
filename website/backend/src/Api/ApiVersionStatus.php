<?php

declare(strict_types=1);

namespace App\Api;

/**
 * Where a published API version stands in its lifecycle. Clients read this from
 * `GET /api/versions` and should refuse to pin themselves to anything but a
 * stable version.
 */
enum ApiVersionStatus: string
{
    /** Shipped for evaluation — may still change in breaking ways. */
    case Preview = 'preview';

    /** Frozen contract: only additive changes from here on. */
    case Stable = 'stable';

    /** Still answered, but a successor exists and a sunset date is announced. */
    case Deprecated = 'deprecated';
}
