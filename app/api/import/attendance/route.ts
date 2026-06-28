import { NextRequest, NextResponse } from 'next/server';
import {
  ensureInitialized,
  AttendanceRepository,
  AttendanceLogRepository,
  EmployeeRepository,
  NotificationRepository,
  OTRequestRepository,
  TardinessPointRepository,
} from '@/lib/db/models';
import { calculateTardinessPoints } from '@/lib/attendance/tardiness';
import { AttendanceLogSchema, validateWithErrors } from '@/lib/validation/schemas';
import { resolveWorkSchedule } from '@/lib/scheduling/resolve';

interface AttendanceRecord {
  employeeId: string;
  timestamp: string;
  state: number;
}

interface UnmappedPunch {
  employeeId: string;
  timestamp: string;
  state: number;
  reason: string;
  lineNumber: number;
}

const LATE_GRACE_MINUTES = 5;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function applyPunchToDailyAttendance(employeeId: number, date: string, time: string) {
  const existingAttendance = AttendanceRepository.findByEmployeeAndDate(employeeId, date);

  if (!existingAttendance) {
    AttendanceRepository.create({
      employee_id: employeeId,
      date,
      check_in: time,
      check_out: null,
      status: 'Present',
    });
    return 'imported';
  }

  const punches = [existingAttendance.check_in, existingAttendance.check_out, time]
    .filter(Boolean)
    .sort();
  const checkIn = punches[0] ?? null;
  const checkOut = punches.length > 1 ? punches[punches.length - 1] : null;

  AttendanceRepository.update(existingAttendance.id, {
    check_in: checkIn,
    check_out: checkOut,
  });
  return 'updated';
}

function detectAndCreateOT(employeeId: number, date: string) {
  const attendance = AttendanceRepository.findByEmployeeAndDate(employeeId, date);
  if (!attendance?.check_in) {
    return false;
  }

  const shift = resolveWorkSchedule(employeeId, date);
  if (!shift?.start_time || !shift?.end_time) {
    return false;
  }

  const employee = EmployeeRepository.findById(employeeId);
  const inMinutes = timeToMinutes(attendance.check_in);
  const shiftStartMinutes = timeToMinutes(shift.start_time);
  let shiftEndMinutes = timeToMinutes(shift.end_time);
  if (shiftEndMinutes <= shiftStartMinutes) shiftEndMinutes += 1440;
  const rawLateMinutes = Math.max(0, inMinutes - shiftStartMinutes);
  const lateMinutes = Math.max(0, rawLateMinutes - LATE_GRACE_MINUTES);
  const tardinessPoints = calculateTardinessPoints(lateMinutes);
  const scheduledMinutes = Math.max(0, shiftEndMinutes - shiftStartMinutes - Number(shift.break_minutes || 0));
  const existingStatus = String(attendance.status || 'Present');
  const status = ['Present', 'Late'].includes(existingStatus)
    ? (lateMinutes > 0 ? 'Late' : 'Present')
    : existingStatus;

  let overtimeMinutes = 0;
  let earlyOutMinutes = 0;
  let undertimeMinutes = 0;
  let outMinutes: number | null = null;

  if (attendance.check_out) {
    outMinutes = timeToMinutes(attendance.check_out);
    if (outMinutes < inMinutes) outMinutes += 1440;

    const workedMinutes = Math.max(0, outMinutes - inMinutes - Number(shift.break_minutes || 0));
    overtimeMinutes = Math.max(0, outMinutes - shiftEndMinutes);
    earlyOutMinutes = Math.max(0, shiftEndMinutes - outMinutes);
    // Undertime is total scheduled paid time not worked; it is stored separately
    // from approved overtime and is never netted against overtime pay.
    undertimeMinutes = Math.max(0, scheduledMinutes - workedMinutes);
  }

  AttendanceRepository.update(attendance.id, {
    shift_id: shift.shift_id,
    scheduled_in: shift.start_time,
    scheduled_out: shift.end_time,
    late_minutes: lateMinutes,
    early_out_minutes: earlyOutMinutes,
    overtime_minutes: overtimeMinutes,
    undertime_minutes: undertimeMinutes,
    status,
  });

  if (lateMinutes > 0) {
    TardinessPointRepository.upsert({
      employee_id: employeeId,
      date,
      late_minutes: lateMinutes,
      points: tardinessPoints,
      year: Number(date.slice(0, 4)),
    });
  } else {
    TardinessPointRepository.deleteByEmployeeAndDate(employeeId, date);
  }

  if (tardinessPoints >= 0.4) {
    NotificationRepository.createOnce({
      employee_id: employeeId,
      type: 'tardiness_warning',
      message: `${employee?.name || 'Employee'} recorded ${lateMinutes} minutes late on ${date} (${tardinessPoints} tardiness points).`,
    });
    NotificationRepository.createOnce({
      employee_id: employeeId,
      type: 'employee_tardiness_ack',
      message: `You recorded ${lateMinutes} minutes late on ${date} (${tardinessPoints} tardiness points). Please confirm that you have been informed.`,
    });
  }

  if (overtimeMinutes < 240 || outMinutes === null) {
    // Attendance keeps the raw overtime minutes for audit visibility; an
    // approvable OT request is generated only after a complete 4-hour block.
    return false;
  }

  const existing = OTRequestRepository.findAll().find((request) =>
    request.employee_id === employeeId &&
    request.ot_date === date &&
    request.status === 'Pending'
  );

  const payload = {
    employee_id: employeeId,
    ot_date: date,
    start_time: minutesToTime(shiftEndMinutes),
    end_time: minutesToTime(shiftEndMinutes + Math.floor(overtimeMinutes / 240) * 240),
    hours: Math.floor(overtimeMinutes / 240) * 4,
    reason: 'Auto-detected from attendance import',
    status: 'Pending',
  };

  if (existing) {
    OTRequestRepository.update(existing.id, payload);
    return false;
  }

  OTRequestRepository.create(payload);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const { records } = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'No records provided' },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let otRequestsCreated = 0;
    let errors = 0;
    const unmappedPunches: UnmappedPunch[] = [];
    const validationErrors: string[] = [];

    console.log(`[HRIS-IMPORT] Starting attendance import: ${records.length} records`);

    for (let i = 0; i < records.length; i++) {
      const record = records[i] as AttendanceRecord;
      const lineNumber = i + 1;

      try {
        // Validate record format
        const validation = validateWithErrors(AttendanceLogSchema, {
          employee_idno: record.employeeId,
          timestamp: record.timestamp,
          state: record.state,
        });

        if (!validation.success) {
          console.warn(`[HRIS-IMPORT] Line ${lineNumber}: Validation failed - ${validation.errors.join(', ')}`);
          validationErrors.push(`Line ${lineNumber}: ${validation.errors.join(', ')}`);
          errors++;
          continue;
        }

        // Find employee by employee_id
        const employee = EmployeeRepository.findByEmployeeId(record.employeeId);
        
        if (!employee) {
          // Orphan log - employee doesn't exist
          console.warn(`[HRIS-IMPORT] Line ${lineNumber}: Unmapped punch - Employee ID ${record.employeeId} not found`);
          unmappedPunches.push({
            employeeId: record.employeeId,
            timestamp: record.timestamp,
            state: record.state,
            reason: `Employee ID ${record.employeeId} not found in system`,
            lineNumber,
          });
          errors++;
          continue;
        }

        // Parse the timestamp
        const [date, time] = record.timestamp.split(' ');
        
        if (!date || !time) {
          console.warn(`[HRIS-IMPORT] Line ${lineNumber}: Invalid timestamp format - ${record.timestamp}`);
          validationErrors.push(`Line ${lineNumber}: Invalid timestamp format`);
          errors++;
          continue;
        }

        console.log(`[HRIS-IMPORT] Line ${lineNumber}: Processing ${employee.name} (${record.employeeId}) - ${date} ${time} - State: ${record.state}`);

        AttendanceLogRepository.create({
          employee_id: employee.id,
          employee_idno: record.employeeId,
          timestamp: record.timestamp,
          state: record.state,
          device_id: null,
        });

        const result = applyPunchToDailyAttendance(employee.id, date, time);
        if (result === 'updated') {
          console.log(`[HRIS-IMPORT] Line ${lineNumber}: Updated attendance for ${employee.name}`);
          updated++;
        } else {
          console.log(`[HRIS-IMPORT] Line ${lineNumber}: Created new attendance record for ${employee.name}`);
          imported++;
        }

        if (detectAndCreateOT(employee.id, date)) {
          otRequestsCreated++;
        }
      } catch (err) {
        console.error(`[HRIS-IMPORT] Line ${lineNumber}: Error -`, err);
        validationErrors.push(`Line ${lineNumber}: Processing error - ${err instanceof Error ? err.message : 'Unknown error'}`);
        errors++;
      }
    }

    console.log(`[HRIS-IMPORT] Attendance import complete: ${imported} new, ${updated} updated, ${errors} errors, ${unmappedPunches.length} unmapped`);

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors,
      total: records.length,
      unmappedPunches,
      otRequestsCreated,
      validationErrors: validationErrors.slice(0, 50), // Limit to first 50 errors
    });
  } catch (error) {
    console.error('[HRIS-IMPORT] Attendance import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import attendance data' },
      { status: 500 }
    );
  }
}
