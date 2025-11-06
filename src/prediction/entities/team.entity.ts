import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('teams')
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fa_name' })
  faName: string;

  @Column({ name: 'eng_name' })
  engName: string;

  @Column()
  order: number;

  @Column({ nullable: true })
  group: string;

  @Column()
  flag: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
