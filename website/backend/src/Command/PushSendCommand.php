<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\Push\PushMessage;
use App\Service\Push\PushNotifier;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Sends a push notification to everyone who opted in. Same code path as the
 * /admin form, so it can be wired to cron (e.g. the weekly Turner Tuesday
 * reminder) without going through the UI.
 */
#[AsCommand(
    name: 'app:push:send',
    description: 'Send a push notification to all subscribed browsers',
)]
final class PushSendCommand extends Command
{
    public function __construct(private readonly PushNotifier $notifier)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('title', null, InputOption::VALUE_REQUIRED, 'Notification headline')
            ->addOption('body', null, InputOption::VALUE_REQUIRED, 'Notification text', '')
            ->addOption('url', null, InputOption::VALUE_REQUIRED, 'Path opened on click', '/')
            ->addOption('tag', null, InputOption::VALUE_REQUIRED, 'Groups/replaces earlier notifications of the same kind');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        if (!$this->notifier->isConfigured()) {
            $io->error('Es sind keine VAPID-Schlüssel konfiguriert. Zuerst "app:push:vapid-keys" ausführen.');

            return Command::FAILURE;
        }

        try {
            $message = PushMessage::fromInput(
                $input->getOption('title'),
                $input->getOption('body'),
                $input->getOption('url'),
                $input->getOption('tag'),
            );
        } catch (\InvalidArgumentException $exception) {
            $io->error($exception->getMessage());

            return Command::INVALID;
        }

        $result = $this->notifier->send($message);

        $io->success(sprintf(
            '%d zugestellt, %d fehlgeschlagen, %d abgelaufene Anmeldungen entfernt.',
            $result->sent,
            $result->failed,
            $result->removed,
        ));

        foreach ($result->errors as $error) {
            $io->warning($error);
        }

        return $result->failed > 0 ? Command::FAILURE : Command::SUCCESS;
    }
}
