<?php

declare(strict_types=1);

namespace App\Command;

use Minishlink\WebPush\VAPID;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Creates the VAPID keypair that identifies this app towards the push services.
 *
 * Run once per environment and keep the result: changing the public key
 * invalidates every existing browser subscription.
 */
#[AsCommand(
    name: 'app:push:vapid-keys',
    description: 'Generate a VAPID keypair for Web Push and print it as environment variables',
)]
final class PushVapidKeysCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $keys = VAPID::createVapidKeys();

        $io->title('VAPID-Schlüsselpaar');
        $io->writeln('VAPID_PUBLIC_KEY='.$keys['publicKey']);
        $io->writeln('VAPID_PRIVATE_KEY='.$keys['privateKey']);
        $io->newLine();
        $io->warning('Den privaten Schlüssel nur in die (nicht eingecheckte) .env bzw. in die Server-Umgebung übernehmen.');
        $io->note('Ein Wechsel des öffentlichen Schlüssels macht alle bestehenden Push-Anmeldungen ungültig.');

        return Command::SUCCESS;
    }
}
