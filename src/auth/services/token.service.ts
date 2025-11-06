import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

/**
 * Service responsible for token generation, validation, and verification.
 * Centralizes all token-related operations to eliminate code duplication.
 */
@Injectable()
export class TokenService {
  constructor(private configService: ConfigService) {}

  /**
   * Generates a cryptographically secure random token and its bcrypt hash.
   *
   * @returns Object containing the raw token and its hash
   */
  async generateToken(): Promise<{ token: string; hash: string }> {
    const tokenLength = this.configService.get<number>('auth.session.tokenLength');
    const bcryptRounds = this.configService.get<number>('auth.session.bcryptRounds');

    const token = crypto.randomBytes(tokenLength).toString('hex');
    const hash = await bcrypt.hash(token, bcryptRounds);

    return { token, hash };
  }

  /**
   * Verifies that a token matches its stored hash.
   *
   * @param token - The raw token to verify
   * @param hash - The stored bcrypt hash
   * @returns True if token matches hash, false otherwise
   */
  async verifyToken(token: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(token, hash);
  }

  /**
   * Extracts the prefix from a token for use in cache keys.
   * Uses a consistent prefix length defined in constants.
   *
   * @param token - The token to extract prefix from
   * @returns Token prefix string
   */
  getTokenPrefix(token: string): string {
    return token.substring(0, AUTH_CONSTANTS.TOKEN.PREFIX_LENGTH);
  }

  /**
   * Validates that a token has the correct format (hex string of expected length).
   * Performs fast validation without database or bcrypt operations.
   *
   * @param token - The token to validate
   * @returns True if token format is valid, false otherwise
   */
  validateTokenFormat(token: string): boolean {
    const expectedLength = this.configService.get<number>('auth.session.tokenLength') * 2;
    return !!token && token.length === expectedLength && /^[a-f0-9]+$/i.test(token);
  }
}
