import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, verifyPassword } from '@/lib/auth';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';
import { canViewEmployee } from '@/lib/employees/access';
import { AccountRepository, AttendanceRepository, EmployeeRepository, ensureInitialized } from '@/lib/db/models';

function canCorrectAttendance(role: string) {
  return ['Manager', 'Admin', 'CEO', 'DEV'].includes(role);
}

function normalizeTime(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return /^\d{2}:\d{2}$/.test(text) ? text : undefined;
}

function displayValue(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '-';
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canCorrectAttendance(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const password = String(body.password || '').trim();
    const note = String(body.remarks || '').trim();
    if (!password) {
      return NextResponse.json({ error: 'Manager/Admin password is required' }, { status: 400 });
    }
    if (!note) {
      return NextResponse.json({ error: 'Correction remarks are required' }, { status: 400 });
    }

    const account = AccountRepository.findByEmployeeId(user.id);
    if (!account?.password_hash) {
      return NextResponse.json({ error: 'No login account found for password confirmation' }, { status: 403 });
    }
    const passwordOk = await verifyPassword(password, account.password_hash);
    if (!passwordOk) {
      return NextResponse.json({ error: 'Manager/Admin password is incorrect' }, { status: 401 });
    }

    const attendanceId = Number(body.id);
    if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
      return NextResponse.json({ error: 'Attendance record ID is required' }, { status: 400 });
    }

    const attendance = AttendanceRepository.findById(attendanceId);
    if (!attendance) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });

    const employee = EmployeeRepository.findById(Number(attendance.employee_id));
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (!canViewEmployee(user, employee)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const timeIn = normalizeTime(body.time_in ?? body.check_in);
    const timeOut = normalizeTime(body.time_out ?? body.check_out);
    if (timeIn === undefined || timeOut === undefined) {
      return NextResponse.json({ error: 'Times must use HH:mm format' }, { status: 400 });
    }

    AttendanceRepository.update(attendance.id, {
      time_in: timeIn,
      time_out: timeOut,
    });

    finalizeAttendanceForRange({
      startDate: attendance.date,
      endDate: attendance.date,
      employeeIds: [employee.id],
    });

    const finalizedAttendance = AttendanceRepository.findById(attendance.id);
    const changedDetails = [
      `Time In ${displayValue(attendance.time_in)} -> ${displayValue(timeIn)}`,
      `Time Out ${displayValue(attendance.time_out)} -> ${displayValue(timeOut)}`,
      `Status ${displayValue(attendance.status)} -> ${displayValue(finalizedAttendance?.status)}`,
    ].join('; ');

    const auditRemark = [
      `Manual correction by ${user.name} (${user.role}) on ${new Date().toISOString()}`,
      changedDetails,
      `Reason: ${note}`,
    ].join('. ');

    AttendanceRepository.update(attendance.id, { remarks: auditRemark });

    return NextResponse.json({
      success: true,
      attendance: AttendanceRepository.findById(attendance.id),
    });
  } catch (error) {
    console.error('[HRIS] Attendance correction error:', error);
    return NextResponse.json({ error: 'Failed to correct attendance' }, { status: 500 });
  }
}
