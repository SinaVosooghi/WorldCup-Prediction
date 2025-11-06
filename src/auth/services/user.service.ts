import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { AuditLoggerService } from '../../common/services/audit-logger.service';

/**
 * Service responsible for user management operations.
 * Handles user creation, updates, and phone number normalization.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private auditLogger: AuditLoggerService,
  ) {}

  /**
   * Finds an existing user by phone number or creates a new one.
   * Updates the lastLoginAt timestamp on successful authentication.
   *
   * @param phone - Normalized phone number
   * @returns User entity
   */
  async findOrCreateUser(phone: string): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { phone },
    });

    if (user) {
      user.lastLoginAt = new Date();
      await this.userRepository.save(user);
    } else {
      user = this.userRepository.create({
        phone,
        lastLoginAt: new Date(),
      });
      await this.userRepository.save(user);
      this.auditLogger.logUserCreated(user.id, phone);
    }

    return user;
  }

  /**
   * Finds a user by phone number.
   *
   * @param phone - Phone number to search for
   * @returns User if found, null otherwise
   */
  async getUserByPhone(phone: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { phone },
    });
  }

  /**
   * Updates the last login timestamp for a user.
   *
   * @param userId - User ID to update
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
    });
  }

  /**
   * Normalizes a phone number to a standard format.
   * Removes spaces, dashes, and ensures consistent formatting.
   *
   * @param phone - Raw phone number input
   * @returns Normalized phone number
   */
  normalizePhoneNumber(phone: string): string {
    let normalized = phone.replace(/[^\d+]/g, '');

    if (normalized.startsWith('98') && !normalized.startsWith('+98')) {
      normalized = '+' + normalized;
    } else if (normalized.startsWith('09')) {
      normalized = normalized;
    }

    return normalized;
  }
}
