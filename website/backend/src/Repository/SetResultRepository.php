<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Event;
use App\Entity\SetResult;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SetResult>
 */
class SetResultRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SetResult::class);
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
     * All sets across all events, keyed by the start.gg event id and carrying
     * the bracket context the event detail page renders. The rankings read only
     * the winner/loser pair and ignore the rest.
     *
     * @return list<array{
     *     setId: int,
     *     eventId: int,
     *     winnerPlayerId: string,
     *     loserPlayerId: string,
     *     winnerName: string,
     *     loserName: string,
     *     round: ?int,
     *     roundText: ?string,
     *     phaseName: ?string,
     *     winnerScore: ?int,
     *     loserScore: ?int,
     *     displayScore: ?string,
     *     sortOrder: int
     * }>
     */
    public function findRows(): array
    {
        /** @var list<array{setId: int, eventId: int, winnerPlayerId: string, loserPlayerId: string, winnerName: string, loserName: string, round: ?int, roundText: ?string, phaseName: ?string, winnerScore: ?int, loserScore: ?int, displayScore: ?string, sortOrder: int}> $rows */
        $rows = $this->createQueryBuilder('s')
            ->select(
                's.id AS setId',
                'e.startggEventId AS eventId',
                'w.startggPlayerId AS winnerPlayerId',
                'l.startggPlayerId AS loserPlayerId',
                'w.displayName AS winnerName',
                'l.displayName AS loserName',
                's.round AS round',
                's.roundText AS roundText',
                's.phaseName AS phaseName',
                's.winnerScore AS winnerScore',
                's.loserScore AS loserScore',
                's.displayScore AS displayScore',
                's.sortOrder AS sortOrder',
            )
            ->join('s.event', 'e')
            ->join('s.winner', 'w')
            ->join('s.loser', 'l')
            ->orderBy('s.sortOrder', 'ASC')
            ->addOrderBy('s.id', 'ASC')
            ->getQuery()
            ->getArrayResult();

        return $rows;
    }
}
