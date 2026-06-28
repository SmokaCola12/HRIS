import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, PayrollRepository, EmployeeRepository, DepartmentRepository, PositionRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { buildDeductionAudit } from '@/lib/payroll/deduction-audit';
import { buildEarningsBreakdown } from '@/lib/payroll/payslip-values';

interface PayslipRequest {
  payroll_id: number;
  format?: 'json' | 'pdf';
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const { payroll_id, format = 'json' } = await request.json() as PayslipRequest;

    const payroll = PayrollRepository.findById(payroll_id);
    if (!payroll) {
      return NextResponse.json(
        { error: 'Payroll record not found' },
        { status: 404 }
      );
    }

    const employee = EmployeeRepository.findById(payroll.employee_id);
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    const deductionAudit = buildDeductionAudit(payroll);
    const earnings = buildEarningsBreakdown(payroll);

    // Generate payslip data structure
    const payslipData = {
      payroll_id: payroll.id,
      employee_id: employee.id,
      employee_name: employee.name,
      employee_idno: employee.employee_id,
      position: employee.position_id ? `Position ${employee.position_id}` : 'N/A',
      period: `${payroll.period_start} to ${payroll.period_end}`,
      generated_date: new Date().toISOString().split('T')[0],
      earnings: {
        basic_salary: earnings.basic_pay,
        overtime_pay: earnings.overtime_pay,
        holiday_pay: earnings.holiday_pay,
        allowances: earnings.allowances,
        gross_pay: earnings.gross_pay,
      },
      deductions: {
        ...deductionAudit,
        total: deductionAudit.recorded_total,
      },
      summary: {
        gross_pay: payroll.gross_pay,
        total_deductions: payroll.total_deductions,
        net_pay: payroll.net_pay,
      },
    };

    if (format === 'pdf') {
      // For PDF generation, return HTML that can be converted to PDF on client side
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .total { font-weight: bold; }
            .amount { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Payslip</h1>
            <p>Period: ${payslipData.period}</p>
          </div>
          
          <div class="section">
            <h3>Employee Information</h3>
            <p>Name: ${payslipData.employee_name}</p>
            <p>Employee ID: ${payslipData.employee_idno}</p>
            <p>Position: ${payslipData.position}</p>
          </div>

          <div class="section">
            <h3>Earnings</h3>
            <table>
              <tr><td>Basic Salary</td><td class="amount">₱${payslipData.earnings.basic_salary.toFixed(2)}</td></tr>
              <tr><td>Overtime Pay</td><td class="amount">₱${payslipData.earnings.overtime_pay.toFixed(2)}</td></tr>
              <tr><td>Holiday Pay</td><td class="amount">₱${payslipData.earnings.holiday_pay.toFixed(2)}</td></tr>
              <tr><td>Allowances</td><td class="amount">₱${payslipData.earnings.allowances.toFixed(2)}</td></tr>
              <tr class="total"><td>Gross Pay</td><td class="amount">₱${payslipData.earnings.gross_pay.toFixed(2)}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Deductions</h3>
            <table>
              <tr><td>SSS</td><td class="amount">₱${payslipData.deductions.sss.toFixed(2)}</td></tr>
              <tr><td>PhilHealth</td><td class="amount">₱${payslipData.deductions.philhealth.toFixed(2)}</td></tr>
              <tr><td>Pag-IBIG</td><td class="amount">₱${payslipData.deductions.pagibig.toFixed(2)}</td></tr>
              <tr><td>Tax</td><td class="amount">₱${payslipData.deductions.tax.toFixed(2)}</td></tr>
              <tr><td>Salary Advance</td><td class="amount">₱${payslipData.deductions.salary_advance.toFixed(2)}</td></tr>
              <tr><td>Other</td><td class="amount">₱${payslipData.deductions.other.toFixed(2)}</td></tr>
              <tr class="total"><td>Total Deductions</td><td class="amount">₱${payslipData.deductions.total.toFixed(2)}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Summary</h3>
            <table>
              <tr><td>Gross Pay</td><td class="amount">₱${payslipData.summary.gross_pay.toFixed(2)}</td></tr>
              <tr><td>Total Deductions</td><td class="amount">₱${payslipData.summary.total_deductions.toFixed(2)}</td></tr>
              <tr class="total"><td>Net Pay</td><td class="amount">₱${payslipData.summary.net_pay.toFixed(2)}</td></tr>
            </table>
          </div>

          <p style="text-align: center; margin-top: 40px; font-size: 12px; color: #666;">
            Generated on: ${payslipData.generated_date}
          </p>
        </body>
        </html>
      `;

      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="payslip-${employee.employee_id}-${payroll.period_start}.html"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      payslip: payslipData,
    });
  } catch (error) {
    console.error('[HRIS] Payslip generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate payslip' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const payrollId = searchParams.get('payroll_id');
    const year = searchParams.get('year');

    if (!payrollId) {
      const payrolls = PayrollRepository.findAll()
        .filter((payroll) => payroll.employee_id === user.id)
        .filter((payroll) => payroll.status === 'Paid')
        .filter((payroll) => !year || payroll.period_start.startsWith(year) || payroll.period_end.startsWith(year))
        .sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)));

      return NextResponse.json({
        success: true,
        payslips: payrolls.map((payroll) => {
          const earnings = buildEarningsBreakdown(payroll);
          return {
            id: payroll.id,
            payroll_id: payroll.id,
            period_start: payroll.period_start,
            period_end: payroll.period_end,
            period: `${payroll.period_start} to ${payroll.period_end}`,
            gross_pay: earnings.gross_pay,
            total_deductions: payroll.total_deductions || 0,
            net_pay: payroll.net_pay || 0,
            status: payroll.status,
            claimed_at: payroll.claimed_at || null,
            days_worked: payroll.days_worked || 0,
            earnings,
            deductions: buildDeductionAudit(payroll),
          };
        }),
      });
    }

    const payroll = PayrollRepository.findById(parseInt(payrollId));
    if (!payroll) {
      return NextResponse.json(
        { error: 'Payroll record not found' },
        { status: 404 }
      );
    }

    if (user.role === 'Employee' && (payroll.employee_id !== user.id || payroll.status !== 'Paid')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const employee = EmployeeRepository.findById(payroll.employee_id);
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    if (user.role === 'Manager' && employee.id !== user.id && employee.department_id !== user.departmentId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (!['Employee', 'Manager', 'Admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const department = employee.department_id ? DepartmentRepository.findById(employee.department_id) : null;
    const position = employee.position_id ? PositionRepository.findById(employee.position_id) : null;

    const payslipData = {
      payroll_id: payroll.id,
      employee_name: employee.name,
      employee_idno: employee.employee_id,
      department: department?.name || 'N/A',
      position: position?.name || 'N/A',
      period: `${payroll.period_start} to ${payroll.period_end}`,
      gross_pay: payroll.gross_pay,
      total_deductions: payroll.total_deductions,
      net_pay: payroll.net_pay,
      deductions: buildDeductionAudit(payroll),
    };

    return NextResponse.json({
      payslip: payslipData,
    });
  } catch (error) {
    console.error('[HRIS] Get payslip error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payslip' },
      { status: 500 }
    );
  }
}
