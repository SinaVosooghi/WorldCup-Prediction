import { IsPhoneNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({
    example: '09123456789',
    description: 'Iranian phone number starting with 09',
  })
  @IsPhoneNumber('IR')
  @IsNotEmpty()
  phone: string;
}
