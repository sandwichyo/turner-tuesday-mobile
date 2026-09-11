<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Event;
use App\Entity\SetCharacterPick;
use App\Entity\SetResult;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SetCharacterPick>
 */
class SetCharacterPickRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SetCharacterPick::class);
    }

    /**
     * The picks hang off the sets, so they are cleared through them. The
     * database would cascade this anyway; doing it explicitly keeps the
     * importer's delete order readable.
     */
    public function deleteByEvent(Event $event): void
    {
        $setIds = $this->getEntityManager()->createQueryBuilder()
            ->select('s.id')
            ->from(SetResult::class, 's')
            ->where('s.event = :event')
            ->setParameter('event', $event)
            ->getQuery()
            ->getSingleColumnResult();

        if ([] === $setIds) {
            return;
        }

        $this->createQueryBuilder('p')
            ->delete()
            ->where('p.setResult IN (:setIds)')
            ->setParameter('setIds', $setIds)
            ->getQuery()
            ->execute();
    }

    /**
     * Every pick across all events, keyed by the set it belongs to.
     *
     * @return list<array{setId: int, playerId: string, characterId: int, characterName: string, games: int}>
     */
    public function findRows(): array
    {
        /** @var list<array{setId: int, playerId: string, characterId: int, characterName: string, games: int}> $rows */
        $rows = $this->createQueryBuilder('p')
            ->select(
                's.id AS setId',
                'pl.startggPlayerId AS playerId',
                'p.characterId AS characterId',
                'p.characterName AS characterName',
                'p.games AS games',
            )
            ->join('p.setResult', 's')
            ->join('p.player', 'pl')
            ->orderBy('p.games', 'DESC')
            ->getQuery()
            ->getArrayResult();

        return $rows;
    }
}
