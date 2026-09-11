<?php

declare(strict_types=1);

namespace App\Api\Support;

/**
 * Every timestamp the public API emits is an ISO-8601 string in UTC, so clients
 * never have to guess a unit or a zone. Internally the domain still works with
 * Unix timestamps (the Inertia pages' contract), hence the conversion here.
 */
final class Iso8601
{
    public static function fromTimestamp(mixed $timestamp): ?string
    {
        if (!\is_int($timestamp) || $timestamp <= 0) {
            return null;
        }

        return (new \DateTimeImmutable('@'.$timestamp))
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format(\DateTimeInterface::ATOM);
    }

    public static function fromDateTime(?\DateTimeInterface $dateTime): ?string
    {
        if (null === $dateTime) {
            return null;
        }

        return \DateTimeImmutable::createFromInterface($dateTime)
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format(\DateTimeInterface::ATOM);
    }
}
