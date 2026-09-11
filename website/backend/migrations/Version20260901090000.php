<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Storage for Web Push opt-ins. One row per browser/installed app; the endpoint
 * itself is unbounded in length, so uniqueness is enforced on its sha256 hash.
 */
final class Version20260901090000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add push_subscription table for Web Push notifications';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("CREATE TABLE push_subscription (id INT AUTO_INCREMENT NOT NULL, endpoint LONGTEXT NOT NULL, endpoint_hash VARCHAR(64) NOT NULL, public_key VARCHAR(255) NOT NULL, auth_token VARCHAR(255) NOT NULL, content_encoding VARCHAR(20) DEFAULT 'aes128gcm' NOT NULL, user_agent VARCHAR(255) DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, last_notified_at DATETIME DEFAULT NULL, failure_count INT DEFAULT 0 NOT NULL, UNIQUE INDEX uniq_push_subscription_endpoint (endpoint_hash), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE push_subscription');
    }
}
