import { IsNotEmpty, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePredictionDto {
  @ApiProperty({
    description: 'Prediction data with groups and team IDs',
    example: {
      groups: {
        A: ['team-id-1', 'team-id-2', 'team-id-3', 'team-id-4'],
        B: ['team-id-5', 'team-id-6', 'team-id-7', 'team-id-8'],
      },
    },
  })
  @IsNotEmpty()
  @IsObject()
  predict: {
    groups: {
      [group: string]: string[];
    };
  };
}
