import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, EmployeeRepository, PayrollRepository } from '@/lib/db/models';
import { calculatePayroll } from '@/lib/payroll/calculator';

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();

    const { employee_id, period_start, period_end } = body;

    if (!employee_id || !period_start || !period_end) {
      return NextResponse.json(
        { error: 'employee_id, period_start, and period_end are required' },
        { status: 400 }
      );
    }

    const employee = EmployeeRepository.findById(employee_id);
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Calculate payroll
    const payrollData = calculatePayroll({
      employee,
      period_start,
      period_end,
    });

    const payroll = PayrollRepository.create({
      ...payrollData,
      status: 'Draft' as const,
      approved_by: null,
      approved_at: null,
      paid_at: null,
    });

    console.log(`[HRIS] Payroll calculated for employee ${employee_id}: ${payroll.id}`);

    return NextResponse.json({
      success: true,
      payroll,
    });
  } catch (error) {
    console.error('[HRIS] Payroll calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate payroll' },
      { status: 500 }
    );
  }
}
