/**
 * Authentication module constants
 * Centralizes all magic numbers and configuration values used across auth services
 */

export const AUTH_CONSTANTS = {
  /**
   * Token-related constants
   */
  TOKEN: {
    /** Length of token prefix used for cache keys */
    PREFIX_LENGTH: 16,
  },

  /**
   * Session management constants
   */
  SESSION: {
    /** Number of recent sessions to check during cache miss */
    RECENT_LOOKUP_LIMIT: 3,
    /** Number of recent sessions to check for concurrent login detection */
    CONCURRENT_CHECK_LIMIT: 5,
    /** Time window for concurrent session detection (5 minutes in milliseconds) */
    CONCURRENT_CHECK_WINDOW_MS: 300000,
    /** Maximum sessions to check during refresh token validation */
    BULK_REFRESH_LOOKUP_LIMIT: 100,
  },

  /**
   * Rate limiting and security thresholds
   */
  RATE_LIMIT: {
    /** OTP verification failures per phone before triggering alert */
    OTP_FAILURE_THRESHOLD_PER_PHONE: 10,
    /** OTP verification failures per IP before triggering alert */
    OTP_FAILURE_THRESHOLD_PER_IP: 20,
    /** Token refresh requests per hour before triggering alert */
    TOKEN_REFRESH_THRESHOLD_PER_HOUR: 50,
  },

  /**
   * Time window constants
   */
  TIME_WINDOWS: {
    /** One hour in seconds */
    ONE_HOUR_SECONDS: 3600,
  },

  /**
   * Phone number patterns for fraud detection
   */
  FRAUD_DETECTION: {
    /** Test phone number patterns to flag as suspicious */
    TEST_PATTERNS: [
      '1234567890',
      '0987654321',
      '0000000000',
      '1111111111',
      '9999999999',
      '0123456789',
    ],
    /** Minimum length of repeated digits to flag as suspicious */
    REPEATED_DIGITS_THRESHOLD: 6,
    /** Length of sequential pattern to check */
    SEQUENTIAL_PATTERN_LENGTH: 6,
  },
} as const;
