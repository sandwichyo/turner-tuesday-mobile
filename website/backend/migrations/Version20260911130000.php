<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Everything the event detail page needs to redraw a bracket: the round and
 * the result a set ended with, plus which characters the two players picked
 * against each other.
 *
 * The new set columns are nullable and `sort_order` defaults to 0, so rows
 * imported before this keep counting for the rankings; they simply show no
 * round or score until the next full import refreshes them.
 */
final class Version20260911130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add bracket context to set_result and the per-set character picks';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE set_result ADD startgg_set_id VARCHAR(64) DEFAULT NULL, ADD round INT DEFAULT NULL, ADD round_text VARCHAR(255) DEFAULT NULL, ADD phase_name VARCHAR(255) DEFAULT NULL, ADD winner_score INT DEFAULT NULL, ADD loser_score INT DEFAULT NULL, ADD display_score VARCHAR(255) DEFAULT NULL, ADD sort_order INT DEFAULT 0 NOT NULL');
        $this->addSql('CREATE TABLE set_character_pick (id INT AUTO_INCREMENT NOT NULL, character_id INT NOT NULL, character_name VARCHAR(100) NOT NULL, games INT NOT NULL, set_result_id INT NOT NULL, player_id INT NOT NULL, INDEX IDX_4D7287105FF11389 (set_result_id), INDEX IDX_4D72871099E6F5DF (player_id), UNIQUE INDEX uniq_pick_set_player_char (set_result_id, player_id, character_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE set_character_pick ADD CONSTRAINT FK_4D7287105FF11389 FOREIGN KEY (set_result_id) REFERENCES set_result (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE set_character_pick ADD CONSTRAINT FK_4D72871099E6F5DF FOREIGN KEY (player_id) REFERENCES player (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE set_character_pick DROP FOREIGN KEY FK_4D7287105FF11389');
        $this->addSql('ALTER TABLE set_character_pick DROP FOREIGN KEY FK_4D72871099E6F5DF');
        $this->addSql('DROP TABLE set_character_pick');
        $this->addSql('ALTER TABLE set_result DROP startgg_set_id, DROP round, DROP round_text, DROP phase_name, DROP winner_score, DROP loser_score, DROP display_score, DROP sort_order');
    }
}
