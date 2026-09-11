<?php

declare(strict_types=1);

namespace App\Inertia;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Twig\Environment;

final class Inertia
{
    public function __construct(
        private readonly Environment $twig,
        private readonly HttpClientInterface $httpClient,
        private readonly RequestStack $requestStack,
        private readonly string $inertiaVersion,
        private readonly bool $ssrEnabled,
        private readonly string $ssrUrl,
    ) {
    }

    public function render(string $component, array $props = []): Response
    {
        $request = $this->requestStack->getCurrentRequest()
            ?? Request::createFromGlobals();

        $page = [
            'component' => $component,
            'props' => $props,
            'url' => $request->getRequestUri(),
            'version' => $this->inertiaVersion,
        ];

        if ($request->headers->get('X-Inertia')) {
            $requestedVersion = $request->headers->get('X-Inertia-Version', '');
            if ($requestedVersion !== '' && $requestedVersion !== $this->inertiaVersion) {
                $response = new Response('', Response::HTTP_CONFLICT);
                $response->headers->set('X-Inertia-Location', $request->getUri());
                return $response;
            }

            return new JsonResponse($page, 200, [
                'X-Inertia' => 'true',
                'Vary' => 'X-Inertia',
            ]);
        }

        if ($this->ssrEnabled) {
            return $this->renderWithSsr($page);
        }

        return new Response($this->twig->render('inertia.html.twig', ['page' => $page]));
    }

    private function renderWithSsr(array $page): Response
    {
        try {
            $response = $this->httpClient->request('POST', $this->ssrUrl.'/render', [
                'json' => $page,
                'timeout' => 5,
            ]);
            $ssr = $response->toArray();

            return new Response(
                $this->twig->render('inertia.html.twig', ['page' => $page, 'ssr' => $ssr])
            );
        } catch (TransportExceptionInterface|\Exception) {
            return new Response($this->twig->render('inertia.html.twig', ['page' => $page]));
        }
    }
}
