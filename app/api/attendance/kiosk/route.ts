import { NextRequest, NextResponse } from 'next/server';
import {
  AttendanceLogRepository,
  AttendanceRepository,
  EmployeeRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';
import { resolveWorkSchedule, validateScheduleForDate } from '@/lib/scheduling/resolve';

const ACTIONS = ['punch_in', 'punch_out', 'break_out', 'break_in'] as const;
type KioskAction = typeof ACTIONS[number];

const ACTION_STATE: Record<KioskAction, number> = {
  punch_in: 0,
  punch_out: 1,
  break_out: 2,
  break_in: 3,
};

const ACTION_PIN: Record<KioskAction, string> = {
  punch_in: 'PIN',
  punch_out: 'POUT',
  break_in: 'BIN',
  break_out: 'BOUT',
};

const MAX_PHOTO_LENGTH = 2_500_000;
const BREAK_DUPLICATE_WINDOW_SECONDS = 120;

function isKioskAction(value: unknown): value is KioskAction {
  return ACTIONS.includes(value as KioskAction);
}

function isValidPhoto(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const photo = value.trim();
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photo) && photo.length <= MAX_PHOTO_LENGTH;
}

function localParts(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

function parseEmployeeCode(input: unknown): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    const value = parsed.employee_id ?? parsed.employeeId ?? parsed.employee_code ?? parsed.id ?? parsed.code;
    if (value) return String(value).trim();
  } catch {
    // Plain QR values are expected, so invalid JSON is fine.
  }

  try {
    const url = new URL(raw);
    const value = url.searchParams.get('employee_id') ||
      url.searchParams.get('employeeId') ||
      url.searchParams.get('id') ||
      url.searchParams.get('code');
    if (value) return value.trim();
  } catch {
    // Not a URL.
  }

  const queryMatch = raw.match(/(?:employee_id|employeeId|employee_code|id|code)=([^&\s]+)/i);
  if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]).trim();

  return raw;
}

function firstTime(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort()[0] ?? null;
}

function secondsBetween(a: string, b: string) {
  const left = new Date(a.replace(' ', 'T')).getTime();
  const right = new Date(b.replace(' ', 'T')).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 1000;
}

function kioskPhotoName(employeeId: string, date: string, action: KioskAction) {
  return `${employeeId}_${date}_${ACTION_PIN[action]}`;
}

function duplicatePunchError(action: KioskAction, latestLog: any, attendance: any, timestamp: string) {
  if (action === 'punch_in' && (attendance?.check_in || latestLog)) {
    return {
      error: 'Employee already punched in today',
      duplicate: true,
      timestamp: attendance?.check_in ?? latestLog?.timestamp ?? timestamp,
    };
  }

  if (action === 'punch_out' && (attendance?.check_out || latestLog)) {
    return {
      error: 'Employee already punched out today',
      duplicate: true,
      timestamp: attendance?.check_out ?? latestLog?.timestamp ?? timestamp,
    };
  }

  if ((action === 'break_out' || action === 'break_in') && latestLog) {
    const isRapidDuplicate = secondsBetween(latestLog.timestamp, timestamp) <= BREAK_DUPLICATE_WINDOW_SECONDS;
    if (isRapidDuplicate) {
      return {
        error: `Duplicate ${action === 'break_out' ? 'break out' : 'break in'} ignored`,
        duplicate: true,
        timestamp: latestLog.timestamp,
      };
    }
  }

  return null;
}

function applyDailyAttendance(employeeId: number, action: KioskAction, date: string, time: string) {
  if (!['punch_in', 'punch_out'].includes(action)) return null;

  const existing = AttendanceRepository.findByEmployeeAndDate(employeeId, date);
  const schedule = resolveWorkSchedule(employeeId, date);

  // TODO: Late, undertime, and break-aware daily rollups need a separate migration/computation pass.
  if (action === 'punch_in' && !existing) {
    return AttendanceRepository.create({
      employee_id: employeeId,
      date,
      check_in: time,
      check_out: null,
      shift_id: schedule?.shift_id ?? null,
      scheduled_in: schedule?.start_time ?? null,
      scheduled_out: schedule?.end_time ?? null,
      status: 'Present',
    });
  }

  if (action === 'punch_in' && existing) {
    return AttendanceRepository.update(existing.id, {
      check_in: firstTime(existing.check_in, time),
      shift_id: existing.shift_id ?? schedule?.shift_id ?? null,
      scheduled_in: existing.scheduled_in ?? schedule?.start_time ?? null,
      scheduled_out: existing.scheduled_out ?? schedule?.end_time ?? null,
    });
  }

  if (action === 'punch_out' && existing && !existing.check_out) {
    return AttendanceRepository.update(existing.id, {
      check_out: time,
      shift_id: existing.shift_id ?? schedule?.shift_id ?? null,
      scheduled_in: existing.scheduled_in ?? schedule?.start_time ?? null,
      scheduled_out: existing.scheduled_out ?? schedule?.end_time ?? null,
    });
  }

  // TODO: break_out/break_in remain raw attendance_logs until daily_attendance has break columns.
  return existing ?? null;
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const action = body.action;

    if (!isKioskAction(action)) {
      return NextResponse.json({ error: 'Invalid kiosk action' }, { status: 400 });
    }

    const photo = typeof body.photo === 'string' ? body.photo.trim() : '';
    if (!isValidPhoto(photo)) {
      return NextResponse.json({ error: 'A verification photo is required' }, { status: 400 });
    }

    const employeeCode = parseEmployeeCode(body.employee_id ?? body.employeeId ?? body.employee_code ?? body.qrPayload ?? body.qr_payload);
    if (!employeeCode) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const employee = EmployeeRepository.findByEmployeeId(employeeCode);
    if (!employee || employee.status !== 'Active') {
      return NextResponse.json({ error: 'Active employee not found' }, { status: 404 });
    }

    const { date, time } = localParts();
    const timestamp = `${date} ${time}`;
    const state = ACTION_STATE[action];
    const existingAttendance = AttendanceRepository.findByEmployeeAndDate(employee.id, date);
    const latestSameState = AttendanceLogRepository.findLatestByEmployeeStateOnDate(employee.id, state, date);
    const duplicate = duplicatePunchError(action, latestSameState, existingAttendance, timestamp);
    if (duplicate) {
      return NextResponse.json(duplicate, { status: 409 });
    }

    AttendanceLogRepository.create({
      employee_id: employee.id,
      employee_idno: employee.employee_id,
      timestamp,
      state,
      device_id: 'attendance-kiosk',
      photo: JSON.stringify({
        name: kioskPhotoName(employee.employee_id, date, action),
        src: photo,
      }),
    });

    const attendance = applyDailyAttendance(employee.id, action, date, time);
    finalizeAttendanceForRange({ startDate: date, endDate: date, employeeIds: [employee.id] });
    const finalizedAttendance = AttendanceRepository.findByEmployeeAndDate(employee.id, date) ?? attendance;
    const shiftValidation = validateScheduleForDate(employee.id, date);

    return NextResponse.json({
      success: true,
      action,
      timestamp,
      employee: {
        id: employee.id,
        employee_id: employee.employee_id,
        name: employee.name,
        department: employee.department_name ?? null,
        position: employee.position_name ?? null,
        employment_type: employee.employment_type,
        picture: employee.picture ?? null,
      },
      photo,
      photo_name: kioskPhotoName(employee.employee_id, date, action),
      attendance: finalizedAttendance,
      warning: shiftValidation.valid ? null : shiftValidation.reason,
    });
  } catch (error) {
    console.error('[HRIS] Attendance kiosk punch error:', error);
    return NextResponse.json({ error: 'Failed to record kiosk attendance' }, { status: 500 });
  }
}
