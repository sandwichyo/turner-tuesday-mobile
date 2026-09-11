<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\ImportLog;
use App\Entity\ImportRun;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ImportLog>
 */
class ImportLogRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ImportLog::class);
    }

    /**
     * Most recent log lines for a run, returned oldest-first for display.
     *
     * @return list<ImportLog>
     */
    public function findRecentForRun(ImportRun $run, int $limit = 200): array
    {
        /** @var list<ImportLog> $logs */
        $logs = $this->createQueryBuilder('l')
            ->where('l.run = :run')
            ->setParameter('run', $run)
            ->orderBy('l.id', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return array_reverse($logs);
    }
}
