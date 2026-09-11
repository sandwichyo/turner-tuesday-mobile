<?php

declare(strict_types=1);

namespace App\Service\Push;

use App\Entity\PushSubscription;
use App\Repository\PushSubscriptionRepository;
use Doctrine\ORM\EntityManagerInterface;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Nyholm\Psr7\Factory\Psr17Factory;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Psr18Client;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Sends Web Push notifications to every stored subscription.
 *
 * Authentication uses VAPID (a keypair this app owns, see `app:push:vapid-keys`);
 * the payload itself is encrypted for each subscriber individually, so the push
 * service only ever forwards opaque bytes.
 */
final class PushNotifier
{
    /** How long a push service should retry an undelivered message (2 days). */
    private const TTL = 172800;

    /** Errors reported back to the caller are capped so the UI stays readable. */
    private const MAX_REPORTED_ERRORS = 5;

    public function __construct(
        private readonly PushSubscriptionRepository $subscriptions,
        private readonly EntityManagerInterface $em,
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly string $vapidPublicKey,
        private readonly string $vapidPrivateKey,
        private readonly string $vapidSubject,
    ) {
    }

    public function isConfigured(): bool
    {
        return '' !== $this->vapidPublicKey && '' !== $this->vapidPrivateKey;
    }

    /**
     * The application server key the browser needs in `pushManager.subscribe()`.
     */
    public function getPublicKey(): ?string
    {
        return $this->isConfigured() ? $this->vapidPublicKey : null;
    }

    public function countSubscriptions(): int
    {
        return $this->subscriptions->countAll();
    }

    /**
     * Delivers the message to every stored subscription. Endpoints the push
     * service reports as gone are deleted, so the list stays self-cleaning.
     *
     * @throws \RuntimeException when no VAPID keypair is configured
     */
    public function send(PushMessage $message): PushSendResult
    {
        return $this->deliver($message, $this->subscriptions->findAllOrdered());
    }

    /**
     * Delivers the message to a single subscription — used by the /admin test
     * button, which must only reach the device that pressed it.
     *
     * @throws \RuntimeException when no VAPID keypair is configured
     */
    public function sendTo(PushMessage $message, PushSubscription $subscription): PushSendResult
    {
        return $this->deliver($message, [$subscription]);
    }

    /**
     * @param list<PushSubscription> $subscriptions
     */
    private function deliver(PushMessage $message, array $subscriptions): PushSendResult
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Es sind keine VAPID-Schlüssel konfiguriert (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).');
        }

        if ([] === $subscriptions) {
            return new PushSendResult();
        }

        $webPush = $this->createWebPush($message);
        $payload = $message->toJson();

        /** @var array<string, PushSubscription> $byEndpoint */
        $byEndpoint = [];
        foreach ($subscriptions as $subscription) {
            $byEndpoint[$subscription->getEndpoint()] = $subscription;

            $webPush->queueNotification(
                new Subscription(
                    $subscription->getEndpoint(),
                    $subscription->getPublicKey(),
                    $subscription->getAuthToken(),
                    $subscription->getContentEncoding(),
                ),
                $payload,
            );
        }

        $sent = 0;
        $failed = 0;
        $removed = 0;
        $errors = [];

        foreach ($webPush->flush() as $report) {
            $subscription = $byEndpoint[$report->getEndpoint()] ?? null;

            if ($report->isSuccess()) {
                ++$sent;
                $subscription?->markNotified();

                continue;
            }

            if ($report->isSubscriptionExpired()) {
                ++$removed;
                if (null !== $subscription) {
                    $this->em->remove($subscription);
                }
                $this->logger->info('Dropped an expired push subscription.', ['endpoint' => $report->getEndpoint()]);

                continue;
            }

            ++$failed;
            $subscription?->markFailed();
            $errors[] = $report->getReason();
            $this->logger->warning('Push delivery failed.', [
                'endpoint' => $report->getEndpoint(),
                'reason' => $report->getReason(),
            ]);
        }

        $this->em->flush();

        return new PushSendResult(
            $sent,
            $failed,
            $removed,
            \array_slice(array_values(array_unique($errors)), 0, self::MAX_REPORTED_ERRORS),
        );
    }

    private function createWebPush(PushMessage $message): WebPush
    {
        $psr17 = new Psr17Factory();
        $client = new Psr18Client(
            $this->httpClient->withOptions(['timeout' => 10, 'max_duration' => 30]),
            $psr17,
            $psr17,
        );

        $options = ['TTL' => self::TTL, 'urgency' => 'normal'];

        // A topic lets the push service collapse an undelivered older message
        // of the same kind instead of stacking duplicates on the device.
        if (null !== $message->tag && 1 === preg_match('/^[A-Za-z0-9_-]{1,32}$/', $message->tag)) {
            $options['topic'] = $message->tag;
        }

        $webPush = new WebPush(
            [
                'VAPID' => [
                    'subject' => $this->vapidSubject,
                    'publicKey' => $this->vapidPublicKey,
                    'privateKey' => $this->vapidPrivateKey,
                ],
            ],
            $options,
            $client,
            $psr17,
            $psr17,
            null,
            $this->logger,
        );

        // One signed VAPID header per push service instead of per notification.
        $webPush->setReuseVAPIDHeaders(true);

        return $webPush;
    }
}
