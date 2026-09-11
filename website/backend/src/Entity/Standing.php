<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\StandingRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: StandingRepository::class)]
#[ORM\Table(name: 'standing')]
#[ORM\UniqueConstraint(name: 'uniq_standing_event_player', columns: ['event_id', 'player_id'])]
class Standing
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Event::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Event $event;

    #[ORM\ManyToOne(targetEntity: Player::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Player $player;

    #[ORM\Column]
    private int $placement;

    public function __construct(Event $event, Player $player, int $placement)
    {
        $this->event = $event;
        $this->player = $player;
        $this->placement = $placement;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEvent(): Event
    {
        return $this->event;
    }

    public function getPlayer(): Player
    {
        return $this->player;
    }

    public function getPlacement(): int
    {
        return $this->placement;
    }

    public function setPlacement(int $placement): self
    {
        $this->placement = $placement;

        return $this;
    }
}
