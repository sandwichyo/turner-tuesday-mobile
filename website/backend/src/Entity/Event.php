<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\EventRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: EventRepository::class)]
#[ORM\Table(name: 'event')]
#[ORM\UniqueConstraint(name: 'uniq_event_startgg', columns: ['startgg_event_id'])]
#[ORM\Index(name: 'idx_event_start_at', columns: ['start_at'])]
class Event
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(type: Types::INTEGER, unique: true)]
    private int $startggEventId;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $slug = null;

    #[ORM\Column(length: 255)]
    private string $tournamentName;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $tournamentSlug = null;

    /** Event start as a Unix timestamp (kept as int to match the frontend contract). */
    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $startAt = null;

    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $numEntrants = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $importedAt;

    public function __construct(int $startggEventId, string $name, string $tournamentName)
    {
        $this->startggEventId = $startggEventId;
        $this->name = $name;
        $this->tournamentName = $tournamentName;
        $this->importedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStartggEventId(): int
    {
        return $this->startggEventId;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;

        return $this;
    }

    public function getSlug(): ?string
    {
        return $this->slug;
    }

    public function setSlug(?string $slug): self
    {
        $this->slug = $slug;

        return $this;
    }

    public function getTournamentName(): string
    {
        return $this->tournamentName;
    }

    public function setTournamentName(string $tournamentName): self
    {
        $this->tournamentName = $tournamentName;

        return $this;
    }

    public function getTournamentSlug(): ?string
    {
        return $this->tournamentSlug;
    }

    public function setTournamentSlug(?string $tournamentSlug): self
    {
        $this->tournamentSlug = $tournamentSlug;

        return $this;
    }

    public function getStartAt(): ?int
    {
        return $this->startAt;
    }

    public function setStartAt(?int $startAt): self
    {
        $this->startAt = $startAt;

        return $this;
    }

    public function getNumEntrants(): ?int
    {
        return $this->numEntrants;
    }

    public function setNumEntrants(?int $numEntrants): self
    {
        $this->numEntrants = $numEntrants;

        return $this;
    }

    public function getImportedAt(): \DateTimeImmutable
    {
        return $this->importedAt;
    }

    public function touchImportedAt(): self
    {
        $this->importedAt = new \DateTimeImmutable();

        return $this;
    }

    /** Human-friendly label combining tournament and event name. */
    public function getLabel(): string
    {
        if (0 === strcasecmp($this->name, $this->tournamentName)) {
            return $this->tournamentName;
        }

        return $this->tournamentName.' · '.$this->name;
    }
}
