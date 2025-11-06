import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Refresh token to exchange for new access token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
