<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Event;
use App\Entity\Standing;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\Query\Expr\Join;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Event>
 */
class EventRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Event::class);
    }

    public function findOneByStartggEventId(int $startggEventId): ?Event
    {
        return $this->findOneBy(['startggEventId' => $startggEventId]);
    }

    /**
     * start.gg ids of the events that are stored *with* at least one standing —
     * the incremental-import skip list. An event stored without participants
     * (results not published yet when it was fetched) is deliberately absent,
     * so the next incremental run picks it up again instead of leaving it
     * hidden forever.
     *
     * @return list<int>
     */
    public function findStartggEventIdsWithStandings(): array
    {
        $ids = $this->createQueryBuilder('e')
            ->select('DISTINCT e.startggEventId')
            ->innerJoin(Standing::class, 's', Join::WITH, 's.event = e')
            ->getQuery()
            ->getSingleColumnResult();

        return array_map(static fn (mixed $id): int => (int) $id, $ids);
    }

    /**
     * When the newest row was written — the freshness the public API reports
     * and caches against.
     */
    public function findLatestImportedAt(): ?\DateTimeImmutable
    {
        $value = $this->createQueryBuilder('e')
            ->select('MAX(e.importedAt)')
            ->getQuery()
            ->getSingleScalarResult();

        return \is_string($value) ? new \DateTimeImmutable($value) : null;
    }

    /**
     * @return list<Event>
     */
    public function findAllOrderedByStartAtDesc(): array
    {
        return $this->createQueryBuilder('e')
            ->orderBy('e.startAt', 'DESC')
            ->addOrderBy('e.startggEventId', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
