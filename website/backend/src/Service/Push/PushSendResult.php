<?php

declare(strict_types=1);

namespace App\Service\Push;

/**
 * Outcome of one broadcast, aggregated over all stored subscriptions.
 */
final readonly class PushSendResult
{
    /**
     * @param list<string> $errors Human-readable reasons, deduplicated
     */
    public function __construct(
        public int $sent = 0,
        public int $failed = 0,
        public int $removed = 0,
        public array $errors = [],
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'sent' => $this->sent,
            'failed' => $this->failed,
            'removed' => $this->removed,
            'errors' => $this->errors,
        ];
    }
}
