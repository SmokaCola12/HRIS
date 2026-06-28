import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';
import { canViewEmployee } from '@/lib/employees/access';
import {
  AttendanceRepository,
  AttendanceLogRepository,
  DepartmentRepository,
  EmployeeRepository,
  ensureInitialized,
  LeaveRequestRepository,
  OTRequestRepository,
  PayrollRepository,
  PositionRepository,
  SalaryAdvanceRepository,
  SalaryGradeRepository,
} from '@/lib/db/models';
import { isFlexibleEmploymentType, resolveWorkSchedule } from '@/lib/scheduling/resolve';

function sum(records: Array<Record<string, any>>, key: string) {
  return records.reduce((total, record) => total + Number(record[key] || 0), 0);
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function timeFromTimestamp(value?: string | null) {
  if (!value) return null;
  const time = value.includes('T')
    ? value.split('T')[1]
    : value.split(' ')[1];
  return time ? time.slice(0, 8) : null;
}

function addBreakLogs(attendance: Array<Record<string, any>>, employeeId: number) {
  if (!attendance.length) return attendance;
  const dates = attendance.map((record) => String(record.date)).filter(Boolean).sort();
  const logs = AttendanceLogRepository.findByEmployeeAndPeriod(employeeId, dates[0], dates[dates.length - 1]);
  const byDate = new Map<string, { breakOut: string[]; breakIn: string[] }>();

  for (const log of logs) {
    if (![2, 3].includes(Number(log.state))) continue;
    const date = String(log.timestamp).slice(0, 10);
    const bucket = byDate.get(date) ?? { breakOut: [], breakIn: [] };
    const time = timeFromTimestamp(log.timestamp);
    if (time && Number(log.state) === 2) bucket.breakOut.push(time);
    if (time && Number(log.state) === 3) bucket.breakIn.push(time);
    byDate.set(date, bucket);
  }

  return attendance.map((record) => {
    const bucket = byDate.get(String(record.date));
    return {
      ...record,
      break_out: bucket?.breakOut.join(', ') || null,
      break_in: bucket?.breakIn.join(', ') || null,
    };
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employeeId = Number((await params).id);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: 'Invalid employee ID' }, { status: 400 });
    }

    const employee = EmployeeRepository.findById(employeeId);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    if (!canViewEmployee(user, employee)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const department = employee.department_id ? DepartmentRepository.findById(employee.department_id) : null;
    const position = employee.position_id ? PositionRepository.findById(employee.position_id) : null;
    const salaryGrade = employee.salary_grade_id ? SalaryGradeRepository.findById(employee.salary_grade_id) : null;

    const today = dateKey();
    const resolvedSchedule = resolveWorkSchedule(employee, today);
    const startDate = employee.hire_date && employee.hire_date <= today
      ? employee.hire_date
      : `${today.slice(0, 7)}-01`;
    finalizeAttendanceForRange({ startDate, endDate: today, employeeIds: [employee.id] });

    const attendance = addBreakLogs(AttendanceRepository.findByEmployeeId(employee.id), employee.id);
    const leaves = LeaveRequestRepository.findAll()
      .filter((record) => record.employee_id === employee.id)
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    const overtime = OTRequestRepository.findAll()
      .filter((record) => record.employee_id === employee.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const salaryAdvances = SalaryAdvanceRepository.findAll()
      .filter((record) => record.employee_id === employee.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const payrolls = PayrollRepository.findByEmployee(employee.id)
      .sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)));

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        employee_id: employee.employee_id,
        name: employee.name,
        username: employee.username,
        email: employee.email,
        phone: employee.phone,
        picture: employee.picture,
        hire_date: employee.hire_date,
        status: employee.status,
        employment_type: employee.employment_type || 'Probationary',
        employment_type_effective_date: employee.employment_type_effective_date,
        role: employee.role,
        department: department?.name || employee.department_name || null,
        position: position?.name || employee.position_name || null,
        area: employee.area_name || null,
        salary_grade: salaryGrade ? {
          name: salaryGrade.grade_name,
          amount: Number(salaryGrade.amount || 0),
          frequency: salaryGrade.frequency,
        } : null,
        shift: resolvedSchedule ? {
          name: resolvedSchedule.shift_name || (resolvedSchedule.source === 'flexible' ? 'Flexible assignment' : 'Standing shift'),
          start_time: resolvedSchedule.start_time,
          end_time: resolvedSchedule.end_time,
        } : isFlexibleEmploymentType(employee.employment_type) ? {
          name: 'Flexible assignments',
          start_time: '',
          end_time: '',
        } : null,
      },
      summary: {
        attendance_records: attendance.length,
        present: attendance.filter((record) => record.status === 'Present').length,
        late: attendance.filter((record) => record.status === 'Late').length,
        absent: attendance.filter((record) => record.status === 'Absent').length,
        leave_days: sum(leaves.filter((record) => record.status === 'Approved'), 'days'),
        approved_overtime_hours: sum(overtime.filter((record) => record.status === 'Approved'), 'hours'),
        paid_payslips: payrolls.filter((record) => record.status === 'Paid').length,
        lifetime_net_pay: sum(payrolls.filter((record) => record.status === 'Paid'), 'net_pay'),
      },
      attendance,
      leaves,
      overtime,
      salary_advances: salaryAdvances,
      payrolls,
    });
  } catch (error) {
    console.error('[HRIS] Employee overview error:', error);
    return NextResponse.json({ error: 'Failed to fetch employee overview' }, { status: 500 });
  }
}
