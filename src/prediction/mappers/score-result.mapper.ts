import { ScoreResult, SCORING_CONSTANTS } from '../types/scoring.types';

/**
 * Maps ScoreResult to legacy Result entity details format
 * This maintains backward compatibility with existing database structure
 */
export function mapScoreResultToLegacyDetails(
  scoreResult: ScoreResult,
  userGroups: { [group: string]: string[] },
  correctGroups: Map<string, string[]>,
): {
  correctGroups: string[];
  correctTeams: number;
  iranGroupCorrect: boolean;
  perfectGroups: number;
  scoringBreakdown: Array<{
    type: number;
    score: number;
    description: string;
  }>;
} {
  // Map rule to type number
  const ruleTypeMap = {
    ALL_CORRECT: 1,
    TWO_MISPLACED: 2,
    THREE_MISPLACED: 3,
    IRAN_GROUP_CORRECT: 4,
    PERFECT_GROUP: 5,
    THREE_CORRECT: 6,
    NO_MATCH: 0,
  };

  // Create scoring breakdown entry
  const scoringBreakdown = [
    {
      type: ruleTypeMap[scoreResult.rule],
      score: scoreResult.score,
      description: scoreResult.details.description,
    },
  ];

  // Count correct groups
  const correctGroupNames: string[] = [];
  for (const [group, userTeams] of Object.entries(userGroups)) {
    const correctTeams = correctGroups.get(group) || [];
    const userSet = new Set(userTeams);
    const correctSet = new Set(correctTeams);
    if (userSet.size === correctSet.size && [...userSet].every((team) => correctSet.has(team))) {
      correctGroupNames.push(group);
    }
  }

  // Count correct teams
  let correctTeamsCount = 0;
  for (const [group, userTeams] of Object.entries(userGroups)) {
    const correctTeams = correctGroups.get(group) || [];
    const userSet = new Set(userTeams);
    const correctSet = new Set(correctTeams);
    for (const team of userSet) {
      if (correctSet.has(team)) correctTeamsCount++;
    }
  }

  return {
    correctGroups: correctGroupNames,
    correctTeams: correctTeamsCount,
    iranGroupCorrect: scoreResult.rule === 'IRAN_GROUP_CORRECT',
    perfectGroups: correctGroupNames.length,
    scoringBreakdown,
  };
}
