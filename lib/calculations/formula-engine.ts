import { ensureInitialized, FormulaRepository } from '../db/models';

// Formula cache
let formulaCache: Map<string, number> = new Map();
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get all formulas from database (with caching)
 */
export function getFormulas(): Map<string, number> {
  const now = Date.now();
  
  if (formulaCache.size > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    return formulaCache;
  }

  ensureInitialized();
  const formulas = FormulaRepository.findAll();
  formulaCache = new Map(formulas.map(f => [f.key, Number(f.value)]));
  cacheTimestamp = now;
  
  return formulaCache;
}

/**
 * Get a single formula value
 */
export function getFormulaValue(key: string, defaultValue: number = 0): number {
  const formulas = getFormulas();
  return formulas.get(key) ?? defaultValue;
}

/**
 * Clear the formula cache (call when formulas are updated)
 */
export function clearFormulaCache() {
  formulaCache.clear();
  cacheTimestamp = 0;
}

/**
 * Calculate daily rate from monthly salary
 */
export function calculateDailyRate(monthlySalary: number): number {
  const divisor = getFormulaValue('salary_divisor', 22);
  return monthlySalary / divisor;
}

/**
 * Calculate hourly rate from daily rate
 */
export function calculateHourlyRate(dailyRate: number): number {
  const hoursPerDay = getFormulaValue('hours_per_day', 8);
  return dailyRate / hoursPerDay;
}

/**
 * Calculate overtime pay
 */
export function calculateOvertimePay(
  hourlyRate: number,
  hours: number,
  type: 'regular' | 'restday' | 'holiday' | 'special' = 'regular'
): number {
  const multiplierKey = {
    regular: 'ot_regular_multiplier',
    restday: 'ot_restday_multiplier',
    holiday: 'ot_holiday_multiplier',
    special: 'ot_holiday_multiplier',
  }[type];

  const multiplier = getFormulaValue(multiplierKey, 1.25);
  return hourlyRate * hours * multiplier;
}

/**
 * Calculate holiday pay
 */
export function calculateHolidayPay(
  dailyRate: number,
  type: 'Regular' | 'Special' = 'Regular'
): number {
  const rateKey = type === 'Regular' ? 'regular_holiday_multiplier' : 'special_holiday_multiplier';
  const rate = getFormulaValue(rateKey, type === 'Regular' ? 2.0 : 1.3);
  return dailyRate * rate;
}

/**
 * Calculate late deduction
 */
export function calculateLateDeduction(
  hourlyRate: number,
  lateMinutes: number
): number {
  const minuteRate = hourlyRate / 60;
  return minuteRate * lateMinutes;
}

/**
 * Calculate absent deduction
 */
export function calculateAbsentDeduction(
  dailyRate: number,
  daysAbsent: number
): number {
  return dailyRate * daysAbsent;
}

/**
 * Calculate government deductions (Philippine SSS, PhilHealth, Pag-IBIG)
 */
export function calculateGovernmentDeductions(grossPay: number): {
  sss: number;
  philhealth: number;
  pagibig: number;
} {
  const sssRate = getFormulaValue('sss_rate', 4.5) / 100;
  const philhealthRate = getFormulaValue('philhealth_rate', 2.0) / 100;
  const pagibigRate = getFormulaValue('pagibig_rate', 2.0) / 100;

  return {
    sss: Math.min(grossPay * sssRate, 1350), // SSS has a cap
    philhealth: grossPay * philhealthRate,
    pagibig: Math.min(grossPay * pagibigRate, 100), // Pag-IBIG has a cap
  };
}

/**
 * Calculate late status based on shift
 */
export function calculateLateMinutes(
  checkInTime: Date,
  shiftStartTime: string,
  graceMinutes?: number
): number {
  const grace = graceMinutes ?? getFormulaValue('late_grace_minutes', 15);
  const [shiftHour, shiftMin] = shiftStartTime.split(':').map(Number);
  
  const shiftStart = new Date(checkInTime);
  shiftStart.setHours(shiftHour, shiftMin, 0, 0);
  
  // Add grace period
  const graceEnd = new Date(shiftStart);
  graceEnd.setMinutes(graceEnd.getMinutes() + grace);
  
  if (checkInTime <= graceEnd) {
    return 0;
  }
  
  const diffMs = checkInTime.getTime() - shiftStart.getTime();
  return Math.floor(diffMs / 60000);
}

/**
 * Calculate undertime minutes
 */
export function calculateUndertimeMinutes(
  checkOutTime: Date,
  shiftEndTime: string
): number {
  const [shiftHour, shiftMin] = shiftEndTime.split(':').map(Number);
  
  const shiftEnd = new Date(checkOutTime);
  shiftEnd.setHours(shiftHour, shiftMin, 0, 0);
  
  if (checkOutTime >= shiftEnd) {
    return 0;
  }
  
  const diffMs = shiftEnd.getTime() - checkOutTime.getTime();
  return Math.floor(diffMs / 60000);
}

/**
 * Calculate overtime minutes (after shift end)
 */
export function calculateOvertimeMinutes(
  checkOutTime: Date,
  shiftEndTime: string
): number {
  const [shiftHour, shiftMin] = shiftEndTime.split(':').map(Number);
  
  const shiftEnd = new Date(checkOutTime);
  shiftEnd.setHours(shiftHour, shiftMin, 0, 0);
  
  if (checkOutTime <= shiftEnd) {
    return 0;
  }
  
  const diffMs = checkOutTime.getTime() - shiftEnd.getTime();
  return Math.floor(diffMs / 60000);
}

/**
 * Calculate total worked minutes
 */
export function calculateWorkedMinutes(
  checkIn: Date,
  checkOut: Date,
  breakMinutes: number = 60
): number {
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const totalMinutes = Math.floor(diffMs / 60000);
  return Math.max(0, totalMinutes - breakMinutes);
}

/**
 * Calculate payroll for an employee
 */
export function calculatePayroll(params: {
  basicSalary: number;
  daysWorked: number;
  regularHours: number;
  overtimeHours: number;
  holidayDays: number;
  holidayType?: 'Regular' | 'Special';
  salaryAdvanceDeduction?: number;
  otherDeductions?: number;
  allowances?: number;
}): {
  dailyRate: number;
  hourlyRate: number;
  basicPay: number;
  overtimePay: number;
  holidayPay: number;
  grossPay: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  totalDeductions: number;
  netPay: number;
} {
  const divisor = getFormulaValue('salary_divisor', 22);
  const dailyRate = params.basicSalary / divisor;
  const hourlyRate = dailyRate / getFormulaValue('hours_per_day', 8);
  
  const basicPay = dailyRate * params.daysWorked;
  const overtimePay = calculateOvertimePay(hourlyRate, params.overtimeHours);
  const holidayPay = params.holidayDays > 0 
    ? calculateHolidayPay(dailyRate, params.holidayType) * params.holidayDays 
    : 0;
  
  const grossPay = basicPay + overtimePay + holidayPay + (params.allowances || 0);
  
  const govDeductions = calculateGovernmentDeductions(grossPay);
  const totalDeductions = govDeductions.sss + govDeductions.philhealth + govDeductions.pagibig 
    + (params.salaryAdvanceDeduction || 0) + (params.otherDeductions || 0);
  
  return {
    dailyRate,
    hourlyRate,
    basicPay,
    overtimePay,
    holidayPay,
    grossPay,
    sssDeduction: govDeductions.sss,
    philhealthDeduction: govDeductions.philhealth,
    pagibigDeduction: govDeductions.pagibig,
    totalDeductions,
    netPay: grossPay - totalDeductions,
  };
}
