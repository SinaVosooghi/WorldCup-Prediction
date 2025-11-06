import { Injectable } from '@nestjs/common';
import { ScoreResult, SCORING_CONSTANTS } from './types/scoring.types';
import { areSetsEqual, findGroupWithTeam } from './helpers/prediction.helper';
import { GroupDataService } from './services/group-data.service';

/**
 * Scoring Service
 *
 * Implements a sophisticated scoring algorithm for team group predictions
 * based on correct placements and special conditions.
 *
 * Scoring Rules (Priority Order):
 * 1. 100 points: All teams correctly placed
 * 2. 80 points: Only 2 teams misplaced
 * 3. 60 points: Only 3 teams misplaced
 * 4. 50 points: All Iran teammates correctly placed
 * 5. 40 points: One entire group fully correct
 * 6. 20 points: 3 teams correct in one group
 * 7. 0 points: Otherwise
 */
@Injectable()
export class ScoringService {
  constructor(private groupDataService: GroupDataService) {}

  /**
   * Calculates the score for a user's prediction
   *
   * @param userGroups - Object with group names as keys and team ID arrays as values
   * @param correctGroups - Map with group names as keys and team ID arrays as values
   * @returns Score object with total and breakdown
   */
  async scoreUser(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): Promise<ScoreResult> {
    // Get Iran team ID
    const iranTeam = await this.groupDataService.getTeamByName(SCORING_CONSTANTS.IRAN_TEAM_NAME);
    const iranTeamId = iranTeam?.id;

    // Count misplaced teams
    const misplacedTeams: string[] = [];
    for (const [group, userTeams] of Object.entries(userGroups)) {
      const correctTeams = correctGroups.get(group) || [];
      const userTeamSet = new Set(userTeams);
      const correctTeamSet = new Set(correctTeams);

      for (const team of userTeamSet) {
        if (!correctTeamSet.has(team)) {
          misplacedTeams.push(team);
        }
      }
    }

    const misplacedCount = misplacedTeams.length;

    // Rule 1: All correct (100 points)
    if (misplacedCount === 0) {
      return {
        score: SCORING_CONSTANTS.SCORES.ALL_CORRECT,
        rule: 'ALL_CORRECT',
        details: {
          description: 'All 48 teams correctly placed',
          misplacedCount: 0,
          misplacedTeams: [],
          correctGroups: this.getCorrectGroupNames(userGroups, correctGroups),
          correctTeamsCount: this.countCorrectTeams(userGroups, correctGroups),
        },
      };
    }

    // Rule 2: Only 2 misplaced (80 points)
    if (misplacedCount === 2) {
      return {
        score: SCORING_CONSTANTS.SCORES.TWO_MISPLACED,
        rule: 'TWO_MISPLACED',
        details: {
          description: 'Only 2 teams misplaced',
          misplacedCount: 2,
          misplacedTeams,
        },
      };
    }

    // Rule 3: Only 3 misplaced (60 points)
    if (misplacedCount === 3) {
      return {
        score: SCORING_CONSTANTS.SCORES.THREE_MISPLACED,
        rule: 'THREE_MISPLACED',
        details: {
          description: 'Only 3 teams misplaced',
          misplacedCount: 3,
          misplacedTeams,
        },
      };
    }

    // Rule 4: All Iran teammates correct (50 points)
    if (iranTeamId) {
      const iranScore = this.checkIranGroupCorrect(userGroups, correctGroups, iranTeamId);
      if (iranScore) {
        return iranScore;
      }
    }

    // Rule 5: One entire group fully correct (40 points)
    const perfectGroupScore = this.checkPerfectGroup(userGroups, correctGroups);
    if (perfectGroupScore) {
      return perfectGroupScore;
    }

    // Rule 6: 3 correct in one group (20 points)
    const threeCorrectScore = this.checkThreeCorrect(userGroups, correctGroups);
    if (threeCorrectScore) {
      return threeCorrectScore;
    }

    // Rule 7: No rules matched (0 points)
    return {
      score: SCORING_CONSTANTS.SCORES.NO_MATCH,
      rule: 'NO_MATCH',
      details: {
        description: 'No scoring rules matched',
        misplacedCount,
        misplacedTeams,
      },
    };
  }

  /**
   * Checks if all Iran teammates are correctly placed
   */
  private checkIranGroupCorrect(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
    iranTeamId: string,
  ): ScoreResult | null {
    const userIranGroup = findGroupWithTeam(userGroups, iranTeamId);
    if (!userIranGroup) return null;

    const correctIranGroup = findGroupWithTeam(correctGroups, iranTeamId);
    if (userIranGroup !== correctIranGroup) return null;

    // Check all teammates are correct
    const userTeammates = new Set(userGroups[userIranGroup]);
    const correctTeammates = new Set(correctGroups.get(userIranGroup) || []);

    if (areSetsEqual(userTeammates, correctTeammates)) {
      return {
        score: SCORING_CONSTANTS.SCORES.IRAN_GROUP_CORRECT,
        rule: 'IRAN_GROUP_CORRECT',
        details: {
          description: 'All Iran teammates correctly placed',
          iranTeamId,
          iranGroupTeams: [...correctTeammates],
        },
      };
    }

    return null;
  }

  /**
   * Checks if any complete group is perfectly matched
   */
  private checkPerfectGroup(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): ScoreResult | null {
    for (const [group, userTeams] of Object.entries(userGroups)) {
      const correctTeams = correctGroups.get(group) || [];
      const userTeamSet = new Set(userTeams);
      const correctTeamSet = new Set(correctTeams);

      if (areSetsEqual(userTeamSet, correctTeamSet)) {
        return {
          score: SCORING_CONSTANTS.SCORES.PERFECT_GROUP,
          rule: 'PERFECT_GROUP',
          details: {
            description: 'One entire group fully correct',
            groupName: group,
            teams: [...correctTeamSet],
          },
        };
      }
    }

    return null;
  }

  /**
   * Checks if any group has 3 correct teams
   */
  private checkThreeCorrect(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): ScoreResult | null {
    for (const [group, userTeams] of Object.entries(userGroups)) {
      const correctTeams = correctGroups.get(group) || [];
      const userTeamSet = new Set(userTeams);
      const correctTeamSet = new Set(correctTeams);

      // Count intersection
      const intersection = [...userTeamSet].filter((team) => correctTeamSet.has(team));

      if (intersection.length === 3) {
        return {
          score: SCORING_CONSTANTS.SCORES.THREE_CORRECT,
          rule: 'THREE_CORRECT',
          details: {
            description: '3 teams correct in one group',
            groupName: group,
            correctTeams: intersection,
          },
        };
      }
    }

    return null;
  }

  /**
   * Counts correctly placed teams
   */
  private countCorrectTeams(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): number {
    let correctCount = 0;

    for (const [group, userTeams] of Object.entries(userGroups)) {
      const correctTeams = correctGroups.get(group) || [];
      const userTeamSet = new Set(userTeams);
      const correctTeamSet = new Set(correctTeams);

      for (const team of userTeamSet) {
        if (correctTeamSet.has(team)) correctCount++;
      }
    }

    return correctCount;
  }

  /**
   * Checks if a specific group is perfectly matched
   */
  private isGroupPerfect(userTeams: string[], correctTeams: string[]): boolean {
    const userSet = new Set(userTeams);
    const correctSet = new Set(correctTeams);
    return areSetsEqual(userSet, correctSet);
  }

  /**
   * Gets names of correctly predicted groups
   */
  private getCorrectGroupNames(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): string[] {
    const correctGroupNames: string[] = [];

    for (const [group, userTeams] of Object.entries(userGroups)) {
      const correctTeams = correctGroups.get(group) || [];
      if (this.isGroupPerfect(userTeams, correctTeams)) {
        correctGroupNames.push(group);
      }
    }

    return correctGroupNames;
  }

  /**
   * Counts how many perfect groups exist
   */
  countPerfectGroups(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): number {
    return Object.entries(userGroups).filter(([group, userTeams]) => {
      const correctTeams = correctGroups.get(group) || [];
      return this.isGroupPerfect(userTeams, correctTeams);
    }).length;
  }

  /**
   * Counts groups with at least 3 correct teams
   */
  countThreeCorrectTeamsGroups(
    userGroups: { [group: string]: string[] },
    correctGroups: Map<string, string[]>,
  ): number {
    let threeCorrectCount = 0;

    for (const [group, userTeams] of Object.entries(userGroups)) {
      const correctTeams = correctGroups.get(group) || [];
      const userTeamSet = new Set(userTeams);
      const correctTeamSet = new Set(correctTeams);

      let correctInGroup = 0;
      for (const team of userTeamSet) {
        if (correctTeamSet.has(team)) correctInGroup++;
      }

      if (correctInGroup >= 3) threeCorrectCount++;
    }

    return threeCorrectCount;
  }
}
