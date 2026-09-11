<?php

declare(strict_types=1);

namespace App\Service;

use RuntimeException;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

final class StartGgClient
{
    private const AUTHORIZATION_URL = 'https://start.gg/oauth/authorize';
    private const ACCESS_TOKEN_URL = 'https://api.start.gg/oauth/access_token';
    private const REFRESH_TOKEN_URL = 'https://api.start.gg/oauth/refresh';
    private const GRAPHQL_URL = 'https://api.start.gg/gql/alpha';

    // start.gg enforces ~80 requests/minute (~1.33 req/s); 800 ms between requests keeps us safely under that limit.
    private const BATCH_REQUEST_DELAY_MICROSECONDS = 800_000;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly ?string $clientId,
        private readonly ?string $clientSecret,
        private readonly ?string $redirectUri,
        private readonly ?string $scopes = null,
        private readonly ?string $frontendAppUrl = null,
        private readonly ?string $tokenStorePath = null,
    ) {
    }

    public function isConfigured(): bool
    {
        return '' !== trim((string) $this->clientId)
            && '' !== trim((string) $this->clientSecret)
            && '' !== trim((string) $this->redirectUri);
    }

    public function getAuthorizationUrl(?string $state = null): string
    {
        $this->assertConfigured();

        $query = [
            'response_type' => 'code',
            'client_id' => $this->clientId,
            'scope' => $this->getScopesAsString(),
            'redirect_uri' => $this->redirectUri,
        ];

        if (null !== $state && '' !== $state) {
            $query['state'] = $state;
        }

        return self::AUTHORIZATION_URL.'?'.http_build_query($query, '', '&', \PHP_QUERY_RFC3986);
    }

    /**
     * @return list<string>
     */
    public function getScopes(): array
    {
        $scopes = preg_split('/\s+/', trim($this->getScopesAsString()));

        if (false === $scopes) {
            return [];
        }

        return array_values(array_filter($scopes, static fn (string $scope): bool => '' !== $scope));
    }

    public function getFrontendAppUrl(): string
    {
        return '' !== trim($this->frontendAppUrl) ? rtrim($this->frontendAppUrl, '/') : 'http://localhost:3000';
    }

    public function getFrontendOrigin(): ?string
    {
        $frontendAppUrl = $this->getFrontendAppUrl();
        $parts = parse_url($frontendAppUrl);

        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        $origin = $parts['scheme'].'://'.$parts['host'];

        if (isset($parts['port'])) {
            $origin .= ':'.$parts['port'];
        }

        return $origin;
    }

    /**
     * @return array{
     *     configured: bool,
     *     authenticated: bool,
     *     expiresAt: ?int,
     *     scopes: list<string>,
     *     connectUrl: ?string
     * }
     */
    public function getStatus(): array
    {
        $tokens = $this->readStoredTokens();
        $authenticated = is_array($tokens) && !empty($tokens['access_token']);

        return [
            'configured' => $this->isConfigured(),
            'authenticated' => $authenticated,
            'expiresAt' => $authenticated ? (int) ($tokens['expires_at'] ?? 0) : null,
            'scopes' => $this->getScopes(),
            'connectUrl' => $this->isConfigured() ? '/api/startgg/oauth/connect' : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function exchangeAuthorizationCode(string $code): array
    {
        $this->assertConfigured();

        $payload = $this->requestJson('POST', self::ACCESS_TOKEN_URL, [
            'body' => [
                'client_id' => $this->clientId,
                'client_secret' => $this->clientSecret,
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => $this->redirectUri,
                'scope' => $this->getScopesAsString(),
            ],
        ]);

        return $this->storeTokens($payload);
    }

    public function clearTokens(): void
    {
        $tokenStorePath = $this->getTokenStorePath();

        if (is_file($tokenStorePath)) {
            @unlink($tokenStorePath);
        }
    }

    /**
     * @param array<string, mixed> $variables
     *
     * @return array<string, mixed>
     */
    public function query(string $query, array $variables = [], ?string $operationName = null): array
    {
        return $this->resolveGraphQlResponse(
            $this->createGraphQlRequest($query, $variables, $operationName),
        );
    }

    /**
     * Execute multiple GraphQL queries concurrently in chunks to avoid rate limiting.
     *
     * @param list<array{query: string, variables?: array<string, mixed>}> $queries
     *
     * @return list<array<string, mixed>>
     */
    public function queryBatch(array $queries): array
    {
        if ([] === $queries) {
            return [];
        }

        $accessToken = $this->getValidAccessToken();
        $results = [];

        foreach ($queries as $index => $q) {
            if ($index > 0) {
                usleep(self::BATCH_REQUEST_DELAY_MICROSECONDS);
            }

            $results[] = $this->resolveGraphQlResponse(
                $this->createGraphQlRequest($q['query'], $q['variables'] ?? [], null, $accessToken),
            );
        }

        return $results;
    }

    private function createGraphQlRequest(string $query, array $variables = [], ?string $operationName = null, ?string $accessToken = null): ResponseInterface
    {
        $payload = ['query' => $query, 'variables' => $variables];

        if (null !== $operationName) {
            $payload['operationName'] = $operationName;
        }

        return $this->httpClient->request('POST', self::GRAPHQL_URL, [
            'headers' => [
                'Authorization' => 'Bearer '.($accessToken ?? $this->getValidAccessToken()),
                'Content-Type' => 'application/json',
            ],
            'json' => $payload,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function resolveGraphQlResponse(ResponseInterface $response): array
    {
        $statusCode = $response->getStatusCode();
        $content = $response->getContent(false);

        if ('' === $content) {
            return [];
        }

        $data = json_decode($content, true);

        if ($statusCode >= 400) {
            if (is_array($data)) {
                $message = $data['message'] ?? $data['error_description'] ?? $data['error'] ?? sprintf('start.gg responded with HTTP %d.', $statusCode);
            } else {
                $message = is_string($data) ? $data : sprintf('start.gg responded with HTTP %d.', $statusCode);
            }
            throw new RuntimeException((string) $message);
        }

        if (!is_array($data)) {
            throw new RuntimeException(sprintf(
                'Received an invalid JSON response from start.gg. Status: %d. Body: %s',
                $statusCode,
                substr($content, 0, 1000),
            ));
        }

        if (isset($data['errors']) && is_array($data['errors'])) {
            throw new RuntimeException($this->formatGraphQlErrors($data['errors']));
        }

        return is_array($data['data'] ?? null) ? $data['data'] : [];
    }

    private function assertConfigured(): void
    {
        if ($this->isConfigured()) {
            return;
        }

        throw new RuntimeException('start.gg OAuth is not configured. Set START_GG_CLIENT_ID, START_GG_CLIENT_SECRET, and START_GG_REDIRECT_URI.');
    }

    private function getScopesAsString(): string
    {
        return '' !== trim($this->scopes) ? trim($this->scopes) : 'user.identity';
    }

    private function getValidAccessToken(): string
    {
        $tokens = $this->readStoredTokens();

        if (!is_array($tokens) || empty($tokens['access_token'])) {
            throw new RuntimeException('Not authenticated with start.gg yet.');
        }

        $expiresAt = (int) ($tokens['expires_at'] ?? 0);

        if ($expiresAt > time() + 60) {
            return (string) $tokens['access_token'];
        }

        $refreshToken = (string) ($tokens['refresh_token'] ?? '');

        if ('' === $refreshToken) {
            throw new RuntimeException('The start.gg session expired and no refresh token is available. Please connect again.');
        }

        $refreshedTokens = $this->requestJson('POST', self::REFRESH_TOKEN_URL, [
            'body' => [
                'grant_type' => 'refresh_token',
                'refresh_token' => $refreshToken,
                'scope' => $this->getScopesAsString(),
                'client_id' => $this->clientId,
                'client_secret' => $this->clientSecret,
                'redirect_uri' => $this->redirectUri,
            ],
        ]);

        return (string) $this->storeTokens($refreshedTokens, $refreshToken)['access_token'];
    }

    /**
     * @param array<string, mixed> $payload
     * @param ?string $fallbackRefreshToken
     *
     * @return array<string, mixed>
     */
    private function storeTokens(array $payload, ?string $fallbackRefreshToken = null): array
    {
        if (!isset($payload['access_token']) || !is_string($payload['access_token']) || '' === $payload['access_token']) {
            throw new RuntimeException('No access token was returned by start.gg.');
        }

        $refreshToken = (string) ($payload['refresh_token'] ?? '');

        if ('' === $refreshToken && null !== $fallbackRefreshToken) {
            $refreshToken = trim($fallbackRefreshToken);
        }

        $normalized = [
            'access_token' => $payload['access_token'],
            'refresh_token' => $refreshToken,
            'token_type' => (string) ($payload['token_type'] ?? 'Bearer'),
            'scope' => (string) ($payload['scope'] ?? $this->getScopesAsString()),
            'expires_in' => max(0, (int) ($payload['expires_in'] ?? 0)),
            'expires_at' => time() + max(0, (int) ($payload['expires_in'] ?? 0)),
        ];

        $tokenStorePath = $this->getTokenStorePath();
        $directory = dirname($tokenStorePath);

        if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create the start.gg token storage directory.');
        }

        $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);

        if (false === @file_put_contents($tokenStorePath, $encoded, LOCK_EX)) {
            throw new RuntimeException('Unable to persist the start.gg tokens on the server.');
        }

        @chmod($tokenStorePath, 0600);

        return $normalized;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readStoredTokens(): ?array
    {
        $tokenStorePath = $this->getTokenStorePath();

        if (!is_file($tokenStorePath)) {
            return null;
        }

        $content = @file_get_contents($tokenStorePath);

        if (false === $content || '' === $content) {
            return null;
        }

        $decoded = json_decode($content, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function getTokenStorePath(): string
    {
        return '' !== trim((string) $this->tokenStorePath)
            ? (string) $this->tokenStorePath
            : dirname(__DIR__, 2).'/var/startgg/oauth_tokens.json';
    }

    /**
     * @param array<string, mixed> $options
     *
     * @return array<string, mixed>
     */
    private function requestJson(string $method, string $url, array $options = []): array
    {
        $response = $this->httpClient->request($method, $url, $options);
        $statusCode = $response->getStatusCode();
        $content = $response->getContent(false);

        if ('' === $content) {
            return [];
        }

        $data = json_decode($content, true);

        if ($statusCode >= 400) {
            if (is_array($data)) {
                $message = $data['message'] ?? $data['error_description'] ?? $data['error'] ?? sprintf('start.gg responded with HTTP %d.', $statusCode);
            } else {
                $message = is_string($data) ? $data : sprintf('start.gg responded with HTTP %d.', $statusCode);
            }
            throw new RuntimeException((string) $message);
        }

        if (!is_array($data)) {
            throw new RuntimeException(sprintf(
                'Received an invalid JSON response from start.gg. Status: %d. Body: %s',
                $statusCode,
                substr($content, 0, 1000),
            ));
        }

        return $data;
    }

    /**
     * @param array<int, mixed> $errors
     */
    private function formatGraphQlErrors(array $errors): string
    {
        $messages = array_map(static function (mixed $error): string {
            if (is_array($error) && isset($error['message']) && is_string($error['message'])) {
                return $error['message'];
            }

            return 'Unknown start.gg GraphQL error.';
        }, $errors);

        return implode(' | ', $messages);
    }
}
