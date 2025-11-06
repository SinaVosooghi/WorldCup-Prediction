/**
 * Shared helper functions for prediction processing
 */

/**
 * Flattens nested arrays in prediction data
 * Converts [["team1"],["team2"]] → ["team1","team2"]
 */
export function flattenPredictionGroups(predict: { [group: string]: any }): {
  [group: string]: string[];
} {
  return Object.fromEntries(
    Object.entries(predict).map(([group, teams]) => [
      group,
      Array.isArray(teams) ? teams.flat() : teams,
    ]),
  );
}

/**
 * Checks if two sets are equal (same size and all elements match)
 */
export function areSetsEqual(set1: Set<string>, set2: Set<string>): boolean {
  return set1.size === set2.size && [...set1].every((item) => set2.has(item));
}

/**
 * Finds the group name that contains a specific team
 */
export function findGroupWithTeam(
  groups: { [group: string]: string[] } | Map<string, string[]>,
  teamId: string,
): string | null {
  if (groups instanceof Map) {
    for (const [group, teams] of groups.entries()) {
      if (teams.includes(teamId)) {
        return group;
      }
    }
  } else {
    for (const [group, teams] of Object.entries(groups)) {
      if (teams.includes(teamId)) {
        return group;
      }
    }
  }
  return null;
}
