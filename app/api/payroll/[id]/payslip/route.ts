import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, PayrollRepository, EmployeeRepository, DepartmentRepository, PositionRepository, SalaryGradeRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { canViewEmployee } from '@/lib/employees/access';
import { buildDeductionAudit } from '@/lib/payroll/deduction-audit';
import { buildEarningsBreakdown } from '@/lib/payroll/payslip-values';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const payrollId = parseInt(id);
    
    const payroll = PayrollRepository.findById(payrollId);
    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    }

    const employee = EmployeeRepository.findById(payroll.employee_id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    if (user.role === 'Employee' && (payroll.employee_id !== user.id || payroll.status !== 'Paid')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (user.role !== 'Employee' && !canViewEmployee(user, employee)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const department = employee?.department_id ? DepartmentRepository.findById(employee.department_id) : null;
    const position = employee?.position_id ? PositionRepository.findById(employee.position_id) : null;
    const salaryGrade = employee?.salary_grade_id ? SalaryGradeRepository.findById(employee.salary_grade_id) : null;
    const earnings = buildEarningsBreakdown(payroll);
    const basicPay = earnings.basic_pay;
    const overtimeHours = Number(payroll.ot_hours ?? payroll.overtime_hours ?? 0);
    const overtimePay = earnings.overtime_pay;
    const nightShiftPay = earnings.night_shift_pay;
    const deductionAudit = buildDeductionAudit(payroll);

    // Generate HTML payslip
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
      }).format(amount);
    };
    const visibleDeductionLines = deductionAudit.line_items;
    const deductionRows = visibleDeductionLines.map((line) => `
          <tr>
            <td>
              <strong>${line.label}</strong>
              ${line.note ? `<div class="muted">${line.note}</div>` : ''}
              ${line.amount === 0 ? '<div class="muted">No deduction recorded for this payroll period.</div>' : ''}
            </td>
            <td>
              ${line.category}
              <div class="muted">${line.basis}</div>
              <div class="source">${line.source}</div>
            </td>
            <td class="amount deduction">${formatCurrency(line.amount)}</td>
          </tr>
    `).join('');
    const auditWarnings = deductionAudit.warnings.map((warning) => `
          <div class="audit-warning">${warning}</div>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payslip - ${employee?.name || 'Employee'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .payslip { max-width: 800px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; }
    .company-name { font-size: 24px; font-weight: bold; color: #1e40af; }
    .payslip-title { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
    .period { font-size: 12px; color: #888; margin-top: 5px; }
    .employee-info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 8px; }
    .info-group { }
    .info-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
    .info-value { font-size: 14px; font-weight: 600; color: #333; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 12px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 10px 12px; text-align: left; font-size: 13px; }
    .table th { background: #f1f5f9; color: #475569; font-weight: 600; font-size: 11px; text-transform: uppercase; }
    .table td { border-bottom: 1px solid #f1f5f9; }
    .table .amount { text-align: right; font-family: 'Courier New', monospace; }
    .table .deduction { color: #dc2626; }
    .table .total-row { background: #f8fafc; font-weight: 600; }
    .table .total-row td { border-top: 2px solid #e5e7eb; }
    .muted { margin-top: 2px; font-size: 10px; color: #64748b; line-height: 1.35; }
    .source { margin-top: 2px; font-size: 9px; color: #94a3b8; font-family: 'Courier New', monospace; }
    .audit-warning { margin: 8px 0; padding: 8px 10px; border-left: 3px solid #f59e0b; background: #fffbeb; color: #92400e; font-size: 11px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 30px; padding-top: 20px; border-top: 2px solid #1e40af; }
    .summary-box { text-align: center; padding: 15px; border-radius: 8px; }
    .summary-box.gross { background: #dbeafe; }
    .summary-box.deductions { background: #fee2e2; }
    .summary-box.net { background: #dcfce7; }
    .summary-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
    .summary-value { font-size: 20px; font-weight: bold; }
    .summary-box.gross .summary-value { color: #1e40af; }
    .summary-box.deductions .summary-value { color: #dc2626; }
    .summary-box.net .summary-value { color: #16a34a; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
    .signature-line { margin-top: 60px; display: flex; justify-content: space-between; }
    .signature-box { text-align: center; width: 200px; }
    .signature-box .line { border-top: 1px solid #333; margin-bottom: 5px; }
    .signature-box .label { font-size: 11px; color: #666; }
    @media print {
      body { padding: 0; background: white; }
      .payslip { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="payslip">
    <div class="header">
      <div>
        <div class="company-name">D' NORTH RIVERSIDE RESORT AND WATERPARK CORP.</div>
        <div class="period">Human Resource Information System</div>
      </div>
      <div style="text-align: right;">
        <div class="payslip-title">Payslip</div>
        <div class="period">${new Date(payroll.period_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${new Date(payroll.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </div>

    <div class="employee-info">
      <div class="info-group">
        <div class="info-label">Employee Name</div>
        <div class="info-value">${employee?.name || 'N/A'}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Employee ID</div>
        <div class="info-value">${employee?.employee_id || 'N/A'}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Department</div>
        <div class="info-value">${department?.name || 'N/A'}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Position</div>
        <div class="info-value">${position?.name || 'N/A'}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Salary Grade</div>
        <div class="info-value">${salaryGrade?.grade_name || 'N/A'}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Days Worked</div>
        <div class="info-value">${payroll.days_worked || 0} days</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Earnings</div>
      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Basic Pay (${payroll.days_worked || 0} days)</td>
            <td class="amount">${formatCurrency(basicPay)}</td>
          </tr>
          ${overtimePay > 0 ? `
          <tr>
            <td>Overtime Pay (${overtimeHours} hours)</td>
            <td class="amount">${formatCurrency(overtimePay)}</td>
          </tr>
          ` : ''}
          ${nightShiftPay > 0 ? `
          <tr>
            <td>Night Shift Differential</td>
            <td class="amount">${formatCurrency(nightShiftPay)}</td>
          </tr>
          ` : ''}
          ${earnings.allowances > 0 ? `
          <tr>
            <td>Allowances</td>
            <td class="amount">${formatCurrency(earnings.allowances)}</td>
          </tr>
          ` : ''}
          <tr class="total-row">
            <td><strong>Total Earnings</strong></td>
            <td class="amount"><strong>${formatCurrency(earnings.gross_pay)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Deductions</div>
      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Audit Basis</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${deductionRows}
          <tr class="total-row">
            <td colspan="2"><strong>Total Deductions</strong></td>
            <td class="amount deduction"><strong>${formatCurrency(payroll.total_deductions || 0)}</strong></td>
          </tr>
        </tbody>
      </table>
      ${auditWarnings}
      <div class="muted">
        Itemized total: ${formatCurrency(deductionAudit.itemized_total)} |
        Recorded total: ${formatCurrency(deductionAudit.recorded_total)} |
        Difference: ${formatCurrency(Math.abs(deductionAudit.reconciliation_difference))}
      </div>
    </div>

    <div class="summary">
      <div class="summary-box gross">
        <div class="summary-label">Gross Pay</div>
        <div class="summary-value">${formatCurrency(earnings.gross_pay)}</div>
      </div>
      <div class="summary-box deductions">
        <div class="summary-label">Total Deductions</div>
        <div class="summary-value">${formatCurrency(payroll.total_deductions || 0)}</div>
      </div>
      <div class="summary-box net">
        <div class="summary-label">Net Pay</div>
        <div class="summary-value">${formatCurrency(payroll.net_pay || 0)}</div>
      </div>
    </div>

    <div class="signature-line">
      <div class="signature-box">
        <div class="line"></div>
        <div class="label">Employee Signature</div>
      </div>
      <div class="signature-box">
        <div class="line"></div>
        <div class="label">HR Representative</div>
      </div>
    </div>

    <div class="footer">
      <div>Generated on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <div>This is a computer-generated document. No signature required.</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>
`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('[HRIS] Generate payslip error:', error);
    return NextResponse.json({ error: 'Failed to generate payslip' }, { status: 500 });
  }
}
