<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\CharacterSelectionRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Per-event character usage for a single German player, aggregated as a count
 * of how often that character was picked across the event's games.
 */
#[ORM\Entity(repositoryClass: CharacterSelectionRepository::class)]
#[ORM\Table(name: 'character_selection')]
#[ORM\UniqueConstraint(name: 'uniq_char_event_player_char', columns: ['event_id', 'player_id', 'character_id'])]
class CharacterSelection
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
    private int $characterId;

    #[ORM\Column(length: 100)]
    private string $characterName;

    #[ORM\Column]
    private int $cnt = 0;

    public function __construct(Event $event, Player $player, int $characterId, string $characterName)
    {
        $this->event = $event;
        $this->player = $player;
        $this->characterId = $characterId;
        $this->characterName = $characterName;
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

    public function getCharacterId(): int
    {
        return $this->characterId;
    }

    public function getCharacterName(): string
    {
        return $this->characterName;
    }

    public function getCnt(): int
    {
        return $this->cnt;
    }

    public function increment(int $by = 1): self
    {
        $this->cnt += $by;

        return $this;
    }
}
