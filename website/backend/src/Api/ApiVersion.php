<?php

declare(strict_types=1);

namespace App\Api;

/**
 * Every published version of the public read API.
 *
 * A client (the upcoming smartphone app) pins itself to exactly one version, so
 * a version's payloads are a frozen contract. Within a version only *additive*
 * changes are allowed — new endpoints, new fields. Anything that changes the
 * meaning of an existing field needs a new version, and that explicitly
 * includes changing how the data is gathered or how a ranking is computed.
 *
 * ## Adding v2
 *
 *  1. add `case V2 = 'v2';` plus a `PREFIX_V2` constant and fill in the match
 *     arms below,
 *  2. copy `src/Api/V1` to `src/Api/V2`, point its routes at `PREFIX_V2` and
 *     change what should change,
 *  3. set v1's `successor()` to `self::V2` and give it a deprecation and a
 *     sunset date — the response headers then announce both automatically,
 *  4. add `config/api/openapi_v2.yaml` and serve it from the v2 index.
 *
 * Nothing inside `src/Api/V1` may change its semantics while v1 is still
 * served. `App\Api\V1\ReadModel\V1ReadModel` is the single place where v1 binds
 * to the domain services, so that is where a frozen calculation gets pinned.
 */
enum ApiVersion: string
{
    case V1 = 'v1';

    /**
     * Route prefixes as constants — PHP attributes need constant expressions,
     * so `#[Route(ApiVersion::PREFIX_V1.'/events')]` cannot call a method.
     */
    public const string PREFIX_V1 = '/api/v1';

    /** The version new clients should build against. */
    public static function current(): self
    {
        return self::V1;
    }

    public function prefix(): string
    {
        return match ($this) {
            self::V1 => self::PREFIX_V1,
        };
    }

    public function status(): ApiVersionStatus
    {
        return match ($this) {
            self::V1 => ApiVersionStatus::Stable,
        };
    }

    /** Date the version was first published (YYYY-MM-DD). */
    public function releasedOn(): string
    {
        return match ($this) {
            self::V1 => '2026-09-11',
        };
    }

    /** When the version was declared deprecated, or null while it is current. */
    public function deprecatedOn(): ?\DateTimeImmutable
    {
        return match ($this) {
            self::V1 => null,
        };
    }

    /** Date after which the version stops answering, or null when none is set. */
    public function sunsetOn(): ?\DateTimeImmutable
    {
        return match ($this) {
            self::V1 => null,
        };
    }

    /** The version clients should migrate to, once there is one. */
    public function successor(): ?self
    {
        return match ($this) {
            self::V1 => null,
        };
    }

    /** Machine-readable description of this version's endpoints. */
    public function openApiPath(): string
    {
        return $this->prefix().'/openapi.json';
    }

    /** The OpenAPI source file inside `config/api/`. */
    public function openApiFile(): string
    {
        return match ($this) {
            self::V1 => 'openapi_v1.yaml',
        };
    }
}
