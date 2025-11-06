import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * User entity representing authenticated users in the system.
 * Users are created upon successful OTP verification.
 */
@Entity('users')
@Index('idx_users_phone', ['phone'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * User's phone number (unique identifier)
   * Normalized to standard format before storage
   */
  @Column({ unique: true, length: 20 })
  phone: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Timestamp of last login
   */
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;
}
