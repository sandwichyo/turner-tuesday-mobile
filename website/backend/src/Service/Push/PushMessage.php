<?php

declare(strict_types=1);

namespace App\Service\Push;

/**
 * One notification as it is handed to the service worker. The JSON produced
 * here is exactly what `public/sw.js` reads in its `push` handler.
 */
final readonly class PushMessage
{
    private const MAX_TITLE_LENGTH = 100;
    private const MAX_BODY_LENGTH = 400;

    public function __construct(
        public string $title,
        public string $body = '',
        public string $url = '/',
        public ?string $tag = null,
    ) {
    }

    /**
     * Builds a message from untrusted input (admin form / CLI options) and
     * rejects anything the service worker could not sensibly display.
     *
     * @throws \InvalidArgumentException
     */
    public static function fromInput(?string $title, ?string $body, ?string $url, ?string $tag = null): self
    {
        $title = trim((string) $title);
        $body = trim((string) $body);
        $url = trim((string) $url);
        $tag = null !== $tag ? trim($tag) : null;

        if ('' === $title) {
            throw new \InvalidArgumentException('Ein Titel ist erforderlich.');
        }
        if (mb_strlen($title) > self::MAX_TITLE_LENGTH) {
            throw new \InvalidArgumentException(sprintf('Der Titel darf höchstens %d Zeichen lang sein.', self::MAX_TITLE_LENGTH));
        }
        if (mb_strlen($body) > self::MAX_BODY_LENGTH) {
            throw new \InvalidArgumentException(sprintf('Der Text darf höchstens %d Zeichen lang sein.', self::MAX_BODY_LENGTH));
        }

        return new self($title, $body, self::normaliseUrl($url), '' !== (string) $tag ? $tag : null);
    }

    /**
     * Notifications may only deep-link into this app, so the click target is
     * reduced to a site-relative path.
     */
    private static function normaliseUrl(string $url): string
    {
        if ('' === $url) {
            return '/';
        }

        // Absolute URLs are accepted but stripped down to their path, which
        // keeps `notificationclick` inside the installed app's scope.
        $path = parse_url($url, \PHP_URL_PATH);
        $query = parse_url($url, \PHP_URL_QUERY);

        if (!\is_string($path) || '' === $path) {
            return '/';
        }

        return '/'.ltrim($path, '/').(null !== $query && '' !== $query ? '?'.$query : '');
    }

    /**
     * @return array<string, string>
     */
    public function toPayload(): array
    {
        $payload = [
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
        ];

        if (null !== $this->tag) {
            $payload['tag'] = $this->tag;
        }

        return $payload;
    }

    public function toJson(): string
    {
        return json_encode($this->toPayload(), \JSON_THROW_ON_ERROR | \JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES);
    }
}
