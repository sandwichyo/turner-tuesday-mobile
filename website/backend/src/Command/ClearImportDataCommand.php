<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\Ranking\EventDataProvider;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Wipes imported ranking data so a fresh import can be tested. Development/test
 * helper: truncates the read-model tables (resetting their auto-increment ids)
 * and invalidates the ranking cache afterwards. The import history
 * (import_run / import_log) is kept unless --with-history is passed.
 */
#[AsCommand(
    name: 'app:import:clear',
    description: 'Delete imported ranking data (event, player, standing, set_result, character_selection) so imports can be re-tested',
)]
final class ClearImportDataCommand extends Command
{
    /** @var list<string> Imported ranking data. */
    private const DATA_TABLES = [
        'set_result',
        'standing',
        'character_selection',
        'event',
        'player',
    ];

    /** @var list<string> Import bookkeeping (child first). */
    private const HISTORY_TABLES = [
        'import_log',
        'import_run',
    ];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly EventDataProvider $eventDataProvider,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('with-history', null, InputOption::VALUE_NONE, 'Also clear the import history (import_run, import_log).')
            ->addOption('force', 'f', InputOption::VALUE_NONE, 'Skip the confirmation prompt.');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $tables = self::DATA_TABLES;
        if (true === $input->getOption('with-history')) {
            $tables = array_merge($tables, self::HISTORY_TABLES);
        }

        $connection = $this->em->getConnection();
        $platform = $connection->getDatabasePlatform();

        $rows = [];
        $total = 0;
        foreach ($tables as $table) {
            $quoted = $platform->quoteIdentifier($table);
            $count = (int) $connection->fetchOne('SELECT COUNT(*) FROM '.$quoted);
            $rows[] = [$table, $count];
            $total += $count;
        }

        $io->title('Clear imported data');
        $io->table(['Table', 'Rows'], $rows);

        if (0 === $total) {
            $io->success('Nothing to delete — the selected tables are already empty.');

            return Command::SUCCESS;
        }

        if (true !== $input->getOption('force')
            && !$io->confirm(sprintf('Delete %d rows across %d tables? This cannot be undone.', $total, \count($tables)), false)
        ) {
            $io->warning('Aborted — nothing was deleted.');

            return Command::SUCCESS;
        }

        $this->truncate($connection, $platform, $tables);
        $this->eventDataProvider->invalidate();

        $io->success(sprintf('Deleted %d rows. Ranking cache invalidated — ready for a fresh import.', $total));

        return Command::SUCCESS;
    }

    /**
     * @param list<string> $tables
     */
    private function truncate(Connection $connection, AbstractPlatform $platform, array $tables): void
    {
        // FK checks are disabled so referenced parent tables (event, player)
        // can be truncated regardless of order.
        $connection->executeStatement('SET FOREIGN_KEY_CHECKS = 0');

        try {
            foreach ($tables as $table) {
                $connection->executeStatement('TRUNCATE TABLE '.$platform->quoteIdentifier($table));
            }
        } finally {
            $connection->executeStatement('SET FOREIGN_KEY_CHECKS = 1');
        }
    }
}
