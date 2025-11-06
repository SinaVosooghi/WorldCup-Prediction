import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

/**
 * Metrics service for Prometheus monitoring of auth system.
 * Tracks OTP operations, session management, and system health.
 */
@Injectable()
export class MetricsService {
  // OTP Metrics
  private readonly otpSentCounter: Counter;
  private readonly otpVerifiedCounter: Counter;
  private readonly otpFailedCounter: Counter;
  private readonly otpVerificationDuration: Histogram;

  // Session Metrics
  private readonly sessionCreatedCounter: Counter;
  private readonly sessionValidationCounter: Counter;
  private readonly sessionValidationFailedCounter: Counter;
  private readonly sessionValidationDuration: Histogram;
  private readonly sessionDeletedCounter: Counter;
  private readonly activeSessionsGauge: Gauge;

  // Session Cleanup Metrics
  private readonly sessionsCleanedCounter: Counter;

  // Prediction Processing Metrics
  private readonly predictionsQueuedCounter: Counter;
  private readonly predictionsProcessedCounter: Counter;
  private readonly predictionsFailedCounter: Counter;
  private readonly queueDepthGauge: Gauge;
  private readonly predictionProcessingDuration: Histogram;

  constructor() {
    // OTP Counters
    this.otpSentCounter = new Counter({
      name: 'auth_otp_sent_total',
      help: 'Total number of OTP codes sent',
      labelNames: ['status'],
    });

    this.otpVerifiedCounter = new Counter({
      name: 'auth_otp_verified_total',
      help: 'Total number of successful OTP verifications',
    });

    this.otpFailedCounter = new Counter({
      name: 'auth_otp_failed_total',
      help: 'Total number of failed OTP verifications',
      labelNames: ['reason'],
    });

    this.otpVerificationDuration = new Histogram({
      name: 'auth_otp_verification_duration_seconds',
      help: 'Duration of OTP verification operations',
      buckets: [0.1, 0.5, 1, 2, 5],
    });

    // Session Counters
    this.sessionCreatedCounter = new Counter({
      name: 'auth_session_created_total',
      help: 'Total number of sessions created',
    });

    this.sessionValidationCounter = new Counter({
      name: 'auth_session_validation_total',
      help: 'Total number of session validation attempts',
      labelNames: ['result'],
    });

    this.sessionValidationFailedCounter = new Counter({
      name: 'auth_session_validation_failed_total',
      help: 'Total number of failed session validations',
      labelNames: ['reason'],
    });

    this.sessionValidationDuration = new Histogram({
      name: 'auth_session_validation_duration_seconds',
      help: 'Duration of session validation operations',
      buckets: [0.01, 0.05, 0.1, 0.5, 1],
    });

    this.sessionDeletedCounter = new Counter({
      name: 'auth_session_deleted_total',
      help: 'Total number of sessions deleted',
      labelNames: ['type'],
    });

    this.activeSessionsGauge = new Gauge({
      name: 'auth_active_sessions_total',
      help: 'Current number of active sessions',
    });

    // Cleanup Counter
    this.sessionsCleanedCounter = new Counter({
      name: 'auth_sessions_cleaned_total',
      help: 'Total number of expired sessions cleaned up',
    });

    // Prediction Processing Metrics
    this.predictionsQueuedCounter = new Counter({
      name: 'predictions_queued_total',
      help: 'Total number of predictions queued for processing',
    });

    this.predictionsProcessedCounter = new Counter({
      name: 'predictions_processed_total',
      help: 'Total number of predictions successfully processed',
    });

    this.predictionsFailedCounter = new Counter({
      name: 'predictions_failed_total',
      help: 'Total number of prediction processing failures',
      labelNames: ['reason'],
    });

    this.queueDepthGauge = new Gauge({
      name: 'rabbitmq_queue_depth',
      help: 'Current number of messages in RabbitMQ prediction queue',
    });

    this.predictionProcessingDuration = new Histogram({
      name: 'prediction_processing_duration_seconds',
      help: 'Duration of individual prediction processing',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
  }

  // OTP Metrics Methods
  incrementOtpSent(status: 'success' | 'rate_limited' = 'success'): void {
    this.otpSentCounter.inc({ status });
  }

  incrementOtpVerified(): void {
    this.otpVerifiedCounter.inc();
  }

  incrementOtpFailed(reason: string): void {
    this.otpFailedCounter.inc({ reason });
  }

  recordOtpVerificationDuration(durationSeconds: number): void {
    this.otpVerificationDuration.observe(durationSeconds);
  }

  // Session Metrics Methods
  incrementSessionCreated(): void {
    this.sessionCreatedCounter.inc();
  }

  incrementSessionValidation(result: 'success' | 'failure'): void {
    this.sessionValidationCounter.inc({ result });
  }

  incrementSessionValidationFailed(reason: string): void {
    this.sessionValidationFailedCounter.inc({ reason });
  }

  recordSessionValidationDuration(durationSeconds: number): void {
    this.sessionValidationDuration.observe(durationSeconds);
  }

  incrementSessionDeleted(type: 'single' | 'all'): void {
    this.sessionDeletedCounter.inc({ type });
  }

  setActiveSessions(count: number): void {
    this.activeSessionsGauge.set(count);
  }

  incrementSessionsCleaned(count: number): void {
    this.sessionsCleanedCounter.inc(count);
  }

  // Prediction Metrics Methods
  incrementPredictionsQueued(count: number = 1): void {
    this.predictionsQueuedCounter.inc(count);
  }

  incrementPredictionsProcessed(count: number = 1): void {
    this.predictionsProcessedCounter.inc(count);
  }

  incrementPredictionsFailed(reason: string): void {
    this.predictionsFailedCounter.inc({ reason });
  }

  setQueueDepth(depth: number): void {
    this.queueDepthGauge.set(depth);
  }

  recordPredictionProcessingDuration(durationSeconds: number): void {
    this.predictionProcessingDuration.observe(durationSeconds);
  }

  /**
   * Get metrics registry for Prometheus scraping
   */
  getRegistry(): typeof register {
    return register;
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return await register.metrics();
  }
}
