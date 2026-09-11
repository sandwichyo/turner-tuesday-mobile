<?php

declare(strict_types=1);

namespace App\Api\Http;

use Symfony\Component\HttpFoundation\Request;

/**
 * `limit`/`offset` paging for the collection endpoints. Out-of-range values are
 * clamped rather than rejected — a phone that asks for too much should get an
 * answer, not an error.
 */
final readonly class Pagination
{
    private function __construct(
        public int $limit,
        public int $offset,
    ) {
    }

    public static function fromRequest(Request $request, int $default, int $max): self
    {
        $limit = $request->query->has('limit')
            ? max(1, min($max, $request->query->getInt('limit', $default)))
            : $default;

        return new self($limit, max(0, $request->query->getInt('offset')));
    }

    /**
     * @template T
     *
     * @param list<T> $items
     *
     * @return list<T>
     */
    public function slice(array $items): array
    {
        return \array_slice($items, $this->offset, $this->limit);
    }

    /**
     * @return array<string, mixed>
     */
    public function meta(int $total): array
    {
        return [
            'limit' => $this->limit,
            'offset' => $this->offset,
            'total' => $total,
            'hasMore' => $this->offset + $this->limit < $total,
        ];
    }
}
