<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\HttpFoundation\Request;

/**
 * Admin access is granted purely by passing nginx Basic-Auth on /admin. Once
 * there, a session flag lets the SPA and admin-only API endpoints recognise the
 * operator without triggering another auth challenge.
 */
final class AdminAccess
{
    public const SESSION_KEY = 'is_admin';

    public static function grant(Request $request): void
    {
        $request->getSession()->set(self::SESSION_KEY, true);
    }

    public static function isGranted(Request $request): bool
    {
        return $request->hasPreviousSession()
            && true === $request->getSession()->get(self::SESSION_KEY, false);
    }
}
