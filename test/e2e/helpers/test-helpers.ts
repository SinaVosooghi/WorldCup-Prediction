import { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:3000';

export interface TestUser {
  phone: string;
  accessToken: string;
  tokenId: string;
}

export interface Team {
  id: string;
  faName: string;
  engName: string;
  order: number;
  group: string;
  flag: string;
}

export class TestHelpers {
  /**
   * Generate random valid Iranian mobile phone number
   * Format: 09[valid-operator-code][7-random-digits] = 11 digits total
   */
  static generateTestPhone(): string {
    // Valid Iranian mobile operator codes (verified with libphonenumber validator)
    const validOperatorCodes = [
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19', // Irancell
      '01',
      '02',
      '03',
      '05', // MCI
      '20',
      '21', // Rightel
      '30',
      '33',
      '35',
      '36',
      '37',
      '38',
      '39', // MCI
      '90',
      '91',
      '92', // Irancell
    ];
    const operatorCode = validOperatorCodes[Math.floor(Math.random() * validOperatorCodes.length)];
    const randomDigits = Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, '0');
    return `09${operatorCode}${randomDigits}`;
  }

  /**
   * Send OTP and return response
   */
  static async sendOTP(request: APIRequestContext, phone: string): Promise<any> {
    const response = await request.post(`${API_BASE}/auth/send-otp`, {
      data: { phone },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Verify OTP and return token
   */
  static async verifyOTP(request: APIRequestContext, phone: string, code: string): Promise<any> {
    const response = await request.post(`${API_BASE}/auth/verify-otp`, {
      data: { phone, code },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Get all teams from API
   */
  static async getTeams(request: APIRequestContext): Promise<Team[]> {
    const response = await request.get(`${API_BASE}/prediction/teams`);
    const body = await response.json();
    return body.teams || [];
  }

  /**
   * Create prediction data structure with all 48 teams
   */
  static createValidPrediction(teams: Team[]): any {
    const prediction: any = { groups: {} };

    // Group teams by group letter
    const groupMap: { [key: string]: string[] } = {};
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

    groups.forEach((group) => {
      groupMap[group] = [];
    });

    teams.forEach((team) => {
      if (groupMap[team.group]) {
        groupMap[team.group].push(team.id);
      }
    });

    groups.forEach((group) => {
      prediction.groups[group] = groupMap[group];
    });

    return prediction;
  }

  /**
   * Create prediction with specific wrong teams (for scoring tests)
   */
  static createWrongPrediction(teams: Team[], wrongCount: number): any {
    const prediction = TestHelpers.createValidPrediction(teams);

    // Shuffle and wrong-ify X teams
    let changed = 0;
    for (const group in prediction.groups) {
      if (changed >= wrongCount) break;
      const groupTeams = prediction.groups[group];
      if (groupTeams.length > 0) {
        // Swap with team from another group
        const otherGroup = Object.keys(prediction.groups).find((g) => g !== group);
        if (otherGroup && prediction.groups[otherGroup].length > 0) {
          const temp = groupTeams[0];
          groupTeams[0] = prediction.groups[otherGroup][0];
          prediction.groups[otherGroup][0] = temp;
          changed++;
        }
      }
    }

    return prediction;
  }

  /**
   * Submit prediction
   */
  static async submitPrediction(
    request: APIRequestContext,
    prediction: any,
    token: string,
  ): Promise<any> {
    const response = await request.post(`${API_BASE}/prediction`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: { predict: prediction },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Get leaderboard
   */
  static async getLeaderboard(
    request: APIRequestContext,
    limit?: number,
    offset?: number,
  ): Promise<any> {
    let url = `${API_BASE}/prediction/leaderboard`;
    const params = [];
    if (limit) params.push(`limit=${limit}`);
    if (offset) params.push(`offset=${offset}`);
    if (params.length) url += '?' + params.join('&');

    const response = await request.get(url);
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Get user result
   */
  static async getUserResult(request: APIRequestContext, token: string): Promise<any> {
    const response = await request.get(`${API_BASE}/prediction/result`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Get user sessions
   */
  static async getSessions(request: APIRequestContext, token: string): Promise<any> {
    const response = await request.get(`${API_BASE}/auth/sessions`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Delete session
   */
  static async deleteSession(
    request: APIRequestContext,
    token: string,
    sessionId: string,
  ): Promise<any> {
    const response = await request.delete(`${API_BASE}/auth/sessions/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Trigger prediction processing (requires authentication)
   */
  static async triggerPredictionProcess(request: APIRequestContext, token: string): Promise<any> {
    const response = await request.post(`${API_BASE}/prediction/admin/trigger-prediction-process`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return { status: response.status(), body: await response.json() };
  }

  /**
   * Complete authentication flow: send OTP, extract code, verify, and return token
   * Note: Requires SMS_SANDBOX=true to extract OTP from response
   */
  static async authenticateUser(request: APIRequestContext): Promise<{
    phone: string;
    token: string;
    otp: string;
  }> {
    const phone = TestHelpers.generateTestPhone();

    // Send OTP
    const sendResult = await TestHelpers.sendOTP(request, phone);
    if (sendResult.status !== 200) {
      throw new Error(`Failed to send OTP: ${sendResult.status}`);
    }

    // Extract OTP from sandbox response
    const otp = sendResult.body.otp;
    if (!otp) {
      throw new Error(
        'OTP not found in response. Ensure SMS_SANDBOX=true environment variable is set.',
      );
    }

    // Verify OTP
    const verifyResult = await TestHelpers.verifyOTP(request, phone, otp);
    if (verifyResult.status !== 200) {
      throw new Error(`Failed to verify OTP: ${verifyResult.status}`);
    }

    const token = verifyResult.body.accessToken;
    if (!token) {
      throw new Error('Access token not found in verify response');
    }

    return { phone, token, otp };
  }

  /**
   * Clear Redis keys matching pattern (for test isolation)
   * Note: This requires direct Redis access
   */
  static async clearRedisKeys(pattern: string): Promise<void> {
    // This is a placeholder for Redis cleanup
    // In a real implementation, you would:
    // 1. Connect to Redis
    // 2. Use SCAN to find keys matching pattern
    // 3. Delete them
    // For now, we'll rely on unique phone numbers and test isolation
    console.log(`[TEST] Would clear Redis keys matching: ${pattern}`);
  }

  /**
   * Wait for specific time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Record performance metric
   */
  static recordPerformance(label: string, duration: number): void {
    console.log(`[PERFORMANCE] ${label}: ${duration}ms`);
  }

  /**
   * Validate phone number format
   */
  static isValidPhoneFormat(phone: string): boolean {
    return /^09\d{9}$/.test(phone);
  }

  /**
   * Validate OTP code format
   */
  static isValidOTPFormat(code: string): boolean {
    return /^\d{6}$/.test(code);
  }

  /**
   * Create invalid prediction (missing teams)
   */
  static createIncompletePrediction(teams: Team[], missingGroups: number): any {
    const prediction = TestHelpers.createValidPrediction(teams);
    const groups = Object.keys(prediction.groups);

    for (let i = 0; i < missingGroups; i++) {
      delete prediction.groups[groups[i]];
    }

    return prediction;
  }

  /**
   * Create prediction with duplicate teams
   */
  static createPredictionWithDuplicates(teams: Team[]): any {
    const prediction = TestHelpers.createValidPrediction(teams);
    // Add first team's ID to second group
    const groups = Object.keys(prediction.groups);
    if (prediction.groups[groups[0]] && prediction.groups[groups[1]]) {
      prediction.groups[groups[1]][0] = prediction.groups[groups[0]][0];
    }
    return prediction;
  }

  /**
   * Create perfect prediction (all 48 teams in correct groups) - 100 points
   * Format: { groups: { A: [['id1'], ['id2'], ...] } } - nested arrays
   */
  static createPerfectPrediction(teams: Team[]): any {
    const prediction: any = { groups: {} };

    // Group teams by their correct groups
    const correctGroups: { [key: string]: string[][] } = {};
    teams.forEach((team) => {
      if (!correctGroups[team.group]) {
        correctGroups[team.group] = [];
      }
      correctGroups[team.group].push([team.id]); // Wrap each team ID in array
    });

    // Assign to prediction
    Object.keys(correctGroups).forEach((group) => {
      prediction.groups[group] = correctGroups[group];
    });

    return prediction;
  }

  /**
   * Create prediction with exactly N teams in wrong groups - 80 points (2 wrong), 60 points (3 wrong)
   */
  /**
   * Create prediction with exactly N teams misplaced
   * Strategy: Swap N teams between groups to keep all groups balanced at 4 teams
   */
  static createPredictionWithWrongTeams(teams: Team[], wrongCount: number): any {
    const prediction = TestHelpers.createPerfectPrediction(teams);
    const groups = Object.keys(prediction.groups);

    // For 2 wrong: swap 1 team from A with 1 team from B (both become wrong)
    // For 3 wrong: swap in a cycle A->B->C->A (3 teams misplaced)
    if (wrongCount === 2) {
      // Swap one team between groups A and B
      const teamFromA = prediction.groups[groups[0]][0]; // First team from A
      const teamFromB = prediction.groups[groups[1]][0]; // First team from B

      prediction.groups[groups[0]][0] = teamFromB; // Put B's team in A
      prediction.groups[groups[1]][0] = teamFromA; // Put A's team in B
    } else if (wrongCount === 3) {
      // Circular swap: A[0]->B[0], B[0]->C[0], C[0]->A[0]
      const teamFromA = prediction.groups[groups[0]][0];
      const teamFromB = prediction.groups[groups[1]][0];
      const teamFromC = prediction.groups[groups[2]][0];

      prediction.groups[groups[0]][0] = teamFromC; // C's team to A
      prediction.groups[groups[1]][0] = teamFromA; // A's team to B
      prediction.groups[groups[2]][0] = teamFromB; // B's team to C
    }

    return prediction;
  }

  /**
   * Create prediction with only Iran's group correct - 50 points
   * Strategy: Iran group perfect, but mix all other teams across wrong groups
   */
  static createIranGroupOnlyPrediction(teams: Team[]): any {
    const prediction: any = { groups: {} };

    // Find Iran's group (E)
    const iranTeam = teams.find((team) => team.engName === 'Iran');
    if (!iranTeam) {
      throw new Error('Iran team not found in teams data');
    }

    const iranGroup = iranTeam.group; // Should be 'E'

    // Put all teams from Iran's group in correct positions
    const iranGroupTeams = teams.filter((team) => team.group === iranGroup);
    prediction.groups[iranGroup] = iranGroupTeams.map((team) => [team.id]);

    // For other groups: rotate teams by 1 group to ENSURE they're wrong
    // A gets B's teams, B gets C's teams, etc.
    const groupOrder = ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

    groupOrder.forEach((group, index) => {
      const nextIndex = (index + 1) % groupOrder.length;
      const sourceGroup = groupOrder[nextIndex];
      const sourceTeams = teams.filter((team) => team.group === sourceGroup);
      prediction.groups[group] = sourceTeams.map((team) => [team.id]);
    });

    return prediction;
  }

  /**
   * Create prediction with one complete group correct - 40 points
   * Strategy: Group A perfect, rotate all other teams to ensure wrongness
   */
  static createOneGroupCorrectPrediction(teams: Team[]): any {
    const prediction: any = { groups: {} };

    // Choose group A as the correct one
    const correctGroup = 'A';
    const correctGroupTeams = teams.filter((team) => team.group === correctGroup);
    prediction.groups[correctGroup] = correctGroupTeams.map((team) => [team.id]);

    // For other groups: rotate teams by 1 group (B gets C's teams, C gets D's teams, etc.)
    const groupOrder = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

    groupOrder.forEach((group, index) => {
      const nextIndex = (index + 1) % groupOrder.length;
      const sourceGroup = groupOrder[nextIndex];
      const sourceTeams = teams.filter((team) => team.group === sourceGroup);
      prediction.groups[group] = sourceTeams.map((team) => [team.id]);
    });

    return prediction;
  }

  /**
   * Create prediction with 3 teams from one group correct - 20 points
   * Strategy: Group A has 3 correct + 1 wrong, rotate all other teams
   */
  static createThreeTeamsOneGroupPrediction(teams: Team[]): any {
    const prediction: any = { groups: {} };

    // Choose group A and put 3 correct teams + 1 wrong team from group B
    const targetGroup = 'A';
    const targetGroupTeams = teams.filter((team) => team.group === targetGroup);
    const groupBTeams = teams.filter((team) => team.group === 'B');

    // Take 3 correct from A + 1 from B
    prediction.groups[targetGroup] = [
      [targetGroupTeams[0].id],
      [targetGroupTeams[1].id],
      [targetGroupTeams[2].id],
      [groupBTeams[0].id], // Wrong team from B
    ];

    // For other groups: rotate teams to ensure no perfect groups
    // B gets C's teams (missing one that went to A), C gets D's teams, etc.
    const otherGroups = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

    otherGroups.forEach((group, index) => {
      const nextIndex = (index + 1) % otherGroups.length;
      const sourceGroup = otherGroups[nextIndex];
      const sourceTeams = teams.filter((team) => team.group === sourceGroup);
      prediction.groups[group] = sourceTeams.map((team) => [team.id]);
    });

    return prediction;
  }
}
