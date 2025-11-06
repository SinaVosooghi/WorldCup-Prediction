import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1730000000001 implements MigrationInterface {
  name = 'InitialSchema1730000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create teams table
    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "fa_name" text NOT NULL,
        "eng_name" text NOT NULL,
        "order" integer NOT NULL,
        "group" text,
        "flag" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_teams" PRIMARY KEY ("id")
      )
    `);

    // Create predictions table
    await queryRunner.query(`
      CREATE TABLE "predictions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "predict" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_predictions" PRIMARY KEY ("id")
      )
    `);

    // Create results table
    await queryRunner.query(`
      CREATE TABLE "results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "prediction_id" uuid,
        "user_id" uuid NOT NULL,
        "total_score" integer NOT NULL,
        "details" jsonb NOT NULL,
        "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_results" PRIMARY KEY ("id")
      )
    `);

    // Create sessions table
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" text NOT NULL,
        "user_agent" text,
        "ip_address" inet,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "results" 
      ADD CONSTRAINT "FK_results_predictions" 
      FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE CASCADE
    `);

    // Create indexes for predictions
    await queryRunner.query(`
      CREATE INDEX "idx_predictions_user_id" ON "predictions"("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_predictions_created_at" ON "predictions"("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_predictions_predict_gin" ON "predictions" USING GIN ("predict")
    `);

    // Create indexes for results
    await queryRunner.query(`
      CREATE INDEX "idx_results_user_id" ON "results"("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_results_total_score" ON "results"("total_score" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_results_prediction_id" ON "results"("prediction_id")
    `);

    // Create indexes for sessions
    await queryRunner.query(`
      CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sessions_expires_at" ON "sessions"("expires_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sessions_token_hash" ON "sessions"("token_hash")
    `);

    // Partial index removed - NOW() is not immutable in PostgreSQL
    // Active sessions can be filtered in queries instead
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "idx_sessions_token_hash"`);
    await queryRunner.query(`DROP INDEX "idx_sessions_expires_at"`);
    await queryRunner.query(`DROP INDEX "idx_sessions_user_id"`);
    await queryRunner.query(`DROP INDEX "idx_results_prediction_id"`);
    await queryRunner.query(`DROP INDEX "idx_results_total_score"`);
    await queryRunner.query(`DROP INDEX "idx_results_user_id"`);
    await queryRunner.query(`DROP INDEX "idx_predictions_predict_gin"`);
    await queryRunner.query(`DROP INDEX "idx_predictions_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_predictions_user_id"`);

    // Drop foreign key constraint
    await queryRunner.query(`ALTER TABLE "results" DROP CONSTRAINT "FK_results_predictions"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "results"`);
    await queryRunner.query(`DROP TABLE "predictions"`);
    await queryRunner.query(`DROP TABLE "teams"`);
  }
}
