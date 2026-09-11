<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Initial schema: events, German players, standings, head-to-head sets,
 * character usage and the background import tracking (runs + activity log).
 */
final class Version20260711061047 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Initial German Melee schema (events, players, standings, sets, characters, import runs)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE character_selection (id INT AUTO_INCREMENT NOT NULL, character_id INT NOT NULL, character_name VARCHAR(100) NOT NULL, cnt INT NOT NULL, event_id INT NOT NULL, player_id INT NOT NULL, INDEX IDX_11F5AEEC71F7E88B (event_id), INDEX IDX_11F5AEEC99E6F5DF (player_id), UNIQUE INDEX uniq_char_event_player_char (event_id, player_id, character_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE event (id INT AUTO_INCREMENT NOT NULL, startgg_event_id INT NOT NULL, name VARCHAR(255) NOT NULL, slug VARCHAR(255) DEFAULT NULL, tournament_name VARCHAR(255) NOT NULL, tournament_slug VARCHAR(255) DEFAULT NULL, start_at INT DEFAULT NULL, num_entrants INT DEFAULT NULL, imported_at DATETIME NOT NULL, INDEX idx_event_start_at (start_at), UNIQUE INDEX uniq_event_startgg (startgg_event_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE import_log (id INT AUTO_INCREMENT NOT NULL, created_at DATETIME NOT NULL, level VARCHAR(20) NOT NULL, message LONGTEXT NOT NULL, run_id INT NOT NULL, INDEX idx_import_log_run (run_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE import_run (id INT AUTO_INCREMENT NOT NULL, status VARCHAR(20) NOT NULL, created_at DATETIME NOT NULL, started_at DATETIME DEFAULT NULL, finished_at DATETIME DEFAULT NULL, total_tournaments INT NOT NULL, total_events INT NOT NULL, processed_events INT NOT NULL, current_label VARCHAR(255) DEFAULT NULL, error LONGTEXT DEFAULT NULL, pid INT DEFAULT NULL, INDEX idx_import_run_created (created_at), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE player (id INT AUTO_INCREMENT NOT NULL, startgg_player_id VARCHAR(191) NOT NULL, display_name VARCHAR(255) NOT NULL, country VARCHAR(100) DEFAULT NULL, INDEX idx_player_country (country), UNIQUE INDEX uniq_player_startgg (startgg_player_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE set_result (id INT AUTO_INCREMENT NOT NULL, event_id INT NOT NULL, winner_id INT NOT NULL, loser_id INT NOT NULL, INDEX IDX_B72FF4825DFCD4B8 (winner_id), INDEX IDX_B72FF4821BCAA5F6 (loser_id), INDEX idx_set_event (event_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE standing (id INT AUTO_INCREMENT NOT NULL, placement INT NOT NULL, event_id INT NOT NULL, player_id INT NOT NULL, INDEX IDX_619A8AD871F7E88B (event_id), INDEX IDX_619A8AD899E6F5DF (player_id), UNIQUE INDEX uniq_standing_event_player (event_id, player_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE character_selection ADD CONSTRAINT FK_11F5AEEC71F7E88B FOREIGN KEY (event_id) REFERENCES event (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE character_selection ADD CONSTRAINT FK_11F5AEEC99E6F5DF FOREIGN KEY (player_id) REFERENCES player (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE import_log ADD CONSTRAINT FK_1B52C84584E3FEC4 FOREIGN KEY (run_id) REFERENCES import_run (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE set_result ADD CONSTRAINT FK_B72FF48271F7E88B FOREIGN KEY (event_id) REFERENCES event (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE set_result ADD CONSTRAINT FK_B72FF4825DFCD4B8 FOREIGN KEY (winner_id) REFERENCES player (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE set_result ADD CONSTRAINT FK_B72FF4821BCAA5F6 FOREIGN KEY (loser_id) REFERENCES player (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE standing ADD CONSTRAINT FK_619A8AD871F7E88B FOREIGN KEY (event_id) REFERENCES event (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE standing ADD CONSTRAINT FK_619A8AD899E6F5DF FOREIGN KEY (player_id) REFERENCES player (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE character_selection DROP FOREIGN KEY FK_11F5AEEC71F7E88B');
        $this->addSql('ALTER TABLE character_selection DROP FOREIGN KEY FK_11F5AEEC99E6F5DF');
        $this->addSql('ALTER TABLE import_log DROP FOREIGN KEY FK_1B52C84584E3FEC4');
        $this->addSql('ALTER TABLE set_result DROP FOREIGN KEY FK_B72FF48271F7E88B');
        $this->addSql('ALTER TABLE set_result DROP FOREIGN KEY FK_B72FF4825DFCD4B8');
        $this->addSql('ALTER TABLE set_result DROP FOREIGN KEY FK_B72FF4821BCAA5F6');
        $this->addSql('ALTER TABLE standing DROP FOREIGN KEY FK_619A8AD871F7E88B');
        $this->addSql('ALTER TABLE standing DROP FOREIGN KEY FK_619A8AD899E6F5DF');
        $this->addSql('DROP TABLE character_selection');
        $this->addSql('DROP TABLE event');
        $this->addSql('DROP TABLE import_log');
        $this->addSql('DROP TABLE import_run');
        $this->addSql('DROP TABLE player');
        $this->addSql('DROP TABLE set_result');
        $this->addSql('DROP TABLE standing');
    }
}
