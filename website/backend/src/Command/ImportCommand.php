<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\ImportRun;
use App\Repository\ImportRunRepository;
use App\Service\Import\StartGgImporter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Runs the start.gg import. Invoked in the background by /admin (with an
 * existing --run-id) or manually for a synchronous run / cron.
 */
#[AsCommand(
    name: 'app:import',
    description: 'Discover the Turner Tuesday tournaments on start.gg and store their results in the database',
)]
final class ImportCommand extends Command
{
    public function __construct(
        private readonly StartGgImporter $importer,
        private readonly ImportRunRepository $runRepository,
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'run-id',
            null,
            InputOption::VALUE_REQUIRED,
            'Attach to an existing ImportRun (created by /admin). A new run is created when omitted.',
        );
        $this->addOption(
            'incremental',
            null,
            InputOption::VALUE_NONE,
            'Only import events that are not yet stored (skips already-imported events). Ignored when --run-id is given, as the mode is taken from the run.',
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $runIdOption = $input->getOption('run-id');

        if (null !== $runIdOption) {
            $run = $this->runRepository->find((int) $runIdOption);
            if (null === $run) {
                $io->error(sprintf('ImportRun %s not found.', $runIdOption));

                return Command::FAILURE;
            }
        } else {
            $run = new ImportRun();
            if (true === $input->getOption('incremental')) {
                $run->setMode(ImportRun::MODE_INCREMENTAL);
            }
            $this->em->persist($run);
            $this->em->flush();
        }

        $pid = getmypid();
        $run->setPid(false !== $pid ? $pid : null);
        $this->em->flush();

        $io->title(sprintf('start.gg import (run #%d, %s)', (int) $run->getId(), $run->getMode()));
        $this->importer->import($run);

        if (ImportRun::STATUS_COMPLETED === $run->getStatus()) {
            $io->success(sprintf(
                'Import completed: %d/%d events processed.',
                $run->getProcessedEvents(),
                $run->getTotalEvents(),
            ));

            return Command::SUCCESS;
        }

        $io->error('Import failed: '.($run->getError() ?? 'unknown error'));

        return Command::FAILURE;
    }
}
