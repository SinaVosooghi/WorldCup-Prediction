import { IsPhoneNumber, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '09123456789' })
  @IsPhoneNumber('IR')
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @Length(6, 6)
  @IsNotEmpty()
  code: string;
}
