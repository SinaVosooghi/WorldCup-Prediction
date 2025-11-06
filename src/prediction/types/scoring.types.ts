/**
 * Type definitions for the scoring system
 */

export interface ScoreResult {
  score: number;
  rule: ScoringRule;
  details: ScoreDetails;
}

export type ScoringRule =
  | 'ALL_CORRECT'
  | 'TWO_MISPLACED'
  | 'THREE_MISPLACED'
  | 'IRAN_GROUP_CORRECT'
  | 'PERFECT_GROUP'
  | 'THREE_CORRECT'
  | 'NO_MATCH';

export interface ScoreDetails {
  description: string;
  misplacedCount?: number;
  misplacedTeams?: string[];
  correctGroups?: string[];
  correctTeamsCount?: number;
  correctTeams?: string[];
  iranTeamId?: string;
  iranGroupTeams?: string[];
  groupName?: string;
  teams?: string[];
}

export const SCORING_CONSTANTS = {
  IRAN_TEAM_NAME: 'Iran',
  CACHE_KEYS: {
    CORRECT_GROUPS: 'correct-groups',
    STATS_TOTAL: 'prediction:stats:total',
    STATS_PROCESSED: 'prediction:stats:processed',
  },
  CACHE_TTL: {
    CORRECT_GROUPS: 3600, // 1 hour
  },
  SCORES: {
    ALL_CORRECT: 100,
    TWO_MISPLACED: 80,
    THREE_MISPLACED: 60,
    IRAN_GROUP_CORRECT: 50,
    PERFECT_GROUP: 40,
    THREE_CORRECT: 20,
    NO_MATCH: 0,
  },
} as const;
