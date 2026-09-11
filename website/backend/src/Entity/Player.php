<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PlayerRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: PlayerRepository::class)]
#[ORM\Table(name: 'player')]
#[ORM\UniqueConstraint(name: 'uniq_player_startgg', columns: ['startgg_player_id'])]
#[ORM\Index(name: 'idx_player_country', columns: ['country'])]
class Player
{
    // start.gg reports the country as its English display name.
    public const COUNTRY_GERMANY = 'Germany';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /**
     * Stable start.gg identity, e.g. "player:12345". Prefixed so player /
     * participant / entrant fallbacks never collide.
     */
    #[ORM\Column(length: 191)]
    private string $startggPlayerId;

    #[ORM\Column(length: 255)]
    private string $displayName;

    /** English country name as reported by start.gg (e.g. "Germany"), or null when unknown. */
    #[ORM\Column(type: Types::STRING, length: 100, nullable: true)]
    private ?string $country = null;

    public function __construct(string $startggPlayerId, string $displayName)
    {
        $this->startggPlayerId = $startggPlayerId;
        $this->displayName = $displayName;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStartggPlayerId(): string
    {
        return $this->startggPlayerId;
    }

    public function getDisplayName(): string
    {
        return $this->displayName;
    }

    public function setDisplayName(string $displayName): self
    {
        $this->displayName = $displayName;

        return $this;
    }

    public function getCountry(): ?string
    {
        return $this->country;
    }

    public function setCountry(?string $country): self
    {
        $this->country = $country;

        return $this;
    }

    public function isGerman(): bool
    {
        return null !== $this->country
            && 0 === strcasecmp($this->country, self::COUNTRY_GERMANY);
    }
}
