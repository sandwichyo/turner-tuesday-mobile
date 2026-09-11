<?php

declare(strict_types=1);

namespace App\Service\Import;

use App\Entity\ImportRun;
use App\Repository\ImportLogRepository;

/**
 * Shapes an ImportRun (plus its recent activity log) into the JSON structure
 * consumed by the /admin page for initial render and live polling.
 */
final class ImportStatusSerializer
{
    public function __construct(
        private readonly ImportLogRepository $logRepository,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function serialize(ImportRun $run): array
    {
        $logs = array_map(
            static fn ($log): array => [
                'at' => $log->getCreatedAt()->getTimestamp(),
                'level' => $log->getLevel(),
                'message' => $log->getMessage(),
            ],
            $this->logRepository->findRecentForRun($run),
        );

        $total = $run->getTotalEvents();
        $percent = $total > 0
            ? (int) round(($run->getProcessedEvents() / $total) * 100)
            : (ImportRun::STATUS_COMPLETED === $run->getStatus() ? 100 : 0);

        return [
            'id' => $run->getId(),
            'status' => $run->getStatus(),
            'mode' => $run->getMode(),
            'active' => $run->isActive(),
            'createdAt' => $run->getCreatedAt()->getTimestamp(),
            'startedAt' => $run->getStartedAt()?->getTimestamp(),
            'finishedAt' => $run->getFinishedAt()?->getTimestamp(),
            'totalTournaments' => $run->getTotalTournaments(),
            'totalEvents' => $total,
            'processedEvents' => $run->getProcessedEvents(),
            'percent' => $percent,
            'currentLabel' => $run->getCurrentLabel(),
            'error' => $run->getError(),
            'logs' => $logs,
        ];
    }
}
