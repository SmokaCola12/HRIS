export function moneyValue(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return Math.round((amount + Number.EPSILON) * 100) / 100;
  }
  return 0;
}

export function buildEarningsBreakdown(payroll: Record<string, any>) {
  const overtimePay = moneyValue(payroll.ot_pay, payroll.overtime_pay);
  const nightShiftPay = moneyValue(payroll.night_shift_pay);
  const holidayPay = moneyValue(payroll.holiday_pay);
  const allowances = moneyValue(payroll.allowances);
  const grossPay = moneyValue(payroll.gross_pay);
  const storedBasicPay = moneyValue(payroll.basic_pay, payroll.basic_salary);
  const inferredBasicPay = Math.max(0, grossPay - overtimePay - nightShiftPay - holidayPay - allowances);
  const basicPay = storedBasicPay > 0 ? storedBasicPay : moneyValue(inferredBasicPay);

  return {
    basic_pay: basicPay,
    overtime_pay: overtimePay,
    night_shift_pay: nightShiftPay,
    holiday_pay: holidayPay,
    allowances,
    gross_pay: grossPay,
    basic_pay_source: storedBasicPay > 0 ? 'payroll.basic_salary' : 'gross pay reconciliation',
  };
}
