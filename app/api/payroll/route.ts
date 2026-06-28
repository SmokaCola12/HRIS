import { NextRequest, NextResponse } from 'next/server';
import {
  ensureInitialized,
  PayrollRepository,
  EmployeeRepository,
  DepartmentRepository,
  PayrollDeletionLogRepository,
  AttendanceRepository,
  PayrollOtCarryoverRepository,
} from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { calculateStatutoryPayroll, calculateThirteenthMonthPay } from '@/lib/payroll/statutory';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';

function canManagePayroll(role: string) {
  return ['Admin', 'Manager', 'CEO', 'DEV'].includes(role);
}

function getPayrollEmployeeScope(user: { id: number; role: string; departmentId: number | null }) {
  const employees = EmployeeRepository.findAll(true).filter(e =>
    e.status === 'Active' && e.employee_id !== 'FAILSAFE001'
  );

  if (user.role === 'Manager') {
    return employees.filter(e => e.id === user.id || e.department_id === user.departmentId);
  }

  return employees;
}

function hasPayableAttendance(employeeId: number, periodStart: string, periodEnd: string) {
  return AttendanceRepository.findByEmployeeAndDateRange(employeeId, periodStart, periodEnd)
    .some((record) => ['Present', 'Late'].includes(String(record.status)));
}

function shouldGenerateRegularPayroll(employee: Record<string, any>, periodStart: string, periodEnd: string) {
  if (['Casual', 'Casual On-Call'].includes(String(employee.employment_type || 'Probationary'))) {
    return hasPayableAttendance(employee.id, periodStart, periodEnd);
  }
  return true;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return dateOnly(next);
}

function minuteOfDay(time?: string | null) {
  if (!time) return null;
  const [hours, minutes] = String(time).slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const bounded = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(bounded / 60);
  const mins = bounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function ensureSundayCutoffCarryover(employeeId: number, periodEnd: string) {
  const attendance = AttendanceRepository.findByEmployeeAndDate(employeeId, periodEnd);
  const cutoffMinutes = 15 * 60;
  const cutoffAt = `${periodEnd}T15:00:00`;

  if (!attendance || !['Present', 'Late'].includes(String(attendance.status))) {
    PayrollOtCarryoverRepository.deleteBySource(employeeId, periodEnd, cutoffAt);
    return null;
  }

  const start = minuteOfDay(attendance.time_in ?? attendance.check_in);
  const rawEnd = minuteOfDay(attendance.time_out ?? attendance.check_out);
  if (start === null || rawEnd === null) {
    PayrollOtCarryoverRepository.deleteBySource(employeeId, periodEnd, cutoffAt);
    return null;
  }

  let end = rawEnd;
  if (end <= start) end += 1440;
  if (end <= cutoffMinutes) {
    PayrollOtCarryoverRepository.deleteBySource(employeeId, periodEnd, cutoffAt);
    return null;
  }

  const carryoverStart = Math.max(start, cutoffMinutes);
  const hours = Math.round(((end - carryoverStart) / 60) * 100) / 100;
  if (hours <= 0) {
    PayrollOtCarryoverRepository.deleteBySource(employeeId, periodEnd, cutoffAt);
    return null;
  }

  return PayrollOtCarryoverRepository.upsert({
    employee_id: employeeId,
    source_attendance_id: attendance.id,
    source_date: periodEnd,
    cutoff_at: cutoffAt,
    start_time: minutesToTime(carryoverStart),
    end_time: minutesToTime(end),
    hours,
    payable_period_start: periodEnd,
    payable_period_end: addDays(periodEnd, 7),
    status: 'Pending',
  });
}

function normalizePeriodMode(value: unknown) {
  return value === 'sunday-cutoff-weekly' ? 'sunday-cutoff-weekly' : 'standard';
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get('period_start');
    const periodEnd = searchParams.get('period_end');
    const status = searchParams.get('status');
    const payrollType = searchParams.get('payroll_type');
    const report = searchParams.get('report');

    if (report === 'deletion-logs') {
      if (!canManagePayroll(user.role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
      return NextResponse.json({
        success: true,
        logs: PayrollDeletionLogRepository.findAll(),
      });
    }

    let payrolls = PayrollRepository.findAll();

    // Filter by period if provided
    if (periodStart && periodEnd) {
      payrolls = payrolls.filter(p => p.period_start === periodStart && p.period_end === periodEnd);
    }
    if (status) {
      const statuses = status.split(',').map((item) => item.trim());
      payrolls = payrolls.filter(p => statuses.includes(String(p.status)));
    }
    if (payrollType) {
      payrolls = payrolls.filter(p => String(p.payroll_type ?? 'Regular') === payrollType);
    }

    // Filter based on role
    if (user.role === 'Employee') {
      payrolls = payrolls.filter(p => p.employee_id === user.id);
    } else if (user.role === 'Manager') {
      const employees = EmployeeRepository.findAll(true);
      const teamIds = employees
        .filter(e => e.department_id === user.departmentId || e.id === user.id)
        .map(e => e.id);
      payrolls = payrolls.filter(p => teamIds.includes(p.employee_id));
    }

    // Enrich with employee info
    const enrichedPayrolls = payrolls.map(p => {
      const employee = EmployeeRepository.findById(p.employee_id);
      const department = employee?.department_id ? DepartmentRepository.findById(employee.department_id) : null;
      return {
        ...p,
        employeeName: employee?.name || 'Unknown',
        employeeIdStr: employee?.employee_id || 'N/A',
        departmentName: department?.name || 'N/A',
      };
    });

    return NextResponse.json({
      success: true,
      payrolls: enrichedPayrolls,
    });
  } catch (error) {
    console.error('[HRIS] Get payroll error:', error);
    return NextResponse.json({ error: 'Failed to retrieve payroll' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Admin and Manager can generate payroll
    if (!canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { period_start, period_end, action, year } = body;
    const periodMode = normalizePeriodMode(body.period_mode);

    if (action === '13th-month') {
      const targetYear = Number(year || new Date().getFullYear());
      if (!Number.isInteger(targetYear) || targetYear < 1975) {
        return NextResponse.json({ error: 'Valid payroll year is required' }, { status: 400 });
      }

      const employees = getPayrollEmployeeScope(user);
      const generatedPayrolls = [];
      const periodStart = `${targetYear}-01-01`;
      const periodEnd = `${targetYear}-12-31`;

      for (const employee of employees) {
        const amount = calculateThirteenthMonthPay(employee.id, targetYear);
        const payload = {
          employee_id: employee.id,
          payroll_type: '13th Month',
          period_start: periodStart,
          period_end: periodEnd,
          basic_pay: 0,
          days_worked: 0,
          regular_hours: 0,
          overtime_hours: 0,
          overtime_pay: 0,
          holiday_pay: 0,
          allowances: amount,
          gross_pay: amount,
          sss_deduction: 0,
          philhealth_deduction: 0,
          pagibig_deduction: 0,
          tax_deduction: 0,
          salary_advance_deduction: 0,
          late_deduction_minutes: 0,
          other_deductions: 0,
          total_deductions: 0,
          net_pay: amount,
          status: 'Draft',
        };
        const existing = PayrollRepository.findByPeriod(periodStart, periodEnd)
          .find(p => p.employee_id === employee.id && (p.payroll_type ?? 'Regular') === '13th Month');
        const payroll = existing
          ? PayrollRepository.update(existing.id, payload)
          : PayrollRepository.create(payload);
        if (payroll) generatedPayrolls.push(payroll);
      }

      return NextResponse.json({
        success: true,
        message: `Generated 13th-month payroll for ${generatedPayrolls.length} employees`,
        count: generatedPayrolls.length,
      });
    }

    if (!period_start || !period_end) {
      return NextResponse.json({ error: 'Period start and end are required' }, { status: 400 });
    }
    if (new Date(period_start) > new Date(period_end)) {
      return NextResponse.json({ error: 'Period start must be before or equal to period end' }, { status: 400 });
    }

    const employees = getPayrollEmployeeScope(user);
    finalizeAttendanceForRange({
      startDate: period_start,
      endDate: period_end,
      employeeIds: employees.map((employee) => employee.id),
    });
    if (periodMode === 'sunday-cutoff-weekly') {
      for (const employee of employees) {
        ensureSundayCutoffCarryover(employee.id, period_end);
      }
    }

    // Generate payroll for each employee. Released payroll is historical/audit data,
    // so generation only creates or refreshes unreleased regular payroll records.
    const generatedPayrolls = [];
    let skippedReleased = 0;
    let skippedNoWork = 0;
    for (const employee of employees) {
      if (!shouldGenerateRegularPayroll(employee, period_start, period_end)) {
        skippedNoWork++;
        continue;
      }

      const existingRegularPayrolls = PayrollRepository.findByPeriod(period_start, period_end)
        .filter(p => p.employee_id === employee.id && (p.payroll_type ?? 'Regular') === 'Regular');
      const editablePayroll = existingRegularPayrolls.find(p => p.status !== 'Paid');
      const releasedPayroll = existingRegularPayrolls.find(p => p.status === 'Paid');

      if (!editablePayroll && releasedPayroll) {
        skippedReleased++;
        continue;
      }

      const payrollData = calculateStatutoryPayroll(employee.id, period_start, period_end, { periodMode });
      if (!payrollData) continue;

      if (editablePayroll) {
        const updated = PayrollRepository.update(editablePayroll.id, { ...payrollData, payroll_type: 'Regular', period_mode: periodMode });
        if (updated) {
          PayrollOtCarryoverRepository.markApplied(employee.id, period_start, period_end, updated.id);
          generatedPayrolls.push(updated);
        }
      } else {
        const created = PayrollRepository.create({ ...payrollData, payroll_type: 'Regular', period_mode: periodMode });
        PayrollOtCarryoverRepository.markApplied(employee.id, period_start, period_end, created.id);
        generatedPayrolls.push(created);
      }
    }

    console.log('[HRIS] Generated payroll for', generatedPayrolls.length, 'employees');

    return NextResponse.json({
      success: true,
      message: `Generated payroll for ${generatedPayrolls.length} employees${skippedReleased ? `; skipped ${skippedReleased} released record(s)` : ''}${skippedNoWork ? `; skipped ${skippedNoWork} casual/on-call employee(s) with no payable attendance` : ''}`,
      count: generatedPayrolls.length,
      skippedReleased,
      skippedNoWork,
    });
  } catch (error) {
    console.error('[HRIS] Generate payroll error:', error);
    return NextResponse.json({ error: 'Failed to generate payroll' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { id, reason } = body;

    if (!id || !reason || String(reason).trim().length < 5) {
      return NextResponse.json({ error: 'Payroll ID and a deletion reason are required' }, { status: 400 });
    }

    const payroll = PayrollRepository.findById(Number(id));
    if (!payroll) return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    if (payroll.status === 'Paid') {
      return NextResponse.json({ error: 'Released payroll cannot be removed' }, { status: 400 });
    }

    const allowedEmployeeIds = new Set(getPayrollEmployeeScope(user).map(e => e.id));
    if (!allowedEmployeeIds.has(payroll.employee_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const result = PayrollRepository.deleteGenerated(Number(id), String(reason).trim(), user.id);
    return NextResponse.json({
      success: result.changes > 0,
      message: result.changes > 0 ? 'Generated payroll removed and logged' : 'Payroll was not removed',
    });
  } catch (error) {
    console.error('[HRIS] Delete payroll error:', error);
    return NextResponse.json({ error: 'Failed to delete payroll' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Admin and Manager can release payroll
    if (!canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, id, ids, status } = body;

    if (action === 'toggle-claimed') {
      if (!id) {
        return NextResponse.json({ error: 'Payroll ID is required' }, { status: 400 });
      }

      const payroll = PayrollRepository.findById(Number(id));
      if (!payroll) return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
      if (payroll.status !== 'Paid') {
        return NextResponse.json({ error: 'Only released payroll can be marked claimed' }, { status: 400 });
      }

      const allowedEmployeeIds = new Set(getPayrollEmployeeScope(user).map(e => e.id));
      if (!allowedEmployeeIds.has(payroll.employee_id)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const updated = PayrollRepository.update(Number(id), {
        claimed_at: payroll.claimed_at ? null : new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        payroll: updated,
      });
    }

    if (!ids || !Array.isArray(ids) || !status) {
      return NextResponse.json({ error: 'IDs array and status are required' }, { status: 400 });
    }

    const allowedStatuses = ['Draft', 'Pending', 'Approved', 'Paid'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid payroll status' }, { status: 400 });
    }

    let updatedCount = 0;
    const allowedEmployeeIds = new Set(getPayrollEmployeeScope(user).map(e => e.id));
    for (const id of ids) {
      const payroll = PayrollRepository.findById(Number(id));
      if (!payroll || !allowedEmployeeIds.has(payroll.employee_id)) continue;

      const updateData: Record<string, unknown> = { status };
      if (status === 'Approved') {
        updateData.approved_by = user.id;
        updateData.approved_at = new Date().toISOString();
      }
      if (status === 'Paid') {
        updateData.paid_at = new Date().toISOString();
      }
      const updated = PayrollRepository.update(Number(id), updateData);
      if (updated) updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} payroll records`,
      count: updatedCount,
    });
  } catch (error) {
    console.error('[HRIS] Update payroll error:', error);
    return NextResponse.json({ error: 'Failed to update payroll' }, { status: 500 });
  }
}
