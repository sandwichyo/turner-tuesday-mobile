<?php

declare(strict_types=1);

namespace App\Api\EventListener;

use App\Api\Http\ApiPath;
use App\Api\Http\ApiProblem;
use App\Api\Http\ApiResponder;
use Doctrine\DBAL\Exception as DbalException;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Renders failures on the public API as problem+json instead of the HTML error
 * page. Scoped to `/api/versions` and `/api/v{n}` so the older internal
 * endpoints keep their current behaviour.
 */
final class ApiExceptionListener
{
    /**
     * Only the message of an intentionally thrown HTTP exception is safe to
     * show; anything else is replaced by these.
     */
    private const array FALLBACK_DETAIL = [
        Response::HTTP_SERVICE_UNAVAILABLE => 'Die Daten sind gerade nicht erreichbar. Bitte später erneut versuchen.',
        Response::HTTP_INTERNAL_SERVER_ERROR => 'Unerwarteter Fehler bei der Verarbeitung der Anfrage.',
    ];

    public function __construct(
        private readonly ApiResponder $responder,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[AsEventListener]
    public function onKernelException(ExceptionEvent $event): void
    {
        $request = $event->getRequest();

        if (!ApiPath::isPublicApi($request->getPathInfo())) {
            return;
        }

        $exception = $event->getThrowable();

        if ($exception instanceof HttpExceptionInterface) {
            $status = $exception->getStatusCode();
            $detail = '' !== $exception->getMessage() ? $exception->getMessage() : ApiProblem::title($status);
        } else {
            // A database that is down is a temporary condition — telling the
            // client so lets it retry instead of treating the data as gone.
            $status = $exception instanceof DbalException
                ? Response::HTTP_SERVICE_UNAVAILABLE
                : Response::HTTP_INTERNAL_SERVER_ERROR;
            $detail = self::FALLBACK_DETAIL[$status];

            $this->logger->error('Public API request failed.', [
                'path' => $request->getPathInfo(),
                'exception' => $exception,
            ]);
        }

        $response = ApiProblem::response($status, $detail, $request->getPathInfo());
        $this->responder->applyVersionHeaders($response, ApiPath::versionOf($request->getPathInfo()));

        if ($exception instanceof HttpExceptionInterface) {
            $response->headers->add($exception->getHeaders());
        }

        $event->setResponse($response);
    }

}
