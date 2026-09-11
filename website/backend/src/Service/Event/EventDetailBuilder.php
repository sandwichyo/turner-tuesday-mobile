<?php

declare(strict_types=1);

namespace App\Service\Event;

/**
 * Turns one series entry (see EventDataProvider) into the shape the event
 * detail page renders: the event itself, its final standings and its sets
 * grouped back into the rounds of the bracket they were played in.
 *
 * The rounds come out in the order the page reads them from top to bottom —
 * the last set of the tournament first, the pools last — and the two halves of
 * one bracket step (Winners Final and Losers Final, say) share a `stage` so the
 * page can put them next to each other.
 *
 * Sets imported before the bracket context was collected carry no round and no
 * score; they end up in one unnamed group instead of disappearing.
 */
final class EventDetailBuilder
{
    private const string STARTGG_BASE_URL = 'https://www.start.gg/';
    private const string UNKNOWN_ROUND_LABEL = 'Weitere Sets';

    /**
     * The named steps of a bracket, top to bottom. Winners and losers of one
     * step share the stage key, which is what pairs them into one row.
     *
     * @var array<string, int>
     */
    private const array STAGE_RANKS = [
        'grand-final-reset' => 0,
        'grand-final' => 1,
        'final' => 2,
        'semi-final' => 3,
        'quarter-final' => 4,
    ];

    /** Numbered bracket rounds ("Winners Round 2"), latest first. */
    private const int RANK_BRACKET_ROUND = 5;

    /** Anything else start.gg named but we do not recognise. */
    private const int RANK_OTHER = 6;

    /** Pools ("Round 1"), below the bracket, highest round first. */
    private const int RANK_POOLS = 7;

    /** Sets without any round at all. */
    private const int RANK_UNKNOWN = 8;

    /** Winners above losers whenever both sides sit in the same row. */
    private const array BRACKET_ORDER = ['winners' => 0, 'losers' => 1, 'other' => 2];

    /**
     * @param array<string, mixed> $entry
     *
     * @return array{
     *     event: array<string, mixed>,
     *     standings: list<array<string, mixed>>,
     *     rounds: list<array<string, mixed>>,
     *     totals: array{sets: int, games: int, players: int}
     * }
     */
    public function build(array $entry): array
    {
        /** @var array<string, mixed> $summary */
        $summary = \is_array($entry['summary'] ?? null) ? $entry['summary'] : [];
        /** @var list<array<string, mixed>> $standings */
        $standings = \is_array($entry['standings'] ?? null) ? array_values($entry['standings']) : [];
        /** @var list<array<string, mixed>> $sets */
        $sets = \is_array($entry['sets'] ?? null) ? array_values($entry['sets']) : [];

        $groups = [];
        $games = 0;

        foreach ($sets as $set) {
            $view = $this->buildSet($set);
            $games += $view['games'];

            $phaseName = $view['phaseName'];
            $roundText = $view['roundText'];
            $key = ($phaseName ?? '').'|'.($roundText ?? '');

            if (!isset($groups[$key])) {
                $place = $this->placeRound($phaseName, $roundText, $view['sortOrder']);

                $groups[$key] = [
                    'key' => $key,
                    'label' => $roundText ?? self::UNKNOWN_ROUND_LABEL,
                    'phase' => $phaseName,
                    // A pool has no winners or losers side, whatever start.gg's
                    // round number says.
                    'bracket' => $place['pools'] ? 'other' : $this->bracketSide($view['round']),
                    'stage' => $place['stage'],
                    'rank' => $place['rank'],
                    'tiebreak' => $place['tiebreak'],
                    'order' => $view['sortOrder'],
                    'sets' => [],
                ];
            }

            // Within a round, start.gg's own order decides — the earliest set
            // also decides where two otherwise equal rounds sit.
            $groups[$key]['order'] = min($groups[$key]['order'], $view['sortOrder']);
            $groups[$key]['sets'][] = $view;
        }

        uasort($groups, $this->compareRounds(...));

        $rounds = array_values(array_map(static function (array $group): array {
            usort(
                $group['sets'],
                static fn (array $a, array $b): int => $a['sortOrder'] <=> $b['sortOrder'],
            );

            return [
                'key' => $group['key'],
                'label' => $group['label'],
                'phase' => $group['phase'],
                'bracket' => $group['bracket'],
                'stage' => $group['stage'],
                'sets' => array_values($group['sets']),
            ];
        }, $groups));

        return [
            'event' => $summary + ['startggUrl' => $this->startggUrl($summary)],
            'standings' => $standings,
            'rounds' => $rounds,
            'totals' => [
                'sets' => \count($sets),
                'games' => $games,
                'players' => \count($standings),
            ],
        ];
    }

    /**
     * @param array<string, mixed> $set
     *
     * @return array<string, mixed>
     */
    private function buildSet(array $set): array
    {
        $charactersByPlayer = [];
        foreach (\is_array($set['characters'] ?? null) ? $set['characters'] : [] as $pick) {
            if (!\is_array($pick)) {
                continue;
            }

            $charactersByPlayer[(string) ($pick['playerId'] ?? '')][] = [
                'characterId' => (int) ($pick['characterId'] ?? 0),
                'characterName' => (string) ($pick['characterName'] ?? ''),
                'games' => (int) ($pick['games'] ?? 0),
            ];
        }

        $winnerScore = \is_int($set['winnerScore'] ?? null) ? $set['winnerScore'] : null;
        $loserScore = \is_int($set['loserScore'] ?? null) ? $set['loserScore'] : null;

        return [
            'setId' => (int) ($set['setId'] ?? 0),
            'round' => \is_int($set['round'] ?? null) ? $set['round'] : null,
            'roundText' => $this->nullableString($set['roundText'] ?? null),
            'phaseName' => $this->nullableString($set['phaseName'] ?? null),
            'sortOrder' => (int) ($set['sortOrder'] ?? 0),
            'displayScore' => $this->nullableString($set['displayScore'] ?? null),
            'games' => null !== $winnerScore && null !== $loserScore ? $winnerScore + $loserScore : 0,
            'winner' => $this->side(
                (string) ($set['winnerPlayerId'] ?? ''),
                (string) ($set['winnerName'] ?? ''),
                $winnerScore,
                $charactersByPlayer,
            ),
            'loser' => $this->side(
                (string) ($set['loserPlayerId'] ?? ''),
                (string) ($set['loserName'] ?? ''),
                $loserScore,
                $charactersByPlayer,
            ),
        ];
    }

    /**
     * @param array<string, list<array<string, mixed>>> $charactersByPlayer
     *
     * @return array<string, mixed>
     */
    private function side(
        string $playerId,
        string $displayName,
        ?int $score,
        array $charactersByPlayer,
    ): array {
        return [
            'playerId' => $playerId,
            'displayName' => '' !== $displayName ? $displayName : 'Unknown player',
            'score' => $score,
            'characters' => $charactersByPlayer[$playerId] ?? [],
        ];
    }

    /**
     * @param array<string, mixed> $left
     * @param array<string, mixed> $right
     */
    private function compareRounds(array $left, array $right): int
    {
        return [$left['rank'], $left['tiebreak'], self::BRACKET_ORDER[$left['bracket']], $left['order']]
            <=> [$right['rank'], $right['tiebreak'], self::BRACKET_ORDER[$right['bracket']], $right['order']];
    }

    /**
     * Where one round belongs on the page. `rank` and `tiebreak` sort the
     * rounds from the grand final down to the pools; `stage` is shared by the
     * winners and the losers round of the same bracket step.
     *
     * @return array{stage: string, rank: int, tiebreak: int, pools: bool}
     */
    private function placeRound(?string $phaseName, ?string $roundText, int $sortOrder): array
    {
        if (null === $roundText) {
            return [
                'stage' => 'unknown|'.($phaseName ?? ''),
                'rank' => self::RANK_UNKNOWN,
                'tiebreak' => $sortOrder,
                'pools' => false,
            ];
        }

        // "Winners Semi-Final" and "Losers Semi-Final" are the same step of the
        // bracket, so the side is stripped before the step is named.
        $text = $this->normalizeRoundText($roundText);
        $side = null;
        if (1 === preg_match('/^(winners|losers)(?: bracket)? (.+)$/', $text, $matches)) {
            $side = $matches[1];
            $text = $matches[2];
        }

        $stage = match ($text) {
            'grand final reset' => 'grand-final-reset',
            'grand final' => 'grand-final',
            'final', 'finals' => 'final',
            'semi final', 'semi finals', 'semis' => 'semi-final',
            'quarter final', 'quarter finals', 'quarters' => 'quarter-final',
            default => null,
        };

        if (null !== $stage) {
            return [
                'stage' => $stage,
                'rank' => self::STAGE_RANKS[$stage],
                'tiebreak' => 0,
                'pools' => false,
            ];
        }

        $round = 1 === preg_match('/^round (\d+)$/', $text, $matches) ? (int) $matches[1] : null;

        // A bare "Round 3" is a pool; only a side turns it into a bracket round.
        if (null === $side && (null !== $round || $this->isPoolsPhase($phaseName))) {
            return [
                'stage' => 'pools|'.($phaseName ?? '').'|'.$roundText,
                'rank' => self::RANK_POOLS,
                'tiebreak' => null !== $round ? -$round : $sortOrder,
                'pools' => true,
            ];
        }

        if (null !== $round) {
            return [
                'stage' => 'round-'.$round,
                'rank' => self::RANK_BRACKET_ROUND,
                'tiebreak' => -$round,
                'pools' => false,
            ];
        }

        return [
            'stage' => 'other|'.($phaseName ?? '').'|'.$roundText,
            'rank' => self::RANK_OTHER,
            'tiebreak' => $sortOrder,
            'pools' => false,
        ];
    }

    /** Lower case, punctuation out — "Semi-Final" and "Semi Final" are one name. */
    private function normalizeRoundText(string $roundText): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower($roundText)) ?? '');
    }

    private function isPoolsPhase(?string $phaseName): bool
    {
        return null !== $phaseName && str_contains(strtolower($phaseName), 'pool');
    }

    /** Which half of a double-elimination bracket a round belongs to. */
    private function bracketSide(?int $round): string
    {
        if (null === $round || 0 === $round) {
            return 'other';
        }

        return $round > 0 ? 'winners' : 'losers';
    }

    /**
     * @param array<string, mixed> $summary
     */
    private function startggUrl(array $summary): ?string
    {
        $slug = $this->nullableString($summary['eventSlug'] ?? null)
            ?? $this->nullableString($summary['tournamentSlug'] ?? null);

        return null !== $slug ? self::STARTGG_BASE_URL.$slug : null;
    }

    private function nullableString(mixed $value): ?string
    {
        if (!\is_string($value)) {
            return null;
        }

        $value = trim($value);

        return '' !== $value ? $value : null;
    }
}
