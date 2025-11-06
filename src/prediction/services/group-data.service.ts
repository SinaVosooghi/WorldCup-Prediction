import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from '../entities/team.entity';
import { RedisService } from '../../redis/redis.service';
import { SCORING_CONSTANTS } from '../types/scoring.types';

/**
 * Service for managing team group data
 * Handles caching and retrieval of correct team groupings
 */
@Injectable()
export class GroupDataService {
  constructor(
    @InjectRepository(Team)
    private teamRepository: Repository<Team>,
    private redisService: RedisService,
  ) {}

  /**
   * Gets the correct team groupings (with caching)
   * @returns Map of group names to team ID arrays
   */
  async getCorrectGroups(): Promise<Map<string, string[]>> {
    const cached = await this.redisService.get(SCORING_CONSTANTS.CACHE_KEYS.CORRECT_GROUPS);

    if (cached) {
      return new Map(JSON.parse(cached));
    }

    const teams = await this.teamRepository.find({
      order: { group: 'ASC', order: 'ASC' },
    });

    const groups = new Map<string, string[]>();
    teams.forEach((team) => {
      if (team.group) {
        if (!groups.has(team.group)) {
          groups.set(team.group, []);
        }
        groups.get(team.group)!.push(team.id);
      }
    });

    await this.redisService.setex(
      SCORING_CONSTANTS.CACHE_KEYS.CORRECT_GROUPS,
      SCORING_CONSTANTS.CACHE_TTL.CORRECT_GROUPS,
      JSON.stringify([...groups]),
    );

    return groups;
  }

  /**
   * Gets a specific team by name
   * @param teamName - Name of the team (e.g., 'Iran')
   * @returns Team entity or null
   */
  async getTeamByName(teamName: string): Promise<Team | null> {
    return await this.teamRepository.findOne({
      where: { engName: teamName },
    });
  }
}
