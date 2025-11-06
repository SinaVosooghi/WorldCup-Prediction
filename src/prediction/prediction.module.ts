import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PredictionController } from './prediction.controller';
import { PredictionService } from './prediction.service';
import { PredictionProcessor } from './prediction.processor';
import { ScoringService } from './scoring.service';
import { GroupDataService } from './services/group-data.service';
import { Team } from './entities/team.entity';
import { Prediction } from './entities/prediction.entity';
import { Result } from './entities/result.entity';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Team, Prediction, Result]), AuthModule, CommonModule],
  controllers: [PredictionController],
  providers: [PredictionService, PredictionProcessor, ScoringService, GroupDataService],
  exports: [PredictionService, PredictionProcessor, ScoringService, GroupDataService],
})
export class PredictionModule {}
