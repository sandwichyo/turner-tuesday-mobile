<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\Push\PushMessage;
use App\Service\Push\PushNotifier;
use App\Service\RankedDay\RankedDayCalculator;
use App\Service\RankedDay\RankedDayStatus;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Announces a running Slippi Free Ranked Day. Meant for cron: the command is
 * safe to run at any interval because it only sends while a window is open and
 * remembers the window it already announced.
 */
#[AsCommand(
    name: 'app:push:ranked-day',
    description: 'Notify subscribers when a Slippi Free Ranked Day is running',
)]
final class PushRankedDayCommand extends Command
{
    /** Remembers the last announced window so a rerun stays silent. */
    private const CACHE_KEY = 'push.ranked_day.last_window';

    private const TAG = 'ranked-day';

    /** Times in the message are shown where the players are, not in UTC. */
    private const DISPLAY_TIMEZONE = 'Europe/Berlin';

    public function __construct(
        private readonly RankedDayCalculator $calculator,
        private readonly PushNotifier $notifier,
        private readonly CacheItemPoolInterface $appCache,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('force', null, InputOption::VALUE_NONE, 'Send even outside a window or if it was already announced')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Only print what would be sent');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $force = true === $input->getOption('force');
        $dryRun = true === $input->getOption('dry-run');

        $status = $this->calculator->getStatus();
        $io->text(sprintf(
            'Fenster: %s bis %s (%s).',
            $this->formatLocal($status->startsAt),
            $this->formatLocal($status->endsAt),
            $status->active ? 'läuft' : 'noch nicht gestartet',
        ));

        if (!$status->active && !$force) {
            $io->info('Heute ist kein Ranked Day – nichts zu senden.');

            return Command::SUCCESS;
        }

        $marker = $this->appCache->getItem(self::CACHE_KEY);
        if (!$force && $marker->isHit() && $marker->get() === $status->windowId()) {
            $io->info('Für dieses Fenster wurde bereits benachrichtigt.');

            return Command::SUCCESS;
        }

        $message = new PushMessage(
            'Slippi Free Ranked Day',
            $this->buildBody($status),
            '/',
            self::TAG,
        );

        if ($dryRun) {
            $io->success(sprintf('Würde senden: "%s" – %s', $message->title, $message->body));

            return Command::SUCCESS;
        }

        if (!$this->notifier->isConfigured()) {
            $io->error('Es sind keine VAPID-Schlüssel konfiguriert. Zuerst "app:push:vapid-keys" ausführen.');

            return Command::FAILURE;
        }

        $result = $this->notifier->send($message);

        // Only a window that really went out is marked as done, so a failed run
        // (e.g. the push service was unreachable) is retried by the next cron.
        if ($result->sent > 0) {
            $marker->set($status->windowId());
            // Long enough to cover the whole window plus the gap to the next one.
            $marker->expiresAfter((RankedDayCalculator::CYCLE_DAYS + 1) * 86400);
            $this->appCache->save($marker);
        }

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

    /**
     * A running window ends today or tomorrow, so a weekday would only add
     * noise; the dated form is the fallback for `--force` outside a window.
     */
    private function buildBody(RankedDayStatus $status): string
    {
        $timezone = new \DateTimeZone(self::DISPLAY_TIMEZONE);
        $end = $status->endsAt->setTimezone($timezone);
        $today = new \DateTimeImmutable('today', $timezone);

        $day = match ($end->format('Y-m-d')) {
            $today->format('Y-m-d') => 'heute',
            $today->modify('+1 day')->format('Y-m-d') => 'morgen',
            default => $end->format('d.m.'),
        };

        return sprintf('Ranked ist für alle frei – noch bis %s um %s Uhr.', $day, $end->format('H:i'));
    }

    private function formatLocal(\DateTimeImmutable $moment): string
    {
        return $moment
            ->setTimezone(new \DateTimeZone(self::DISPLAY_TIMEZONE))
            ->format('d.m.Y H:i T');
    }
}
