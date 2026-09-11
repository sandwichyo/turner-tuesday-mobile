<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\ImportRun;
use App\Repository\ImportRunRepository;
use App\Security\AdminAccess;
use App\Service\Import\ImportStatusSerializer;
use App\Service\StartGgClient;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Admin-only endpoints that kick off a background import and expose its live
 * progress + activity log for the /admin page.
 */
final class ImportController
{
    public function __construct(
        private readonly ImportRunRepository $runRepository,
        private readonly ImportStatusSerializer $statusSerializer,
        private readonly EntityManagerInterface $em,
        private readonly StartGgClient $startGgClient,
        private readonly LoggerInterface $logger,
        private readonly string $projectDir,
        private readonly string $appEnv,
        private readonly string $phpBinary,
    ) {
    }

    #[Route('/api/import/start', name: 'api_import_start', methods: ['POST'])]
    public function start(Request $request): JsonResponse
    {
        if (!AdminAccess::isGranted($request)) {
            return $this->corsJson(['error' => 'Nicht berechtigt.'], 403);
        }

        $active = $this->runRepository->findActive();
        if (null !== $active) {
            return $this->corsJson([
                'runId' => $active->getId(),
                'alreadyRunning' => true,
                'mode' => $active->getMode(),
            ]);
        }

        $run = new ImportRun();
        $run->setMode($this->resolveMode($request));
        $this->em->persist($run);
        $this->em->flush();

        $this->spawnWorker((int) $run->getId());

        return $this->corsJson([
            'runId' => $run->getId(),
            'alreadyRunning' => false,
            'mode' => $run->getMode(),
        ]);
    }

    /**
     * Reads the requested import mode from the JSON body (falling back to the
     * query string), defaulting to a full import for anything unrecognised.
     */
    private function resolveMode(Request $request): string
    {
        $mode = $request->query->get('mode');

        $content = $request->getContent();
        if ('' !== $content) {
            $decoded = json_decode($content, true);
            if (\is_array($decoded) && isset($decoded['mode'])) {
                $mode = $decoded['mode'];
            }
        }

        return ImportRun::MODE_INCREMENTAL === $mode
            ? ImportRun::MODE_INCREMENTAL
            : ImportRun::MODE_FULL;
    }

    #[Route('/api/import/status', name: 'api_import_status', methods: ['GET'])]
    public function status(Request $request): JsonResponse
    {
        $runId = (int) $request->query->get('runId', 0);
        $run = $runId > 0
            ? $this->runRepository->find($runId)
            : $this->runRepository->findLatest();

        return $this->corsJson([
            'run' => null !== $run ? $this->statusSerializer->serialize($run) : null,
            'isAdmin' => AdminAccess::isGranted($request),
        ]);
    }

    /**
     * Fire-and-forget: launch the import command as a detached background
     * process so it survives the current request. Progress is tracked in the
     * database, not via this process handle.
     */
    private function spawnWorker(int $runId): void
    {
        $console = $this->projectDir.'/bin/console';
        $logDir = $this->projectDir.'/var/log';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }
        $logFile = $logDir.'/import-'.$runId.'.log';

        $command = sprintf(
            '%s %s app:import --run-id=%d --env=%s --no-interaction',
            escapeshellarg($this->phpBinary),
            escapeshellarg($console),
            $runId,
            escapeshellarg($this->appEnv),
        );

        // nohup + background + detached stdio → keeps running after FPM returns.
        $detached = sprintf('nohup %s > %s 2>&1 < /dev/null &', $command, escapeshellarg($logFile));

        try {
            exec($detached);
        } catch (\Throwable $exception) {
            $this->logger->error('Failed to spawn import worker.', ['exception' => $exception]);
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function corsJson(array $payload, int $statusCode = 200): JsonResponse
    {
        $response = new JsonResponse($payload, $statusCode);
        $origin = $this->startGgClient->getFrontendOrigin();

        if (null !== $origin) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
            $response->setVary('Origin', false);
        }

        return $response;
    }
}
