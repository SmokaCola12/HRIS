import {
  FormulaRepository,
  SalaryAdvanceRepository,
  SalaryGradeRepository,
} from '@/lib/db/models';

export type FormulaMap = Record<string, number>;

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getFormulaMap(): FormulaMap {
  const formulas: FormulaMap = {};
  for (const formula of FormulaRepository.findAll()) {
    const value = Number(formula.value);
    if (Number.isFinite(value)) formulas[formula.key] = value;
  }
  return formulas;
}

export function formulaValue(formulas: FormulaMap, key: string, fallback: number) {
  return Number.isFinite(formulas[key]) ? formulas[key] : fallback;
}

export function salaryRates(employee: Record<string, any>, formulas = getFormulaMap()) {
  const grade = employee.salary_grade_id ? SalaryGradeRepository.findById(employee.salary_grade_id) : null;
  const amount = Number(grade?.amount ?? employee.basic_salary ?? 0);
  const frequency = String(grade?.frequency ?? 'monthly');
  const workingDays = formulaValue(formulas, 'working_days_per_month', formulaValue(formulas, 'salary_divisor', 22));
  const workingHours = formulaValue(formulas, 'working_hours_per_day', 8);

  let monthly = amount;
  if (frequency === 'hourly') monthly = amount * workingHours * workingDays;
  if (frequency === 'daily') monthly = amount * workingDays;
  if (frequency === 'weekly') monthly = amount * formulaValue(formulas, 'weeks_per_month', 4.333333);

  const daily = frequency === 'daily' ? amount : monthly / workingDays;
  const hourly = frequency === 'hourly' ? amount : daily / workingHours;

  return {
    grade,
    amount,
    frequency,
    monthly: roundMoney(monthly),
    daily: roundMoney(daily),
    hourly: roundMoney(hourly),
    workingDays,
    workingHours,
  };
}

export function salaryAdvanceLimit(employee: Record<string, any>) {
  const rates = salaryRates(employee);
  const maxAdvance = roundMoney(rates.monthly * 0.5);
  const openRequests = SalaryAdvanceRepository.findAll()
    .filter((advance) =>
      advance.employee_id === employee.id &&
      ['Pending', 'Approved'].includes(String(advance.status))
    );
  const reservedAmount = roundMoney(openRequests.reduce((sum, advance) => sum + Number(advance.amount || 0), 0));

  return {
    salary_grade: rates.grade ? {
      id: rates.grade.id,
      name: rates.grade.grade_name,
      amount: Number(rates.grade.amount || 0),
      frequency: rates.grade.frequency,
    } : null,
    monthly_equivalent: rates.monthly,
    max_advance: maxAdvance,
    reserved_amount: reservedAmount,
    available_amount: roundMoney(Math.max(0, maxAdvance - reservedAmount)),
    cap_rate: 0.5,
    working_days_per_month: rates.workingDays,
  };
}
