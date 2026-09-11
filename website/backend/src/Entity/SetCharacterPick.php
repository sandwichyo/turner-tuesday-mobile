<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SetCharacterPickRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Which character a player used in one set, and in how many games of it.
 *
 * CharacterSelection answers "what does this player play?" per event and feeds
 * the rankings; this answers "what did the two of them pick against each
 * other?" and feeds the event detail page. Both are counted from the same game
 * selections — they are kept apart because the event aggregate also counts
 * games from sets that are not stored as a SetResult (a bye, or an opponent
 * without a usable identity).
 */
#[ORM\Entity(repositoryClass: SetCharacterPickRepository::class)]
#[ORM\Table(name: 'set_character_pick')]
#[ORM\UniqueConstraint(name: 'uniq_pick_set_player_char', columns: ['set_result_id', 'player_id', 'character_id'])]
class SetCharacterPick
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: SetResult::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private SetResult $setResult;

    #[ORM\ManyToOne(targetEntity: Player::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Player $player;

    #[ORM\Column]
    private int $characterId;

    #[ORM\Column(length: 100)]
    private string $characterName;

    /** Games of this set the character was picked in. */
    #[ORM\Column]
    private int $games = 0;

    public function __construct(SetResult $setResult, Player $player, int $characterId, string $characterName)
    {
        $this->setResult = $setResult;
        $this->player = $player;
        $this->characterId = $characterId;
        $this->characterName = $characterName;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSetResult(): SetResult
    {
        return $this->setResult;
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

    public function getGames(): int
    {
        return $this->games;
    }

    public function increment(int $by = 1): self
    {
        $this->games += $by;

        return $this;
    }
}
