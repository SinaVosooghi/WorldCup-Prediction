import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import { GroupDataService } from './services/group-data.service';

describe('ScoringService', () => {
  let service: ScoringService;
  let groupDataService: GroupDataService;

  // Sample data - 12 groups with 4 teams each (48 total teams)
  const correctAnswerMap = new Map<string, string[]>([
    ['A', ['1', '2', '3', '4']],
    ['B', ['5', '6', '7', '8']],
    ['C', ['9', '10', '11', '12']],
    ['D', ['13', '14', '15', '16']],
    ['E', ['17', '18', '19', '20']],
    ['F', ['21', '22', '23', '24']],
    ['G', ['25', '26', '27', '28']],
    ['H', ['29', '30', '31', '32']],
    ['I', ['33', '34', '35', '36']],
    ['J', ['37', '38', '39', '40']],
    ['K', ['41', '42', '43', '44']],
    ['L', ['45', '46', '47', '48']],
  ]);

  const iranTeamId = '10'; // Iran is in Group C

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        {
          provide: GroupDataService,
          useValue: {
            getTeamByName: jest.fn().mockResolvedValue({
              id: iranTeamId,
              engName: 'Iran',
              group: 'C',
            }),
            getCorrectGroups: jest.fn().mockResolvedValue(correctAnswerMap),
          },
        },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
    groupDataService = module.get<GroupDataService>(GroupDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Rule 1: All Correct (100 points)', () => {
    it('should return 100 points when all teams are correctly placed', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '4'],
        B: ['5', '6', '7', '8'],
        C: ['9', '10', '11', '12'],
        D: ['13', '14', '15', '16'],
        E: ['17', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(100);
      expect(result.rule).toBe('ALL_CORRECT');
      expect(result.details.misplacedCount).toBe(0);
    });

    it('should return 100 points when groups have teams in different internal order but same members', async () => {
      const userPrediction = {
        A: ['4', '3', '2', '1'], // Same teams, different order
        B: ['8', '7', '6', '5'],
        C: ['9', '10', '11', '12'],
        D: ['13', '14', '15', '16'],
        E: ['17', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(100);
      expect(result.rule).toBe('ALL_CORRECT');
    });
  });

  describe('Rule 2: Two Misplaced (80 points)', () => {
    it('should return 80 points when only 2 teams are misplaced', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'], // Team 5 wrong
        B: ['4', '6', '7', '8'], // Team 4 wrong
        C: ['9', '10', '11', '12'],
        D: ['13', '14', '15', '16'],
        E: ['17', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(80);
      expect(result.rule).toBe('TWO_MISPLACED');
      expect(result.details.misplacedCount).toBe(2);
      expect(result.details.misplacedTeams).toContain('4');
      expect(result.details.misplacedTeams).toContain('5');
    });

    it('should return 80 points when 2 teams are placed in wrong groups', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '4'],
        B: ['5', '6', '7', '9'], // Team 9 wrong
        C: ['8', '10', '11', '12'], // Team 8 wrong
        D: ['13', '14', '15', '16'],
        E: ['17', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(80);
      expect(result.rule).toBe('TWO_MISPLACED');
      expect(result.details.misplacedCount).toBe(2);
      expect(result.details.misplacedTeams).toContain('8');
      expect(result.details.misplacedTeams).toContain('9');
    });
  });

  describe('Rule 3: Three Misplaced (60 points)', () => {
    it('should return 60 points when only 3 teams are misplaced', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '9'], // Team 9 wrong
        B: ['4', '6', '7', '8'], // Team 4 wrong
        C: ['5', '10', '11', '12'], // Team 5 wrong
        D: ['13', '14', '15', '16'],
        E: ['17', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(60);
      expect(result.rule).toBe('THREE_MISPLACED');
      expect(result.details.misplacedCount).toBe(3);
      expect(result.details.misplacedTeams).toHaveLength(3);
      expect(result.details.misplacedTeams).toContain('4');
      expect(result.details.misplacedTeams).toContain('5');
      expect(result.details.misplacedTeams).toContain('9');
    });
  });

  describe('Rule 4: Iran Group Correct (50 points)', () => {
    it('should return 50 points when all Iran teammates are correct', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'],
        B: ['4', '6', '7', '8'],
        C: ['9', '10', '11', '12'], // Iran's group perfect
        D: ['13', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(50);
      expect(result.rule).toBe('IRAN_GROUP_CORRECT');
      expect(result.details.iranTeamId).toBe(iranTeamId);
      expect(result.details.iranGroupTeams).toEqual(['9', '10', '11', '12']);
    });

    it('should not give Iran points if only 3 of 4 Iran group members are correct', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'],
        B: ['4', '6', '7', '8'],
        C: ['9', '10', '11', '13'], // Only 3 correct in Iran's group
        D: ['12', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).not.toBe(50);
      expect(result.rule).not.toBe('IRAN_GROUP_CORRECT');
    });
  });

  describe('Rule 5: Perfect Group (40 points)', () => {
    it('should return 40 points when one entire group is fully correct', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'],
        B: ['4', '6', '7', '8'],
        C: ['9', '10', '11', '13'],
        D: ['12', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['21', '22', '23', '24'], // Perfect
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(40);
      expect(result.rule).toBe('PERFECT_GROUP');
      expect(result.details.teams).toEqual(['21', '22', '23', '24']);
    });

    it('should return 40 points when a group matches with different internal order', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'],
        B: ['4', '6', '7', '8'],
        C: ['9', '10', '11', '13'],
        D: ['12', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['24', '23', '22', '21'], // Perfect but different order
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(40);
      expect(result.rule).toBe('PERFECT_GROUP');
    });
  });

  describe('Rule 6: Three Correct (20 points)', () => {
    it('should return 20 points when one group has 3 correct teams', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'], // 3 correct
        B: ['4', '6', '7', '9'],
        C: ['8', '10', '11', '13'],
        D: ['12', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['21', '22', '24', '25'],
        G: ['23', '26', '27', '29'],
        H: ['28', '30', '31', '32'],
        I: ['33', '34', '35', '37'],
        J: ['36', '38', '39', '40'],
        K: ['41', '42', '43', '45'],
        L: ['44', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(20);
      expect(result.rule).toBe('THREE_CORRECT');
      expect(result.details.correctTeams).toHaveLength(3);
      expect(result.details.correctTeams).toContain('1');
      expect(result.details.correctTeams).toContain('2');
      expect(result.details.correctTeams).toContain('3');
    });
  });

  describe('Rule 7: No Match (0 points)', () => {
    it('should return 0 points when no rules are matched', async () => {
      const userPrediction = {
        A: ['1', '2', '5', '6'],
        B: ['3', '4', '7', '8'],
        C: ['9', '10', '13', '14'],
        D: ['11', '12', '15', '16'],
        E: ['17', '18', '21', '22'],
        F: ['19', '20', '23', '24'],
        G: ['25', '26', '29', '30'],
        H: ['27', '28', '31', '32'],
        I: ['33', '34', '37', '38'],
        J: ['35', '36', '39', '40'],
        K: ['41', '42', '45', '46'],
        L: ['43', '44', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      expect(result.score).toBe(0);
      expect(result.rule).toBe('NO_MATCH');
    });
  });

  describe('Helper Methods', () => {
    it('should count perfect groups correctly', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '4'], // Perfect
        B: ['5', '6', '7', '8'], // Perfect
        C: ['9', '10', '11', '13'], // Not perfect
        D: ['12', '14', '15', '16'], // Not perfect
        E: ['17', '18', '19', '20'], // Perfect (makes 3 total)
        F: ['21', '22', '23', '25'], // Not perfect
        G: ['24', '26', '27', '28'], // Not perfect
        H: ['29', '30', '31', '32'], // Perfect (makes 4 total)
        I: ['33', '34', '35', '37'], // Not perfect
        J: ['36', '38', '39', '40'], // Not perfect
        K: ['41', '42', '43', '45'], // Not perfect
        L: ['44', '46', '47', '48'], // Not perfect
      };

      const count = service.countPerfectGroups(userPrediction, correctAnswerMap);
      expect(count).toBe(4);
    });

    it('should count three-correct groups correctly', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'], // 3 correct
        B: ['4', '6', '7', '9'], // 2 correct
        C: ['8', '10', '11', '12'], // 3 correct
        D: ['13', '14', '15', '16'],
        E: ['17', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const count = service.countThreeCorrectTeamsGroups(userPrediction, correctAnswerMap);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle Iran team not found gracefully', async () => {
      jest.spyOn(groupDataService, 'getTeamByName').mockResolvedValueOnce(null);

      const userPrediction = {
        A: ['1', '2', '3', '5'],
        B: ['4', '6', '7', '8'],
        C: ['9', '10', '11', '12'],
        D: ['13', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      // Should fall through to other rules
      expect(result.rule).not.toBe('IRAN_GROUP_CORRECT');
    });

    it('should prioritize higher scoring rules correctly', async () => {
      const userPrediction = {
        A: ['1', '2', '3', '5'],
        B: ['4', '6', '7', '8'],
        C: ['9', '10', '11', '12'], // Iran group perfect (50 points)
        D: ['13', '14', '15', '17'],
        E: ['16', '18', '19', '20'],
        F: ['21', '22', '23', '24'],
        G: ['25', '26', '27', '28'],
        H: ['29', '30', '31', '32'],
        I: ['33', '34', '35', '36'],
        J: ['37', '38', '39', '40'],
        K: ['41', '42', '43', '44'],
        L: ['45', '46', '47', '48'],
      };

      const result = await service.scoreUser(userPrediction, correctAnswerMap);

      // Should get 50 points for Iran group
      expect(result.score).toBe(50);
      expect(result.rule).toBe('IRAN_GROUP_CORRECT');
    });
  });
});
