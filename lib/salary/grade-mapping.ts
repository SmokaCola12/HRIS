// Salary Grade to Position Mapping
// Maps positions to their salary grades for auto-fill functionality

export const positionToSalaryGradeMap: Record<number, number> = {
  1: 3, // Software Developer -> Level 3-C (Senior)
  2: 4, // HR Manager -> Level 4-D (Manager)
  3: 2, // Accountant -> Level 2-B (Junior)
  4: 4, // Team Lead -> Level 4-D (Manager)
};

export const salaryGradeToMonthlyMap: Record<number, number> = {
  1: 11000,  // Level 1-A (Entry) -> 500/day * 22 days
  2: 14300,  // Level 2-B (Junior) -> 650/day * 22 days
  3: 18700,  // Level 3-C (Senior) -> 850/day * 22 days
  4: 55000,  // Level 4-D (Manager) -> 2500/day * 22 days
  5: 99000,  // Level 5-E (Executive) -> 4500/day * 22 days
};

/**
 * Gets the monthly salary for a given salary grade ID
 */
export function getMonthlyFromGrade(gradeId: number): number {
  return salaryGradeToMonthlyMap[gradeId] || 0;
}

/**
 * Gets the salary grade ID for a given position ID
 */
export function getGradeFromPosition(positionId: number): number {
  return positionToSalaryGradeMap[positionId] || 0;
}

/**
 * Gets the monthly salary for a given position ID
 */
export function getMonthlyFromPosition(positionId: number): number {
  const gradeId = getGradeFromPosition(positionId);
  return getMonthlyFromGrade(gradeId);
}
