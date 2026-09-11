<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Event;
use App\Entity\Standing;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Standing>
 */
class StandingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Standing::class);
    }

    public function deleteByEvent(Event $event): void
    {
        $this->createQueryBuilder('s')
            ->delete()
            ->where('s.event = :event')
            ->setParameter('event', $event)
            ->getQuery()
            ->execute();
    }

    /**
     * All standings across all events, keyed by the start.gg event id,
     * hydrated as plain rows for the ranking aggregation.
     *
     * @return list<array{eventId: int, placement: int, playerId: string, displayName: string}>
     */
    public function findRows(): array
    {
        /** @var list<array{eventId: int, placement: int, playerId: string, displayName: string}> $rows */
        $rows = $this->createQueryBuilder('s')
            ->select(
                'e.startggEventId AS eventId',
                's.placement AS placement',
                'p.startggPlayerId AS playerId',
                'p.displayName AS displayName',
            )
            ->join('s.event', 'e')
            ->join('s.player', 'p')
            ->orderBy('s.placement', 'ASC')
            ->getQuery()
            ->getArrayResult();

        return $rows;
    }
}
