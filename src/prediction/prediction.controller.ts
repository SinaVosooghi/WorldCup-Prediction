import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PredictionService } from './prediction.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreatePredictionDto } from './dto/create-prediction.dto';

@Controller('prediction')
@ApiTags('Prediction')
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Get('teams')
  @ApiOperation({ summary: 'Get all teams with their groups' })
  @ApiResponse({ status: 200, description: 'Returns all teams' })
  async getAllTeams() {
    const teams = await this.predictionService.getAllTeams();
    return {
      teams: teams.map((t) => ({
        id: t.id,
        faName: t.faName,
        engName: t.engName,
        order: t.order,
        group: t.group,
        flag: t.flag,
      })),
    };
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a prediction for World Cup groups' })
  @ApiResponse({ status: 201, description: 'Prediction created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid prediction data' })
  async createPrediction(@Body() createPredictionDto: CreatePredictionDto, @Req() req: any) {
    const userId = req.user.userId;
    const prediction = await this.predictionService.createPrediction(
      userId,
      createPredictionDto.predict,
    );

    return {
      message: 'PREDICTION_CREATED_SUCCESSFULLY',
      predictionId: prediction.id,
    };
  }

  @Get('result')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get prediction results for current user' })
  @ApiResponse({ status: 200, description: 'Returns prediction results' })
  async getMyResults(@Req() req: any) {
    const userId = req.user.userId;
    const results = await this.predictionService.getUserResults(userId);

    return {
      results: results.map((r) => ({
        id: r.id,
        predictionId: r.predictionId,
        totalScore: r.totalScore,
        details: r.details,
        processedAt: r.processedAt,
      })),
    };
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get top predictions leaderboard' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results' })
  @ApiResponse({ status: 200, description: 'Returns leaderboard' })
  async getLeaderboard(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const results = await this.predictionService.getLeaderboard(limitNum);

    return {
      leaderboard: results.map((r, index) => ({
        rank: index + 1,
        userId: r.userId,
        totalScore: r.totalScore,
        processedAt: r.processedAt,
      })),
    };
  }

  @Post('admin/trigger-prediction-process')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger prediction processing (Admin only)',
    description:
      'Queues all unprocessed predictions for asynchronous processing (if ENABLE_ASYNC_PROCESSING=true) or processes synchronously (legacy mode). Returns immediately when async, blocks when sync.',
  })
  @ApiResponse({
    status: 200,
    description: 'Processing queued successfully (async) or completed (sync)',
    schema: {
      example: {
        message: 'PREDICTION_PROCESSING_QUEUED',
        queued: 50000,
        total: 50000,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async triggerProcessing() {
    const result = await this.predictionService.triggerProcessing();
    return result;
  }

  @Get('admin/processing-status')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get prediction processing status (Admin only)',
    description:
      'Returns real-time statistics about prediction processing progress, including queue depth from RabbitMQ.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns processing status',
    schema: {
      example: {
        total: 50000,
        processed: 12500,
        pending: 37500,
        queueDepth: 35000,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getProcessingStatus() {
    const status = await this.predictionService.getProcessingStatus();
    return status;
  }
}
