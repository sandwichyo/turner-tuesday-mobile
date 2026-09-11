<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ImportRunRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Tracks a single background import so /admin can show live progress and an
 * activity log while the detached CLI worker runs.
 */
#[ORM\Entity(repositoryClass: ImportRunRepository::class)]
#[ORM\Table(name: 'import_run')]
#[ORM\Index(name: 'idx_import_run_created', columns: ['created_at'])]
class ImportRun
{
    public const STATUS_QUEUED = 'queued';
    public const STATUS_RUNNING = 'running';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';

    /** Re-import every discovered event, replacing existing data (default). */
    public const MODE_FULL = 'full';
    /** Only import events that are not yet stored; skip already-imported ones. */
    public const MODE_INCREMENTAL = 'incremental';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 20)]
    private string $status = self::STATUS_QUEUED;

    #[ORM\Column(length: 20, options: ['default' => self::MODE_FULL])]
    private string $mode = self::MODE_FULL;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $startedAt = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $finishedAt = null;

    #[ORM\Column(type: Types::INTEGER)]
    private int $totalTournaments = 0;

    #[ORM\Column(type: Types::INTEGER)]
    private int $totalEvents = 0;

    #[ORM\Column(type: Types::INTEGER)]
    private int $processedEvents = 0;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $currentLabel = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $error = null;

    /** OS process id of the detached worker, for diagnostics. */
    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $pid = null;

    /** @var Collection<int, ImportLog> */
    #[ORM\OneToMany(mappedBy: 'run', targetEntity: ImportLog::class, cascade: ['persist', 'remove'])]
    #[ORM\OrderBy(['id' => 'ASC'])]
    private Collection $logs;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->logs = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): self
    {
        $this->status = $status;

        return $this;
    }

    public function getMode(): string
    {
        return $this->mode;
    }

    public function isIncremental(): bool
    {
        return self::MODE_INCREMENTAL === $this->mode;
    }

    public function setMode(string $mode): self
    {
        $this->mode = self::MODE_INCREMENTAL === $mode
            ? self::MODE_INCREMENTAL
            : self::MODE_FULL;

        return $this;
    }

    public function isActive(): bool
    {
        return \in_array($this->status, [self::STATUS_QUEUED, self::STATUS_RUNNING], true);
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getStartedAt(): ?\DateTimeImmutable
    {
        return $this->startedAt;
    }

    public function markStarted(): self
    {
        $this->startedAt = new \DateTimeImmutable();
        $this->status = self::STATUS_RUNNING;

        return $this;
    }

    public function getFinishedAt(): ?\DateTimeImmutable
    {
        return $this->finishedAt;
    }

    public function markFinished(string $status): self
    {
        $this->finishedAt = new \DateTimeImmutable();
        $this->status = $status;

        return $this;
    }

    public function getTotalTournaments(): int
    {
        return $this->totalTournaments;
    }

    public function setTotalTournaments(int $totalTournaments): self
    {
        $this->totalTournaments = $totalTournaments;

        return $this;
    }

    public function getTotalEvents(): int
    {
        return $this->totalEvents;
    }

    public function setTotalEvents(int $totalEvents): self
    {
        $this->totalEvents = $totalEvents;

        return $this;
    }

    public function getProcessedEvents(): int
    {
        return $this->processedEvents;
    }

    public function incrementProcessedEvents(): self
    {
        ++$this->processedEvents;

        return $this;
    }

    public function getCurrentLabel(): ?string
    {
        return $this->currentLabel;
    }

    public function setCurrentLabel(?string $currentLabel): self
    {
        $this->currentLabel = $currentLabel;

        return $this;
    }

    public function getError(): ?string
    {
        return $this->error;
    }

    public function setError(?string $error): self
    {
        $this->error = $error;

        return $this;
    }

    public function getPid(): ?int
    {
        return $this->pid;
    }

    public function setPid(?int $pid): self
    {
        $this->pid = $pid;

        return $this;
    }

    /** @return Collection<int, ImportLog> */
    public function getLogs(): Collection
    {
        return $this->logs;
    }

    public function addLog(ImportLog $log): self
    {
        if (!$this->logs->contains($log)) {
            $this->logs->add($log);
        }

        return $this;
    }
}
