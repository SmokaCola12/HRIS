import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canApproveRequest } from '@/lib/approvals/rules';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';
import {
  AttendanceLogRepository,
  AttendanceRepository,
  EmployeeRepository,
  IncentiveRequestRepository,
  LeaveRequestRepository,
  LoanExtensionRequestRepository,
  OTRequestRepository,
  PayrollRepository,
  SalaryAdvanceRepository,
  ensureInitialized,
} from '@/lib/db/models';

function dateKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: dateKey(start),
    end: dateKey(end),
  };
}

function activeRealEmployees() {
  return EmployeeRepository.findAll(true).filter((employee) =>
    employee.status === 'Active' && employee.employee_id !== 'FAILSAFE001'
  );
}

function timeFromTimestamp(timestamp?: string | null) {
  if (!timestamp) return null;
  const match = String(timestamp).match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
  return match?.[1] ?? null;
}

function todayStatus(employeeId: number, date: string, attendance: any) {
  const punchInLog = AttendanceLogRepository.findLatestByEmployeeStateOnDate(employeeId, 0, date);
  const punchOutLog = AttendanceLogRepository.findLatestByEmployeeStateOnDate(employeeId, 1, date);
  const checkIn = attendance?.check_in ?? attendance?.time_in ?? timeFromTimestamp(punchInLog?.timestamp);
  const checkOut = attendance?.check_out ?? attendance?.time_out ?? timeFromTimestamp(punchOutLog?.timestamp);

  if (checkOut) return `Punched out ${String(checkOut).slice(0, 5)}`;
  if (checkIn) return `Punched in ${String(checkIn).slice(0, 5)}`;
  return attendance?.status ?? null;
}

function visiblePendingCount(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const pending = [
    ...LeaveRequestRepository.findByStatus('Pending'),
    ...OTRequestRepository.findByStatus('Pending'),
    ...SalaryAdvanceRepository.findByStatus('Pending'),
    ...IncentiveRequestRepository.findByStatus('Pending'),
    ...LoanExtensionRequestRepository.findByStatus('Pending'),
  ];

  return pending.filter((request) => {
    const employee = EmployeeRepository.findById(request.employee_id);
    return employee ? canApproveRequest(user, employee) : false;
  }).length;
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = dateKey();
    const month = monthRange();
    const isManager = ['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role);
    const activeEmployees = activeRealEmployees();

    finalizeAttendanceForRange({
      startDate: month.start,
      endDate: today,
      employeeIds: isManager ? activeEmployees.map((employee) => employee.id) : [user.id],
    });

    const ownMonthRecords = AttendanceRepository.findByEmployeeAndDateRange(user.id, month.start, month.end);
    const ownToday = AttendanceRepository.findByEmployeeAndDate(user.id, today);
    const allTodayRecords = AttendanceRepository.findAll(today, today);
    const payroll = PayrollRepository.findAll();
    const latestPayroll = payroll[0];
    const recentAttendance = (isManager
      ? AttendanceRepository.findAll().filter((record) => record.employee_id !== user.id)
      : AttendanceRepository.findByEmployeeId(user.id)
    ).slice(0, 5);

    return NextResponse.json({
      success: true,
      initialized: activeEmployees.length > 0 || AttendanceLogRepository.findAll().length > 0,
      user: {
        todayStatus: todayStatus(user.id, today, ownToday),
        monthAttendanceRecords: ownMonthRecords.length,
        monthLateRecords: ownMonthRecords.filter((record) => record.status === 'Late').length,
        monthLateMinutes: ownMonthRecords.reduce((sum, record) => sum + Number(record.late_minutes || 0), 0),
      },
      manager: isManager ? {
        activeEmployees: activeEmployees.length,
        presentToday: allTodayRecords.filter((record) => record.status === 'Present' || record.status === 'Late').length,
        lateToday: allTodayRecords.filter((record) => record.status === 'Late').length,
        onLeaveToday: allTodayRecords.filter((record) => record.status === 'On Leave').length,
        pendingApprovals: visiblePendingCount(user),
        payrollStatus: latestPayroll?.status ?? null,
      } : null,
      recentAttendance,
    });
  } catch (error) {
    console.error('[HRIS] Dashboard fetch error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
