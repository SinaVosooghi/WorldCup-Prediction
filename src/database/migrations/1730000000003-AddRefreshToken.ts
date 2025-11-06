import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshToken1730000000003 implements MigrationInterface {
  name = 'AddRefreshToken1730000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add refresh_token_hash column to sessions table
    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD COLUMN "refresh_token_hash" text
    `);

    // Add index on refresh_token_hash for quick lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sessions_refresh_token_hash" 
      ON "sessions" ("refresh_token_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_sessions_refresh_token_hash"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP COLUMN "refresh_token_hash"
    `);
  }
}
