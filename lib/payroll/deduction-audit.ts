import { calculateStatutoryDeductionsForGross } from '@/lib/payroll/statutory';
import { moneyValue } from '@/lib/payroll/payslip-values';

export type DeductionAuditLine = {
  key: string;
  label: string;
  category: 'Statutory' | 'Repayment' | 'Attendance' | 'Other' | 'Reconciliation';
  amount: number;
  source: string;
  basis: string;
  note?: string;
  is_reconciliation?: boolean;
};

export type DeductionAudit = {
  sss: number;
  philhealth: number;
  pagibig: number;
  tax: number;
  salary_advance: number;
  other: number;
  recorded_total: number;
  component_total: number;
  itemized_total: number;
  reconciliation_difference: number;
  is_balanced: boolean;
  warnings: string[];
  line_items: DeductionAuditLine[];
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function firstAmount(...values: unknown[]) {
  return moneyValue(...values);
}

function pushLine(
  lineItems: DeductionAuditLine[],
  line: Omit<DeductionAuditLine, 'amount'> & { amount: number }
) {
  lineItems.push({ ...line, amount: roundMoney(Math.max(0, line.amount)) });
}

export function buildDeductionAudit(payroll: Record<string, any>): DeductionAudit {
  let sss = firstAmount(payroll.sss, payroll.sss_deduction);
  let philhealth = firstAmount(payroll.philhealth, payroll.philhealth_deduction);
  let pagibig = firstAmount(payroll.pagibig, payroll.pagibig_deduction);
  let tax = firstAmount(payroll.tax, payroll.tax_deduction);
  const salaryAdvance = firstAmount(payroll.advance_deduction, payroll.salary_advance_deduction);
  let other = firstAmount(payroll.other_deductions, payroll.late_deduction);
  const grossPay = firstAmount(payroll.gross_pay);
  const netPay = firstAmount(payroll.net_pay);
  const recordedTotal = firstAmount(
    payroll.total_deductions,
    grossPay > 0 && grossPay >= netPay ? grossPay - netPay : 0
  );
  const lateMinutes = firstAmount(payroll.late_deduction_minutes, payroll.late_minutes);
  const lateAbsenceEquivalents = firstAmount(payroll.late_absence_equivalents);
  const hasAttendanceDeductionFacts = lateMinutes > 0 || lateAbsenceEquivalents > 0;
  const lineItems: DeductionAuditLine[] = [];
  const storedStatutoryTotal = roundMoney(sss + philhealth + pagibig + tax);
  const recoveredStatutory = calculateStatutoryDeductionsForGross(grossPay);
  const recoveredStatutoryTotal = roundMoney(
    recoveredStatutory.sss + recoveredStatutory.philhealth + recoveredStatutory.pagibig + recoveredStatutory.tax
  );
  const shouldRecoverStatutory =
    grossPay > 0 &&
    recordedTotal > 0 &&
    storedStatutoryTotal === 0 &&
    recoveredStatutoryTotal > 0 &&
    recoveredStatutoryTotal <= recordedTotal + 0.01 &&
    String(payroll.payroll_type || 'Regular') !== '13th Month';
  const statutorySource = shouldRecoverStatutory ? 'statutory formula fallback' : 'payroll deduction column';
  const statutoryBasis = shouldRecoverStatutory
    ? 'recovered from recorded gross pay using the current statutory formula configuration because the payroll deduction column is empty'
    : 'recorded for this payroll period';

  if (shouldRecoverStatutory) {
    sss = recoveredStatutory.sss;
    philhealth = recoveredStatutory.philhealth;
    pagibig = recoveredStatutory.pagibig;
    tax = recoveredStatutory.tax;
  }

  const namedDeductionTotal = roundMoney(sss + philhealth + pagibig + tax + salaryAdvance);
  const attendanceResidual = roundMoney(recordedTotal - namedDeductionTotal);
  const shouldRecoverAttendanceDeduction =
    hasAttendanceDeductionFacts &&
    other === 0 &&
    attendanceResidual > 0;

  if (shouldRecoverAttendanceDeduction) {
    other = attendanceResidual;
  }

  pushLine(lineItems, {
    key: 'sss',
    label: 'SSS Contribution',
    category: 'Statutory',
    amount: sss,
    source: shouldRecoverStatutory ? 'formula.sss from payroll.gross_pay' : 'payroll.sss_deduction',
    basis: `Employee statutory contribution ${statutoryBasis}`,
    note: shouldRecoverStatutory ? statutorySource : undefined,
  });
  pushLine(lineItems, {
    key: 'philhealth',
    label: 'PhilHealth Contribution',
    category: 'Statutory',
    amount: philhealth,
    source: shouldRecoverStatutory ? 'formula.philhealth from payroll.gross_pay' : 'payroll.philhealth_deduction',
    basis: `Employee statutory health contribution ${statutoryBasis}`,
    note: shouldRecoverStatutory ? statutorySource : undefined,
  });
  pushLine(lineItems, {
    key: 'pagibig',
    label: 'Pag-IBIG Contribution',
    category: 'Statutory',
    amount: pagibig,
    source: shouldRecoverStatutory ? 'formula.pagibig from payroll.gross_pay' : 'payroll.pagibig_deduction',
    basis: `Employee statutory housing fund contribution ${statutoryBasis}`,
    note: shouldRecoverStatutory ? statutorySource : undefined,
  });
  pushLine(lineItems, {
    key: 'tax',
    label: 'Withholding Tax',
    category: 'Statutory',
    amount: tax,
    source: shouldRecoverStatutory ? 'formula.tax from payroll.gross_pay' : 'payroll.tax_deduction',
    basis: `Withholding tax ${statutoryBasis}`,
    note: shouldRecoverStatutory ? statutorySource : undefined,
  });
  pushLine(lineItems, {
    key: 'salary_advance',
    label: 'Salary Advance Repayment',
    category: 'Repayment',
    amount: salaryAdvance,
    source: 'payroll.salary_advance_deduction',
    basis: 'Approved salary advance repayment deducted in this period',
  });

  const otherLabel = hasAttendanceDeductionFacts
    ? 'Late / Undertime / Attendance Deduction'
    : 'Other / Manual Deduction';
  const otherBasis = hasAttendanceDeductionFacts
    ? shouldRecoverAttendanceDeduction
      ? 'Attendance-based deduction recovered from total deductions because late/absence facts were recorded but the attendance deduction column is empty'
      : 'Attendance-based deduction recorded in payroll'
    : 'Manual, legacy, or imported deduction balance recorded in payroll';
  const otherNote = hasAttendanceDeductionFacts
    ? `${lateMinutes} late/undertime minute(s)${lateAbsenceEquivalents > 0 ? `, ${lateAbsenceEquivalents} absence equivalent(s)` : ''}${shouldRecoverAttendanceDeduction ? '; recovered from recorded total deductions' : ''}`
    : undefined;

  pushLine(lineItems, {
    key: 'other',
    label: otherLabel,
    category: hasAttendanceDeductionFacts ? 'Attendance' : 'Other',
    amount: other,
    source: shouldRecoverAttendanceDeduction ? 'payroll.total_deductions residual after statutory deductions' : 'payroll.other_deductions',
    basis: otherBasis,
    note: otherNote,
  });

  const componentTotal = roundMoney(namedDeductionTotal + other);
  const residual = roundMoney(recordedTotal - componentTotal);
  const warnings: string[] = [];

  if (Math.abs(residual) >= 0.01) {
    pushLine(lineItems, {
      key: 'reconciliation',
      label: residual > 0 ? 'Unallocated Deduction Balance' : 'Deduction Over-Itemization Adjustment',
      category: 'Reconciliation',
      amount: Math.abs(residual),
      source: 'payroll.total_deductions reconciliation',
      basis: 'Balances itemized deductions to the recorded total deduction for audit traceability',
      note: residual > 0
        ? 'Specific deduction columns did not fully explain the recorded total.'
        : 'Itemized deduction columns exceeded the recorded total; review payroll source data.',
      is_reconciliation: true,
    });
    warnings.push('Recorded total deductions did not match the itemized deduction columns; a reconciliation line was added.');
  }

  if (recordedTotal > 0 && componentTotal === 0) {
    warnings.push('Specific deduction columns are empty while total deductions are recorded.');
  }
  if (shouldRecoverStatutory) {
    warnings.push('Statutory deduction columns were empty on this paid record; statutory lines were recovered from gross pay using current formula settings.');
  } else if (recordedTotal > 0 && namedDeductionTotal === 0 && other === recordedTotal) {
    warnings.push('Statutory and repayment deduction columns are zero; the recorded total is carried under other/manual deductions.');
  }
  if (shouldRecoverAttendanceDeduction) {
    warnings.push('Attendance deduction column was empty, but late/absence facts existed; the remaining total deduction balance was attributed to attendance deductions.');
  }

  const itemizedTotal = roundMoney(lineItems.reduce((sum, line) => {
    return sum + (line.key === 'reconciliation' && residual < 0 ? -line.amount : line.amount);
  }, 0));
  const difference = roundMoney(recordedTotal - itemizedTotal);

  return {
    sss,
    philhealth,
    pagibig,
    tax,
    salary_advance: salaryAdvance,
    other,
    recorded_total: recordedTotal,
    component_total: componentTotal,
    itemized_total: itemizedTotal,
    reconciliation_difference: difference,
    is_balanced: Math.abs(difference) < 0.01,
    warnings,
    line_items: lineItems,
  };
}
