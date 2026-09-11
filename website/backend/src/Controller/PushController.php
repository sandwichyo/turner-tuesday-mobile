<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\PushSubscription;
use App\Repository\PushSubscriptionRepository;
use App\Security\AdminAccess;
use App\Service\Push\PushMessage;
use App\Service\Push\PushNotifier;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Web Push endpoints: the public ones let a visitor opt in or out from the
 * browser, sending is restricted to the admin session established on /admin.
 */
final class PushController
{
    private const MAX_ENDPOINT_LENGTH = 1000;
    private const MAX_KEY_LENGTH = 255;

    public function __construct(
        private readonly PushNotifier $notifier,
        private readonly PushSubscriptionRepository $subscriptions,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * The VAPID application server key, needed by `pushManager.subscribe()`.
     */
    #[Route('/api/push/public-key', name: 'api_push_public_key', methods: ['GET'])]
    public function publicKey(): JsonResponse
    {
        return new JsonResponse([
            'configured' => $this->notifier->isConfigured(),
            'publicKey' => $this->notifier->getPublicKey(),
        ]);
    }

    #[Route('/api/push/subscribe', name: 'api_push_subscribe', methods: ['POST'])]
    public function subscribe(Request $request): JsonResponse
    {
        $payload = $this->decodeBody($request);
        if (null === $payload) {
            return new JsonResponse(['error' => 'Ungültige Anfrage.'], Response::HTTP_BAD_REQUEST);
        }

        $endpoint = \is_string($payload['endpoint'] ?? null) ? trim($payload['endpoint']) : '';
        $keys = \is_array($payload['keys'] ?? null) ? $payload['keys'] : [];
        $publicKey = \is_string($keys['p256dh'] ?? null) ? $keys['p256dh'] : '';
        $authToken = \is_string($keys['auth'] ?? null) ? $keys['auth'] : '';

        $error = $this->validateSubscription($endpoint, $publicKey, $authToken);
        if (null !== $error) {
            return new JsonResponse(['error' => $error], Response::HTTP_BAD_REQUEST);
        }

        $subscription = $this->subscriptions->findOneByEndpoint($endpoint) ?? new PushSubscription($endpoint);
        $subscription
            ->setPublicKey($publicKey)
            ->setAuthToken($authToken)
            ->setContentEncoding(\is_string($payload['contentEncoding'] ?? null)
                ? $payload['contentEncoding']
                : PushSubscription::ENCODING_AES128GCM)
            ->setUserAgent($request->headers->get('User-Agent'))
            ->touch();

        $this->em->persist($subscription);

        try {
            $this->em->flush();
        } catch (UniqueConstraintViolationException) {
            // Two parallel subscribe calls for the same endpoint — the row the
            // other request wrote is just as good as ours.
            $this->em->clear();
        }

        return new JsonResponse(['subscribed' => true]);
    }

    #[Route('/api/push/unsubscribe', name: 'api_push_unsubscribe', methods: ['POST'])]
    public function unsubscribe(Request $request): JsonResponse
    {
        $payload = $this->decodeBody($request);
        $endpoint = \is_string($payload['endpoint'] ?? null) ? trim($payload['endpoint']) : '';

        if ('' === $endpoint) {
            return new JsonResponse(['error' => 'Ungültige Anfrage.'], Response::HTTP_BAD_REQUEST);
        }

        $subscription = $this->subscriptions->findOneByEndpoint($endpoint);
        if (null !== $subscription) {
            $this->em->remove($subscription);
            $this->em->flush();
        }

        return new JsonResponse(['subscribed' => false]);
    }

    /**
     * Broadcasts a notification to every stored subscription. Admin-only, using
     * the same session flag as the import endpoints.
     */
    #[Route('/api/push/send', name: 'api_push_send', methods: ['POST'])]
    public function send(Request $request): JsonResponse
    {
        if (!AdminAccess::isGranted($request)) {
            return new JsonResponse(['error' => 'Nicht berechtigt.'], Response::HTTP_FORBIDDEN);
        }

        $payload = $this->decodeBody($request);
        if (null === $payload) {
            return new JsonResponse(['error' => 'Ungültige Anfrage.'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $message = PushMessage::fromInput(
                $payload['title'] ?? null,
                $payload['body'] ?? null,
                $payload['url'] ?? null,
                \is_string($payload['tag'] ?? null) ? $payload['tag'] : null,
            );
        } catch (\InvalidArgumentException $exception) {
            return new JsonResponse(['error' => $exception->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        try {
            $result = $this->notifier->send($message);
        } catch (\RuntimeException $exception) {
            return new JsonResponse(['error' => $exception->getMessage()], Response::HTTP_CONFLICT);
        } catch (\Throwable $exception) {
            $this->logger->error('Push broadcast failed.', ['exception' => $exception]);

            return new JsonResponse(
                ['error' => 'Die Nachricht konnte nicht versendet werden.'],
                Response::HTTP_INTERNAL_SERVER_ERROR,
            );
        }

        return new JsonResponse($result->toArray() + [
            'subscriptions' => $this->notifier->countSubscriptions(),
        ]);
    }

    /**
     * Sends one notification to the calling device only, so the admin can check
     * how a message looks before broadcasting it. The endpoint comes from the
     * caller's own `pushManager` subscription and must already be stored here.
     */
    #[Route('/api/push/test', name: 'api_push_test', methods: ['POST'])]
    public function test(Request $request): JsonResponse
    {
        if (!AdminAccess::isGranted($request)) {
            return new JsonResponse(['error' => 'Nicht berechtigt.'], Response::HTTP_FORBIDDEN);
        }

        $payload = $this->decodeBody($request);
        if (null === $payload) {
            return new JsonResponse(['error' => 'Ungültige Anfrage.'], Response::HTTP_BAD_REQUEST);
        }

        $endpoint = \is_string($payload['endpoint'] ?? null) ? trim($payload['endpoint']) : '';
        $subscription = '' !== $endpoint ? $this->subscriptions->findOneByEndpoint($endpoint) : null;

        if (null === $subscription) {
            return new JsonResponse(
                ['error' => 'Dieses Gerät ist nicht für Benachrichtigungen angemeldet. Zuerst oben in der Navigation die Glocke aktivieren.'],
                Response::HTTP_CONFLICT,
            );
        }

        // An empty form still gives something to look at; a filled one is
        // previewed exactly as it would be broadcast.
        $title = \is_string($payload['title'] ?? null) ? trim($payload['title']) : '';
        $isPreview = '' !== $title;

        try {
            $message = $isPreview
                ? PushMessage::fromInput(
                    $title,
                    $payload['body'] ?? null,
                    $payload['url'] ?? null,
                    \is_string($payload['tag'] ?? null) ? $payload['tag'] : null,
                )
                : new PushMessage(
                    'Test: Turner Tuesdays',
                    'Wenn du das liest, kommen Benachrichtigungen auf diesem Gerät an.',
                    '/',
                    'push-test',
                );
        } catch (\InvalidArgumentException $exception) {
            return new JsonResponse(['error' => $exception->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        try {
            $result = $this->notifier->sendTo($message, $subscription);
        } catch (\RuntimeException $exception) {
            return new JsonResponse(['error' => $exception->getMessage()], Response::HTTP_CONFLICT);
        } catch (\Throwable $exception) {
            $this->logger->error('Push test failed.', ['exception' => $exception]);

            return new JsonResponse(
                ['error' => 'Die Testnachricht konnte nicht versendet werden.'],
                Response::HTTP_INTERNAL_SERVER_ERROR,
            );
        }

        return new JsonResponse($result->toArray() + [
            'subscriptions' => $this->notifier->countSubscriptions(),
            'preview' => $isPreview,
        ]);
    }

    private function validateSubscription(string $endpoint, string $publicKey, string $authToken): ?string
    {
        if ('' === $endpoint || \strlen($endpoint) > self::MAX_ENDPOINT_LENGTH) {
            return 'Ungültiger Push-Endpunkt.';
        }
        if ('https' !== parse_url($endpoint, \PHP_URL_SCHEME)) {
            return 'Push-Endpunkte müssen über https erreichbar sein.';
        }
        foreach ([$publicKey, $authToken] as $key) {
            if ('' === $key
                || \strlen($key) > self::MAX_KEY_LENGTH
                || 1 !== preg_match('/^[A-Za-z0-9_-]+=*$/', $key)
            ) {
                return 'Ungültige Verschlüsselungsschlüssel.';
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeBody(Request $request): ?array
    {
        $content = $request->getContent();
        if ('' === $content) {
            return null;
        }

        try {
            $decoded = json_decode($content, true, 8, \JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        return \is_array($decoded) ? $decoded : null;
    }
}
