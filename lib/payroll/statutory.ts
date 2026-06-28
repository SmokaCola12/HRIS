import {
  AttendanceRepository,
  EmployeeRepository,
  HolidayRepository,
  LoanExtensionRequestRepository,
  OTRequestRepository,
  PayrollOtCarryoverRepository,
  PayrollRepository,
  SalaryAdvanceRepository,
  TardinessPointRepository,
} from '@/lib/db/models';
import { buildEarningsBreakdown } from '@/lib/payroll/payslip-values';
import { formulaValue as value, getFormulaMap, roundMoney as round, salaryRates } from '@/lib/payroll/rates';

type FormulaMap = Record<string, number>;
type PayrollMode = 'standard' | 'sunday-cutoff-weekly';

type PayrollResult = {
  employee_id: number;
  period_start: string;
  period_end: string;
  basic_salary: number;
  days_worked: number;
  regular_hours: number;
  overtime_hours: number;
  overtime_pay: number;
  night_shift_pay: number;
  holiday_pay: number;
  allowances: number;
  gross_pay: number;
  sss_deduction: number;
  philhealth_deduction: number;
  pagibig_deduction: number;
  tax_deduction: number;
  salary_advance_deduction: number;
  late_deduction_minutes: number;
  late_absence_equivalents: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function minuteOfDay(time?: string | null) {
  if (!time) return null;
  const [hours, minutes] = String(time).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function enumerateDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (current <= end) {
    dates.push(dateOnly(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function isRestDay(date: string, formulas: FormulaMap) {
  const restDay = value(formulas, 'default_rest_day_iso', 0);
  return new Date(`${date}T00:00:00`).getDay() === restDay;
}

function dayFactor(date: string, formulas: FormulaMap) {
  const holidays = HolidayRepository.findAll().filter((holiday) => holiday.date === date);
  const configuredHolidayFactor = Math.max(...holidays.map((holiday) => Number(holiday.pay_multiplier || 0)), 0);
  if (configuredHolidayFactor > 0) return configuredHolidayFactor;

  const regularCount = holidays.filter((holiday) => holiday.type === 'Regular').length;
  const specialCount = holidays.filter((holiday) => holiday.type === 'Special').length;
  const restDay = isRestDay(date, formulas);

  if (regularCount >= 2 && restDay) return value(formulas, 'day_factor_double_regular_rest', 3.9);
  if (regularCount >= 2) return value(formulas, 'day_factor_double_regular', 3);
  if (regularCount === 1 && restDay) return value(formulas, 'day_factor_regular_rest', 2.6);
  if (regularCount === 1) return value(formulas, 'day_factor_regular_holiday', 2);
  if (specialCount >= 2 && restDay) return value(formulas, 'day_factor_double_special_rest', 1.95);
  if (specialCount >= 2) return value(formulas, 'day_factor_double_special', 1.5);
  if (specialCount === 1 && restDay) return value(formulas, 'day_factor_special_rest', 1.5);
  if (specialCount === 1) return value(formulas, 'day_factor_special_holiday', 1.3);
  if (restDay) return value(formulas, 'day_factor_rest_day', 1.3);
  return value(formulas, 'day_factor_ordinary', 1);
}

function approvedOtHours(employeeId: number, date: string) {
  return OTRequestRepository.findAll()
    .filter((request) => request.employee_id === employeeId && request.status === 'Approved' && request.ot_date === date)
    .reduce((sum, request) => sum + Number(request.hours || 0), 0);
}

function cutoffPaidRegularHours(record: any, fallbackHours: number, periodStart: string, periodEnd: string, mode: PayrollMode) {
  if (mode !== 'sunday-cutoff-weekly') return Math.min(Number(record.total_hours || fallbackHours), fallbackHours);
  if (record.date === periodStart) return 0;
  if (record.date !== periodEnd) return Math.min(Number(record.total_hours || fallbackHours), fallbackHours);

  const start = minuteOfDay(record.time_in ?? record.check_in);
  const rawEnd = minuteOfDay(record.time_out ?? record.check_out);
  if (start === null || rawEnd === null) return Math.min(Number(record.total_hours || fallbackHours), fallbackHours);

  let end = rawEnd;
  if (end <= start) end += 1440;
  const cutoff = 15 * 60;
  const minutesBeforeCutoff = Math.max(0, Math.min(end, cutoff) - start);
  return Math.min(minutesBeforeCutoff / 60, fallbackHours);
}

function carryoverRowsBySourceDate(employeeId: number, periodStart: string, periodEnd: string, mode: PayrollMode) {
  if (mode !== 'sunday-cutoff-weekly') return new Map<string, any[]>();
  const rows = PayrollOtCarryoverRepository.findByPayablePeriod(employeeId, periodStart, periodEnd);
  const map = new Map<string, any[]>();
  for (const row of rows) {
    const date = String(row.source_date);
    map.set(date, [...(map.get(date) ?? []), row]);
  }
  return map;
}

function nightShiftHours(record: any, formulas: FormulaMap) {
  const start = minuteOfDay(record.time_in ?? record.check_in);
  const rawEnd = minuteOfDay(record.time_out ?? record.check_out);
  if (start === null || rawEnd === null) return 0;

  let end = rawEnd;
  if (end <= start) end += 1440;

  const nightStart = value(formulas, 'night_shift_start_hour', 22) * 60;
  const nightEnd = value(formulas, 'night_shift_end_hour', 6) * 60;
  let overlap = 0;

  for (const dayOffset of [-1, 0, 1]) {
    const base = dayOffset * 1440;
    const intervalStart = base + nightStart;
    const intervalEnd = nightStart < nightEnd
      ? base + nightEnd
      : base + 1440 + nightEnd;
    overlap += Math.max(0, Math.min(end, intervalEnd) - Math.max(start, intervalStart));
  }

  return overlap / 60;
}

function lateAbsenceEquivalentsForPeriod(employeeId: number, periodStart: string, periodEnd: string) {
  const years = new Set(enumerateDates(periodStart, periodEnd).map((date) => Number(date.slice(0, 4))));
  let equivalents = 0;

  for (const year of years) {
    const points = TardinessPointRepository.findByEmployeeYear(employeeId, year);
    const beforePeriod = points
      .filter((point) => point.date < periodStart)
      .reduce((sum, point) => sum + Number(point.points || 0), 0);
    const throughPeriod = points
      .filter((point) => point.date <= periodEnd)
      .reduce((sum, point) => sum + Number(point.points || 0), 0);

    equivalents += Math.max(0, Math.floor(throughPeriod) - Math.floor(beforePeriod));
  }

  return equivalents;
}

function regularHolidayPay(employeeId: number, periodStart: string, periodEnd: string, dailyRate: number) {
  let holidayPay = 0;
  const holidays = HolidayRepository.findAll().filter((holiday) =>
    holiday.type === 'Regular' && holiday.date >= periodStart && holiday.date <= periodEnd
  );

  for (const holiday of holidays) {
    const worked = AttendanceRepository.findByEmployeeAndDate(employeeId, holiday.date);
    if (worked?.time_in || worked?.check_in) continue;

    let cursor = new Date(`${holiday.date}T00:00:00`);
    let eligible = false;
    for (let i = 0; i < 14; i++) {
      cursor = new Date(cursor.getTime() - DAY_MS);
      const date = dateOnly(cursor);
      if (HolidayRepository.findAll().some((item) => item.date === date) || cursor.getDay() === 0) continue;
      const previousAttendance = AttendanceRepository.findByEmployeeAndDate(employeeId, date);
      eligible = previousAttendance?.status === 'Present' || previousAttendance?.status === 'Late' || previousAttendance?.status === 'On Leave';
      break;
    }
    if (eligible) holidayPay += dailyRate;
  }

  return holidayPay;
}

function statutoryDeductions(grossPay: number, formulas: FormulaMap) {
  if (grossPay <= 0) {
    return {
      sss: 0,
      philhealth: 0,
      pagibig: 0,
      tax: 0,
    };
  }

  const sssBase = Math.min(
    Math.max(grossPay, value(formulas, 'sss_msc_floor', 5000)),
    value(formulas, 'sss_msc_ceiling', 35000)
  );
  const sss = sssBase * value(formulas, 'sss_employee_rate', 0.05);

  const philhealthBase = Math.min(
    Math.max(grossPay, value(formulas, 'philhealth_salary_floor', 10000)),
    value(formulas, 'philhealth_salary_ceiling', 100000)
  );
  const philhealth = philhealthBase * value(formulas, 'philhealth_total_rate', 0.05) * value(formulas, 'philhealth_employee_share', 0.5);

  const pagibigBase = Math.min(grossPay, value(formulas, 'pagibig_compensation_ceiling', 10000));
  const pagibigRate = grossPay <= value(formulas, 'pagibig_low_salary_threshold', 1500)
    ? value(formulas, 'pagibig_employee_low_rate', 0.01)
    : value(formulas, 'pagibig_employee_high_rate', 0.02);
  const pagibig = Math.min(pagibigBase * pagibigRate, value(formulas, 'pagibig_employee_cap', 200));

  const deMinimis = value(formulas, 'de_minimis_exempt_allowances', 0);
  const taxable = Math.max(0, grossPay - sss - philhealth - pagibig - deMinimis);
  const tax = calculateTrainMonthlyTax(taxable);

  return {
    sss: round(sss),
    philhealth: round(philhealth),
    pagibig: round(pagibig),
    tax: round(tax),
  };
}

export function calculateStatutoryDeductionsForGross(grossPay: number) {
  return statutoryDeductions(grossPay, getFormulaMap());
}

function calculateTrainMonthlyTax(taxable: number) {
  if (taxable <= 20833) return 0;
  if (taxable <= 33332) return (taxable - 20833) * 0.15;
  if (taxable <= 66666) return 1875 + (taxable - 33333) * 0.2;
  if (taxable <= 166666) return 8541.67 + (taxable - 66667) * 0.25;
  if (taxable <= 666666) return 33541.67 + (taxable - 166667) * 0.3;
  return 183541.67 + (taxable - 666666) * 0.35;
}

export function calculateStatutoryPayroll(
  employeeId: number,
  periodStart: string,
  periodEnd: string,
  options: { periodMode?: PayrollMode | string } = {}
): PayrollResult | null {
  const employee = EmployeeRepository.findById(employeeId);
  if (!employee) return null;

  const formulas = getFormulaMap();
  const rates = salaryRates(employee, formulas);
  const attendance = AttendanceRepository.findByEmployeeAndDateRange(employeeId, periodStart, periodEnd);
  const attendanceByDate = new Map(attendance.map((record) => [record.date, record]));
  const periodMode = options.periodMode === 'sunday-cutoff-weekly' ? 'sunday-cutoff-weekly' : 'standard';
  const carryoversBySourceDate = carryoverRowsBySourceDate(employeeId, periodStart, periodEnd, periodMode);

  let daysWorked = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let basicPay = 0;
  let overtimePay = 0;
  let nightShiftPay = 0;
  let totalLateMinutes = 0;
  let totalUndertimeMinutes = 0;

  for (const date of enumerateDates(periodStart, periodEnd)) {
    const record = attendanceByDate.get(date);
    const factor = dayFactor(date, formulas);
    const otHours = approvedOtHours(employeeId, date);
    const carryoverRows = carryoversBySourceDate.get(date) ?? [];
    const carryoverHours = carryoverRows.reduce((sum, carryover) => sum + Number(carryover.hours || 0), 0);
    const otMultiplier = factor === 1
      ? value(formulas, 'ot_multiplier_regular', 1.25)
      : value(formulas, 'ot_multiplier_premium_day', 1.3);
    const nightPremiumRate = Math.max(0, value(formulas, 'night_shift_multiplier', 1.1) - 1);

    overtimeHours += otHours + carryoverHours;
    overtimePay += (otHours + carryoverHours) * rates.hourly * factor * otMultiplier;

    if (!record || !['Present', 'Late'].includes(record.status)) continue;

    const paidRegularHours = cutoffPaidRegularHours(record, rates.workingHours, periodStart, periodEnd, periodMode);
    if (paidRegularHours <= 0 && periodMode === 'sunday-cutoff-weekly') continue;

    daysWorked += 1;
    regularHours += paidRegularHours;
    basicPay += paidRegularHours * rates.hourly * factor;
    nightShiftPay += nightShiftHours(record, formulas) * rates.hourly * factor * nightPremiumRate;
    totalLateMinutes += Number(record.late_minutes || 0);
    totalUndertimeMinutes += Number(record.undertime_minutes || 0);
  }

  const holidayPay = regularHolidayPay(employeeId, periodStart, periodEnd, rates.daily);
  const grade = rates.grade;
  const allowances = Number(grade?.food_allowance || 0) +
    Number(grade?.transportation_allowance || 0) +
    Number(grade?.communication_allowance || 0) +
    Number(grade?.housing_allowance || 0);

  const grossPay = round(basicPay + overtimePay + nightShiftPay + holidayPay + allowances);
  const deductions = statutoryDeductions(grossPay, formulas);
  const salaryAdvanceDeduction = SalaryAdvanceRepository.findAll()
    .filter((advance) => advance.employee_id === employeeId && advance.status === 'Approved')
    .reduce((sum, advance) => {
      const approvedExtensionMonths = LoanExtensionRequestRepository.findAll()
        .filter((extension) =>
          extension.salary_advance_id === advance.id &&
          extension.employee_id === employeeId &&
          extension.status === 'Approved'
        )
        .reduce((months, extension) => months + Number(extension.requested_extra_months || 0), 0);
      const repaymentMonths = Math.max(1, Number(advance.repayment_months || 1) + approvedExtensionMonths);
      return sum + Number(advance.amount || 0) / repaymentMonths;
    }, 0);
  const lateAbsenceEquivalents = lateAbsenceEquivalentsForPeriod(employeeId, periodStart, periodEnd);
  // Handbook policy converts each newly crossed whole tardiness point into one
  // absence-equivalent deduction at the daily rate. The legacy per-minute
  // formula key stays seeded for display/backward compatibility but is not used
  // here to avoid double-deducting the same late occurrence.
  const lateDeduction = lateAbsenceEquivalents * rates.daily;
  const undertimeDeduction = totalUndertimeMinutes * (rates.hourly / 60);
  const otherDeductions = round(lateDeduction + undertimeDeduction);
  const totalDeductions = round(
    deductions.sss +
    deductions.philhealth +
    deductions.pagibig +
    deductions.tax +
    salaryAdvanceDeduction +
    otherDeductions
  );

  return {
    employee_id: employeeId,
    period_start: periodStart,
    period_end: periodEnd,
    basic_salary: round(basicPay),
    days_worked: daysWorked,
    regular_hours: round(regularHours),
    overtime_hours: round(overtimeHours),
    overtime_pay: round(overtimePay),
    night_shift_pay: round(nightShiftPay),
    holiday_pay: round(holidayPay),
    allowances: round(allowances),
    gross_pay: grossPay,
    sss_deduction: deductions.sss,
    philhealth_deduction: deductions.philhealth,
    pagibig_deduction: deductions.pagibig,
    tax_deduction: deductions.tax,
    salary_advance_deduction: round(salaryAdvanceDeduction),
    late_deduction_minutes: totalLateMinutes,
    late_absence_equivalents: lateAbsenceEquivalents,
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay: round(Math.max(0, grossPay - totalDeductions)),
  };
}

export function calculateThirteenthMonthPay(employeeId: number, year: number) {
  const formulas = getFormulaMap();
  const divisor = value(formulas, 'thirteenth_month_divisor', 12);
  const payrolls = EmployeeRepository.findById(employeeId)
    ? PayrollRepository.findByEmployee(employeeId)
    : [];
  const basicSalaryEarned = payrolls
    .filter((payroll) =>
      (payroll.payroll_type ?? 'Regular') === 'Regular' &&
      payroll.status === 'Paid' &&
      String(payroll.period_start).startsWith(String(year))
    )
    .reduce((sum, payroll) => sum + buildEarningsBreakdown(payroll).basic_pay, 0);
  return round(basicSalaryEarned / divisor);
}
