<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\CharacterSelection;
use App\Entity\Event;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CharacterSelection>
 */
class CharacterSelectionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CharacterSelection::class);
    }

    public function deleteByEvent(Event $event): void
    {
        $this->createQueryBuilder('c')
            ->delete()
            ->where('c.event = :event')
            ->setParameter('event', $event)
            ->getQuery()
            ->execute();
    }

    /**
     * Character usage across all events, keyed by the start.gg event id.
     *
     * @return list<array{eventId: int, playerId: string, characterId: int, characterName: string, cnt: int}>
     */
    public function findRows(): array
    {
        /** @var list<array{eventId: int, playerId: string, characterId: int, characterName: string, cnt: int}> $rows */
        $rows = $this->createQueryBuilder('c')
            ->select(
                'e.startggEventId AS eventId',
                'p.startggPlayerId AS playerId',
                'c.characterId AS characterId',
                'c.characterName AS characterName',
                'c.cnt AS cnt',
            )
            ->join('c.event', 'e')
            ->join('c.player', 'p')
            ->getQuery()
            ->getArrayResult();

        return $rows;
    }
}
