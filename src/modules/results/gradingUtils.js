'use strict';

/**
 * Institutional Grading Scale & Calculation Utilities (Phase 5A)
 * 
 * Assumption / Standard Scale:
 * Standard 10-point letter grading system based on percentage:
 * - 90% and above: S (Outstanding)
 * - 80% to 89.99%: A (Excellent)
 * - 70% to 79.99%: B (Very Good)
 * - 60% to 69.99%: C (Good)
 * - 50% to 59.99%: D (Average)
 * - 40% to 49.99%: E (Pass)
 * - Below 40%: F (Fail)
 *
 * This configuration is isolated and modular so institutional grade boundaries
 * can be updated or customized without touching business logic.
 */
const DEFAULT_GRADING_SCALE = Object.freeze([
  { minPercentage: 90.0, grade: 'S' },
  { minPercentage: 80.0, grade: 'A' },
  { minPercentage: 70.0, grade: 'B' },
  { minPercentage: 60.0, grade: 'C' },
  { minPercentage: 50.0, grade: 'D' },
  { minPercentage: 40.0, grade: 'E' },
  { minPercentage: 0.0, grade: 'F' },
]);

/**
 * Calculate percentage from marks obtained and maximum marks
 * @param {number|string} marksObtained
 * @param {number|string} maximumMarks
 * @returns {number} Float percentage rounded to 2 decimal places
 */
function calculatePercentage(marksObtained, maximumMarks) {
  const max = Number(maximumMarks);
  if (!max || max <= 0) return 0;
  const marks = Number(marksObtained);
  const pct = (marks / max) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculate letter grade based on percentage using the grading scale
 * @param {number} percentage
 * @param {Array} gradingScale
 * @returns {string} Letter grade (S, A, B, C, D, E, F)
 */
function calculateGrade(percentage, gradingScale = DEFAULT_GRADING_SCALE) {
  const pct = Number(percentage);
  for (const tier of gradingScale) {
    if (pct >= tier.minPercentage) {
      return tier.grade;
    }
  }
  return 'F';
}

module.exports = {
  DEFAULT_GRADING_SCALE,
  calculatePercentage,
  calculateGrade,
};
