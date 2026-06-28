import {
  AttendanceRepository,
  EmployeeRepository,
  HolidayRepository,
  LeaveRequestRepository,
  NotificationRepository,
  TardinessPointRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { calculateTardinessPoints } from '@/lib/attendance/tardiness';
import { resolveWorkSchedule } from '@/lib/scheduling/resolve';

type FinalizeOptions = {
  startDate: string;
  endDate: string;
  employeeIds?: number[];
};

type WorkSchedule = {
  shift_id: number | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
};

const LATE_GRACE_MINUTES = 5;
const MISSING_OUT_COMPENSATION_REMARK = 'Auto-compensated missing punch out using scheduled end';

function dateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    dates.push(dateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function timeToMinutes(time?: string | null) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function scheduledEndDateTime(date: string, schedule: WorkSchedule) {
  const startMinutes = timeToMinutes(schedule.start_time);
  const endMinutes = timeToMinutes(schedule.end_time);
  if (startMinutes === null || endMinutes === null) return null;

  const end = new Date(`${date}T00:00:00`);
  end.setMinutes(endMinutes);
  if (endMinutes <= startMinutes) end.setDate(end.getDate() + 1);
  return end;
}

function isApprovedLeave(employeeId: number, date: string) {
  return LeaveRequestRepository.findAll().some((request) =>
    request.employee_id === employeeId &&
    request.status === 'Approved' &&
    String(request.start_date) <= date &&
    String(request.end_date) >= date
  );
}

function getExpectedSchedule(employee: Record<string, any>, date: string): WorkSchedule | null {
  return resolveWorkSchedule(employee, date);
}

function attendanceMetrics(attendance: Record<string, any>, schedule: WorkSchedule, date: string, today: string) {
  const inMinutes = timeToMinutes(attendance.check_in ?? attendance.time_in);
  const rawOutMinutes = timeToMinutes(attendance.check_out ?? attendance.time_out);
  const startMinutes = timeToMinutes(schedule.start_time);
  const rawEndMinutes = timeToMinutes(schedule.end_time);

  if (inMinutes === null || startMinutes === null || rawEndMinutes === null) {
    return null;
  }

  let endMinutes = rawEndMinutes;
  if (endMinutes <= startMinutes) endMinutes += 1440;

  let outMinutes = rawOutMinutes;
  if (outMinutes !== null && outMinutes < inMinutes) outMinutes += 1440;
  const compensatedMissingOut = outMinutes === null && date < today;
  if (compensatedMissingOut) outMinutes = Math.max(endMinutes, inMinutes);

  const scheduledMinutes = Math.max(0, endMinutes - startMinutes - schedule.break_minutes);
  const rawLateMinutes = Math.max(0, inMinutes - startMinutes);
  const lateMinutes = Math.max(0, rawLateMinutes - LATE_GRACE_MINUTES);
  const workedMinutes = outMinutes === null
    ? 0
    : Math.max(0, outMinutes - inMinutes - schedule.break_minutes);

  return {
    lateMinutes,
    earlyOutMinutes: outMinutes === null ? 0 : Math.max(0, endMinutes - outMinutes),
    overtimeMinutes: outMinutes === null ? 0 : Math.max(0, outMinutes - endMinutes),
    undertimeMinutes: outMinutes === null ? 0 : Math.max(0, scheduledMinutes - workedMinutes),
    totalHours: Math.round((workedMinutes / 60) * 100) / 100,
    status: lateMinutes > 0 ? 'Late' : 'Present',
    remarks: compensatedMissingOut ? MISSING_OUT_COMPENSATION_REMARK : null,
  };
}

function syncTardiness(employee: Record<string, any>, date: string, lateMinutes: number) {
  const points = calculateTardinessPoints(lateMinutes);
  if (lateMinutes <= 0) {
    TardinessPointRepository.deleteByEmployeeAndDate(employee.id, date);
    return;
  }

  TardinessPointRepository.upsert({
    employee_id: employee.id,
    date,
    late_minutes: lateMinutes,
    points,
    year: Number(date.slice(0, 4)),
  });

  if (points >= 0.4) {
    NotificationRepository.createOnce({
      employee_id: employee.id,
      type: 'tardiness_warning',
      message: `${employee.name || 'Employee'} recorded ${lateMinutes} minutes late on ${date} (${points} tardiness points).`,
    });
    NotificationRepository.createOnce({
      employee_id: employee.id,
      type: 'employee_tardiness_ack',
      message: `You recorded ${lateMinutes} minutes late on ${date} (${points} tardiness points). Please confirm that you have been informed.`,
    });
  }
}

export function finalizeAttendanceForRange({ startDate, endDate, employeeIds }: FinalizeOptions) {
  ensureInitialized();
  const now = new Date();
  const today = dateKey();
  const targetEmployeeIds = employeeIds ? new Set(employeeIds) : null;
  const employees = EmployeeRepository.findAll(true)
    .filter((employee) => employee.status === 'Active' && employee.employee_id !== 'FAILSAFE001')
    .filter((employee) => !targetEmployeeIds || targetEmployeeIds.has(employee.id));
  const dates = eachDate(startDate, endDate).filter((date) => date <= today);
  const counts = { created: 0, updated: 0, late: 0, absent: 0, leave: 0, holiday: 0 };

  for (const employee of employees) {
    for (const date of dates) {
      const existing = AttendanceRepository.findByEmployeeAndDate(employee.id, date);
      const schedule = getExpectedSchedule(employee, date);
      const holiday = HolidayRepository.findByDate(date);
      const approvedLeave = isApprovedLeave(employee.id, date);
      const hasPunch = Boolean(existing?.check_in ?? existing?.time_in);

      if (existing && hasPunch && schedule) {
        const metrics = attendanceMetrics(existing, schedule, date, today);
        if (!metrics) continue;

        AttendanceRepository.update(existing.id, {
          shift_id: schedule.shift_id,
          scheduled_in: schedule.start_time,
          scheduled_out: schedule.end_time,
          late_minutes: metrics.lateMinutes,
          early_out_minutes: metrics.earlyOutMinutes,
          overtime_minutes: metrics.overtimeMinutes,
          undertime_minutes: metrics.undertimeMinutes,
          total_hours: metrics.totalHours,
          status: metrics.status,
          remarks: metrics.remarks ?? (existing.remarks === MISSING_OUT_COMPENSATION_REMARK ? null : existing.remarks ?? null),
        });
        syncTardiness(employee, date, metrics.lateMinutes);
        counts.updated++;
        if (metrics.status === 'Late') counts.late++;
        continue;
      }

      if (hasPunch || !schedule) continue;

      if (approvedLeave) {
        const payload = {
          shift_id: schedule.shift_id,
          scheduled_in: schedule.start_time,
          scheduled_out: schedule.end_time,
          status: 'On Leave',
          remarks: 'Auto-detected from approved leave',
        };
        existing
          ? AttendanceRepository.update(existing.id, payload)
          : AttendanceRepository.create({ employee_id: employee.id, date, ...payload });
        existing ? counts.updated++ : counts.created++;
        counts.leave++;
        continue;
      }

      if (holiday) {
        const payload = {
          shift_id: schedule.shift_id,
          scheduled_in: schedule.start_time,
          scheduled_out: schedule.end_time,
          status: 'Holiday',
          remarks: `Auto-detected holiday: ${holiday.name}`,
        };
        existing
          ? AttendanceRepository.update(existing.id, payload)
          : AttendanceRepository.create({ employee_id: employee.id, date, ...payload });
        existing ? counts.updated++ : counts.created++;
        counts.holiday++;
        continue;
      }

      const scheduledEnd = scheduledEndDateTime(date, schedule);
      if (!scheduledEnd || scheduledEnd > now) continue;

      const payload = {
        shift_id: schedule.shift_id,
        scheduled_in: schedule.start_time,
        scheduled_out: schedule.end_time,
        late_minutes: 0,
        early_out_minutes: 0,
        overtime_minutes: 0,
        undertime_minutes: 0,
        total_hours: 0,
        status: 'Absent',
        remarks: 'Auto-detected: no punch on scheduled work day',
      };
      existing
        ? AttendanceRepository.update(existing.id, payload)
        : AttendanceRepository.create({ employee_id: employee.id, date, ...payload });
      existing ? counts.updated++ : counts.created++;
      counts.absent++;
    }
  }

  return counts;
}
