import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1730000000002 implements MigrationInterface {
  name = 'CreateUsersTable1730000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "phone" character varying(20) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone")
      )
    `);

    // Create index on phone for fast lookups
    await queryRunner.query(`
      CREATE INDEX "idx_users_phone" ON "users" ("phone")
    `);

    // Create indexes on sessions table for better performance (IF NOT EXISTS)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" ("expires_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sessions_token_hash" ON "sessions" ("token_hash")
    `);

    // Clear existing data (orphaned records with non-existent user IDs)
    // Note: Users will need to re-authenticate and re-create predictions after migration
    await queryRunner.query(`
      TRUNCATE TABLE "results" CASCADE
    `);

    await queryRunner.query(`
      TRUNCATE TABLE "predictions" CASCADE
    `);

    await queryRunner.query(`
      TRUNCATE TABLE "sessions" CASCADE
    `);

    // Add foreign key constraint from sessions to users
    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_sessions_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Add foreign key constraints from predictions to users
    await queryRunner.query(`
      ALTER TABLE "predictions"
      ADD CONSTRAINT "FK_predictions_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Add foreign key constraints from results to users
    await queryRunner.query(`
      ALTER TABLE "results"
      ADD CONSTRAINT "FK_results_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "results" DROP CONSTRAINT "FK_results_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "predictions" DROP CONSTRAINT "FK_predictions_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions" DROP CONSTRAINT "FK_sessions_user_id"
    `);

    // Drop indexes on sessions table
    await queryRunner.query(`
      DROP INDEX "idx_sessions_token_hash"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_sessions_expires_at"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_sessions_user_id"
    `);

    // Drop index on users table
    await queryRunner.query(`
      DROP INDEX "idx_users_phone"
    `);

    // Drop users table
    await queryRunner.query(`
      DROP TABLE "users"
    `);
  }
}
