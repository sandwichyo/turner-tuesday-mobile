<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PushSubscriptionRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * A browser push endpoint handed to us by the Push API. One row per installed
 * app / browser profile that opted in; the push service revokes an endpoint by
 * answering 404/410, which is when we drop the row again.
 */
#[ORM\Entity(repositoryClass: PushSubscriptionRepository::class)]
#[ORM\Table(name: 'push_subscription')]
#[ORM\UniqueConstraint(name: 'uniq_push_subscription_endpoint', columns: ['endpoint_hash'])]
class PushSubscription
{
    /** RFC 8291 payload encryption — what every current browser negotiates. */
    public const ENCODING_AES128GCM = 'aes128gcm';
    /** Pre-standard encoding, still spoken by very old Chrome/Firefox builds. */
    public const ENCODING_AESGCM = 'aesgcm';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** Push service URL. Too long for an index, hence the hash column below. */
    #[ORM\Column(type: Types::TEXT)]
    private string $endpoint;

    /** sha256 of the endpoint — the actual uniqueness key. */
    #[ORM\Column(length: 64)]
    private string $endpointHash;

    /** Subscriber's P-256 public key (base64url), `keys.p256dh` in the browser. */
    #[ORM\Column(length: 255)]
    private string $publicKey;

    /** Subscriber's auth secret (base64url), `keys.auth` in the browser. */
    #[ORM\Column(length: 255)]
    private string $authToken;

    #[ORM\Column(length: 20, options: ['default' => self::ENCODING_AES128GCM])]
    private string $contentEncoding = self::ENCODING_AES128GCM;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $userAgent = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $updatedAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $lastNotifiedAt = null;

    /** Consecutive delivery failures that were not an outright expiry. */
    #[ORM\Column(type: Types::INTEGER, options: ['default' => 0])]
    private int $failureCount = 0;

    public function __construct(string $endpoint)
    {
        $this->endpoint = $endpoint;
        $this->endpointHash = self::hashEndpoint($endpoint);
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = $this->createdAt;
    }

    public static function hashEndpoint(string $endpoint): string
    {
        return hash('sha256', $endpoint);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEndpoint(): string
    {
        return $this->endpoint;
    }

    public function getEndpointHash(): string
    {
        return $this->endpointHash;
    }

    public function getPublicKey(): string
    {
        return $this->publicKey;
    }

    public function setPublicKey(string $publicKey): self
    {
        $this->publicKey = $publicKey;

        return $this;
    }

    public function getAuthToken(): string
    {
        return $this->authToken;
    }

    public function setAuthToken(string $authToken): self
    {
        $this->authToken = $authToken;

        return $this;
    }

    public function getContentEncoding(): string
    {
        return $this->contentEncoding;
    }

    public function setContentEncoding(string $contentEncoding): self
    {
        $this->contentEncoding = self::ENCODING_AESGCM === $contentEncoding
            ? self::ENCODING_AESGCM
            : self::ENCODING_AES128GCM;

        return $this;
    }

    public function getUserAgent(): ?string
    {
        return $this->userAgent;
    }

    public function setUserAgent(?string $userAgent): self
    {
        $this->userAgent = null !== $userAgent
            ? mb_substr($userAgent, 0, 255)
            : null;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function touch(): self
    {
        $this->updatedAt = new \DateTimeImmutable();

        return $this;
    }

    public function getLastNotifiedAt(): ?\DateTimeImmutable
    {
        return $this->lastNotifiedAt;
    }

    public function markNotified(): self
    {
        $this->lastNotifiedAt = new \DateTimeImmutable();
        $this->failureCount = 0;

        return $this;
    }

    public function getFailureCount(): int
    {
        return $this->failureCount;
    }

    public function markFailed(): self
    {
        ++$this->failureCount;

        return $this;
    }
}
