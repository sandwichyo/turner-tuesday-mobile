<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SetResultRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * A single completed set between two German players. Sets involving a
 * non-German entrant are never stored (only German players are considered).
 *
 * Beyond the winner/loser pair the ranking needs, a set carries the bracket
 * context the event detail page renders: which round it belongs to and how it
 * ended. All of that is nullable — rows imported before it was collected keep
 * counting for the rankings, they just show no round or score.
 */
#[ORM\Entity(repositoryClass: SetResultRepository::class)]
#[ORM\Table(name: 'set_result')]
#[ORM\Index(name: 'idx_set_event', columns: ['event_id'])]
class SetResult
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Event::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Event $event;

    #[ORM\ManyToOne(targetEntity: Player::class)]
    #[ORM\JoinColumn(name: 'winner_id', nullable: false, onDelete: 'CASCADE')]
    private Player $winner;

    #[ORM\ManyToOne(targetEntity: Player::class)]
    #[ORM\JoinColumn(name: 'loser_id', nullable: false, onDelete: 'CASCADE')]
    private Player $loser;

    /** start.gg's own set id, kept as a string because preview sets use a compound id. */
    #[ORM\Column(length: 64, nullable: true)]
    private ?string $startggSetId = null;

    /** start.gg bracket round: positive in winners, negative in losers. */
    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $round = null;

    /** The spelled-out round, e.g. "Winners Quarter-Final". */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $roundText = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $phaseName = null;

    /** Games won by each side. Null when start.gg reports no score (e.g. a DQ). */
    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $winnerScore = null;

    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    private ?int $loserScore = null;

    /** start.gg's own rendering of the result, the fallback when there is no score. */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $displayScore = null;

    /** Position in start.gg's bracket order, so the detail page can rebuild it. */
    #[ORM\Column(type: Types::INTEGER, options: ['default' => 0])]
    private int $sortOrder = 0;

    public function __construct(Event $event, Player $winner, Player $loser)
    {
        $this->event = $event;
        $this->winner = $winner;
        $this->loser = $loser;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEvent(): Event
    {
        return $this->event;
    }

    public function getWinner(): Player
    {
        return $this->winner;
    }

    public function getLoser(): Player
    {
        return $this->loser;
    }

    public function getStartggSetId(): ?string
    {
        return $this->startggSetId;
    }

    public function setStartggSetId(?string $startggSetId): self
    {
        $this->startggSetId = $startggSetId;

        return $this;
    }

    public function getRound(): ?int
    {
        return $this->round;
    }

    public function setRound(?int $round): self
    {
        $this->round = $round;

        return $this;
    }

    public function getRoundText(): ?string
    {
        return $this->roundText;
    }

    public function setRoundText(?string $roundText): self
    {
        $this->roundText = $roundText;

        return $this;
    }

    public function getPhaseName(): ?string
    {
        return $this->phaseName;
    }

    public function setPhaseName(?string $phaseName): self
    {
        $this->phaseName = $phaseName;

        return $this;
    }

    public function getWinnerScore(): ?int
    {
        return $this->winnerScore;
    }

    public function getLoserScore(): ?int
    {
        return $this->loserScore;
    }

    /** Both scores are only meaningful together, so they are set as a pair. */
    public function setScores(?int $winnerScore, ?int $loserScore): self
    {
        $this->winnerScore = $winnerScore;
        $this->loserScore = $loserScore;

        return $this;
    }

    public function getDisplayScore(): ?string
    {
        return $this->displayScore;
    }

    public function setDisplayScore(?string $displayScore): self
    {
        $this->displayScore = $displayScore;

        return $this;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): self
    {
        $this->sortOrder = $sortOrder;

        return $this;
    }
}
