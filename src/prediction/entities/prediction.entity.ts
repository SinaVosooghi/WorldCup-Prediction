import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('predictions')
export class Prediction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column('jsonb')
  predict: {
    [group: string]: string[][]; // Each group has array of arrays (each inner array has 1 team ID)
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
