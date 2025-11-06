import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from './guards/auth.guard';

/**
 * Authentication Controller
 *
 * CSRF Protection: Not required for this API
 * This API uses Bearer token authentication via Authorization headers.
 * CSRF attacks exploit browsers' automatic cookie sending behavior.
 * Since Bearer tokens must be explicitly added to each request header,
 * they are not vulnerable to CSRF attacks.
 *
 * If web clients use cookies for authentication in the future,
 * implement CSRF protection using double-submit cookie pattern.
 */
@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP code to phone number' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto, @Req() req: any) {
    const result = await this.authService.sendOtp(
      sendOtpDto.phone,
      req.ip,
      req.headers['user-agent'] || '',
    );
    return {
      message: 'OTP_SENT_SUCCESSFULLY',
      ...(result.otp && { otp: result.otp }), // Include OTP only in sandbox mode
    };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code and create session' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'] || '';
    const result = await this.authService.verifyOtp(
      verifyOtpDto.phone,
      verifyOtpDto.code,
      req.ip,
      userAgent,
    );
    return {
      message: 'OTP_VERIFIED_SUCCESSFULLY',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      session: {
        id: result.session.id,
        userId: result.session.userId,
        expiresAt: result.session.expiresAt,
      },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Access token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refreshSession(refreshTokenDto.refreshToken);
    return {
      message: 'TOKEN_REFRESHED_SUCCESSFULLY',
      accessToken: result.accessToken,
    };
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get active sessions for user' })
  @ApiResponse({ status: 200, description: 'Returns user sessions' })
  async getSessions(@Req() req: any) {
    const userId = req.user.userId;
    const sessions = await this.authService.getUserSessions(userId);
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    };
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete specific session' })
  @ApiResponse({ status: 200, description: 'Session deleted successfully' })
  async deleteSession(@Param('sessionId') sessionId: string, @Req() req: any) {
    const userId = req.user.userId;
    await this.authService.deleteSession(userId, sessionId);
    return { message: 'SESSION_DELETED' };
  }

  @Delete('sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all sessions for user (logout from all devices)' })
  @ApiResponse({ status: 200, description: 'All sessions deleted successfully' })
  async deleteAllSessions(@Req() req: any) {
    const userId = req.user.userId;
    await this.authService.deleteAllUserSessions(userId);
    return { message: 'ALL_SESSIONS_DELETED' };
  }
}
