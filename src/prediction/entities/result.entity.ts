import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('results')
export class Result {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prediction_id' })
  predictionId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'total_score' })
  totalScore: number;

  @Column('jsonb')
  details: {
    correctGroups: string[];
    correctTeams: number;
    iranGroupCorrect: boolean;
    perfectGroups: number;
    scoringBreakdown: Array<{
      type: number;
      score: number;
      description: string;
    }>;
  };

  @CreateDateColumn({ name: 'processed_at' })
  processedAt: Date;
}
