<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Adds the import mode (full vs. incremental) to import runs so /admin can
 * trigger an import that only fetches events not yet stored.
 */
final class Version20260711223000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add mode column to import_run (full/incremental import)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE import_run ADD mode VARCHAR(20) DEFAULT 'full' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE import_run DROP mode');
    }
}
