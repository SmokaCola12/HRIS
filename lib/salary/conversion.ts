// Salary Grade Conversion Utilities
// Converts between different pay frequencies using system formulas

import { getDatabase } from '@/lib/db/config';

/**
 * Gets the salary divisor from formulas (default: 22 working days)
 */
function getSalaryDivisor(): number {
  const db = getDatabase();
  const formula = db.formulas.find(f => f.key === 'salary_divisor');
  return formula ? parseFloat(formula.value) : 22;
}

/**
 * Gets the working hours per day (default: 8)
 */
function getWorkingHours(): number {
  const db = getDatabase();
  const formula = db.formulas.find(f => f.key === 'working_hours');
  return formula ? parseFloat(formula.value) : 8;
}

/**
 * Converts any salary frequency to monthly amount
 * @param amount - The salary amount in the specified frequency
 * @param frequency - 'hourly', 'daily', 'weekly', or 'monthly'
 * @returns Monthly salary amount
 */
export function convertToMonthly(amount: number, frequency: 'hourly' | 'daily' | 'weekly' | 'monthly'): number {
  const divisor = getSalaryDivisor();
  const workingHours = getWorkingHours();

  switch (frequency) {
    case 'hourly':
      // hourly → daily → monthly
      return (amount * workingHours * divisor);
    
    case 'daily':
      // daily → monthly
      return amount * divisor;
    
    case 'weekly':
      // weekly → monthly (approximately 4.33 weeks per month)
      return amount * 4.33;
    
    case 'monthly':
      // already monthly
      return amount;
    
    default:
      return amount;
  }
}

/**
 * Converts monthly salary to other frequencies
 * @param monthlySalary - The monthly salary amount
 * @param targetFrequency - Target frequency ('hourly', 'daily', 'weekly', or 'monthly')
 * @returns Salary in the target frequency
 */
export function convertFromMonthly(monthlySalary: number, targetFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly'): number {
  const divisor = getSalaryDivisor();
  const workingHours = getWorkingHours();

  switch (targetFrequency) {
    case 'hourly':
      // monthly → daily → hourly
      return (monthlySalary / divisor) / workingHours;
    
    case 'daily':
      // monthly → daily
      return monthlySalary / divisor;
    
    case 'weekly':
      // monthly → weekly (approximately 4.33 weeks per month)
      return monthlySalary / 4.33;
    
    case 'monthly':
      // already monthly
      return monthlySalary;
    
    default:
      return monthlySalary;
  }
}

/**
 * Gets all conversion rates for a given salary amount
 * @param amount - The salary amount
 * @param frequency - The frequency of the amount
 * @returns Object with hourly, daily, weekly, and monthly rates
 */
export function getAllConversionRates(amount: number, frequency: 'hourly' | 'daily' | 'weekly' | 'monthly') {
  const monthly = convertToMonthly(amount, frequency);
  
  return {
    hourly: convertFromMonthly(monthly, 'hourly'),
    daily: convertFromMonthly(monthly, 'daily'),
    weekly: convertFromMonthly(monthly, 'weekly'),
    monthly: monthly,
  };
}
