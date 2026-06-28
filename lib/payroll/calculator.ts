import { calculateStatutoryPayroll } from '@/lib/payroll/statutory';

interface PayrollCalculationInput {
  employee: { id: number };
  period_start: string;
  period_end: string;
}

export function calculatePayroll(input: PayrollCalculationInput) {
  const result = calculateStatutoryPayroll(
    input.employee.id,
    input.period_start,
    input.period_end
  );

  if (!result) {
    throw new Error(`Unable to calculate payroll for employee ${input.employee.id}`);
  }

  return result;
}
