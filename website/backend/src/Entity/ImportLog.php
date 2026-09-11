<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ImportLogRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ImportLogRepository::class)]
#[ORM\Table(name: 'import_log')]
#[ORM\Index(name: 'idx_import_log_run', columns: ['run_id'])]
class ImportLog
{
    public const LEVEL_INFO = 'info';
    public const LEVEL_SUCCESS = 'success';
    public const LEVEL_WARNING = 'warning';
    public const LEVEL_ERROR = 'error';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: ImportRun::class, inversedBy: 'logs')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ImportRun $run;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(length: 20)]
    private string $level;

    #[ORM\Column(type: Types::TEXT)]
    private string $message;

    public function __construct(ImportRun $run, string $level, string $message)
    {
        $this->run = $run;
        $this->level = $level;
        $this->message = $message;
        $this->createdAt = new \DateTimeImmutable();
        $run->addLog($this);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getRun(): ImportRun
    {
        return $this->run;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getLevel(): string
    {
        return $this->level;
    }

    public function getMessage(): string
    {
        return $this->message;
    }
}
