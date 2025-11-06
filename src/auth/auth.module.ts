import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { SmsModule } from '../sms/sms.module';
import { CommonModule } from '../common/common.module';
import { AuthGuard } from './guards/auth.guard';
import { SessionCleanupService } from './services/session-cleanup.service';
import { TokenService } from './services/token.service';
import { SessionCacheService } from './services/session-cache.service';
import { UserService } from './services/user.service';
import { FraudDetectionService } from './services/fraud-detection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, User]), SmsModule, CommonModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    AuthGuard,
    SessionCleanupService,
    TokenService,
    SessionCacheService,
    UserService,
    FraudDetectionService,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
